"""Standalone re-implementation of the net-flow calculation, for checking.

The real logic lives in nav_fetcher.calculate_flows_for_dataframe() (around
line 1115). This file restates the same arithmetic in one short function with
nothing else around it, then runs both over the same data and diffs them, so
you can satisfy yourself the formula is what you think it is.

    python3 verify_flows.py

The formula
-----------
    net flow = AUM_now - AUM_anchor * (NAV_now / NAV_anchor)

"AUM_anchor" is the last AUM AMFI actually published, not simply yesterday's
row. The second term is what the anchor AUM would have grown to on market
movement alone, so subtracting it leaves the money that came in or went out.

Four rules sit on top of the formula:

1. Only genuinely published AUMs anchor. A repeated figure ('^'), a carried
   value or the monthly fallback books no flow -- the next real AUM covers the
   whole gap, and its NAV pair spans the gap too, so no market move is lost.
2. Axis, JM and quant file AUM one day late, so their market move is stripped
   with the *previous* NAV date's NAV. Every other AMC uses the day's own NAV.
3. If a scheme is missing from AMFI's list for more than MAX_BRIDGE_DAYS (14),
   the anchor is dropped rather than compared across too long a gap.
4. A one-day flow above MAX_SCHEME_FLOW_SHARE (25%) of an active fund's AUM is
   treated as a data error and booked as zero.

Not reproduced here: _out_of_sync_days(), which needs 50+ schemes on a day to
judge, so it cannot be shown on a toy example.
"""

import pandas as pd

MAX_BRIDGE_DAYS = 14
MAX_SCHEME_FLOW_SHARE = 0.25
LAGGED_AMCS = ("quant", "axis", "jm")       # file AUM one day late


def net_flows(rows):
    """rows: list of dicts with date, nav, aum, published. Oldest first.

    Returns the same rows with prev_aum / return_pct / derived / flow filled in.
    One scheme at a time -- the real function groups by Scheme Code and does
    exactly this per group.
    """
    out, anchor = [], None      # anchor = (aum, flow_nav, date)
    prev_nav = None

    for r in rows:
        date, nav, aum = r["date"], r["nav"], r["aum"]

        # Rule 2: lagged AMCs strip the move with the previous NAV date's NAV.
        flow_nav = prev_nav if r.get("lagged") else nav
        prev_nav = nav

        rec = {"date": date, "nav": nav, "aum": aum, "published": r["published"],
               "prev_aum": None, "return_pct": None, "derived": None, "flow": None}

        # Rule 3: too long since the last published AUM to compare.
        if anchor and (date - anchor[2]).days > MAX_BRIDGE_DAYS:
            anchor = None

        if anchor:
            rec["prev_aum"] = anchor[0]

        usable = r["published"] and flow_nav not in (None, 0) and pd.notna(aum)

        # Rule 1: nothing new published -> no flow; keep the existing anchor.
        if anchor is None or not usable or float(aum) == float(anchor[0]):
            rec["flow"] = 0.0 if anchor else None
            if anchor is None and usable:
                anchor = (float(aum), float(flow_nav), date)
            out.append(rec)
            continue

        growth  = float(flow_nav) / anchor[1]
        derived = anchor[0] * growth
        flow    = float(aum) - derived

        rec["return_pct"] = (growth - 1) * 100
        rec["derived"]    = derived
        # Rule 4: implausibly large one-day flow is a data error, not a flow.
        rec["flow"] = 0.0 if abs(flow) > MAX_SCHEME_FLOW_SHARE * anchor[0] else flow

        anchor = (float(aum), float(flow_nav), date)
        out.append(rec)

    return pd.DataFrame(out)


def demo():
    d = lambda s: pd.Timestamp(s)
    rows = [
        # NAV rises 1% a day. AUM that grows purely with NAV = zero flow.
        {"date": d("2026-09-01"), "nav": 100.0, "aum": 1000.0, "published": True},
        {"date": d("2026-09-02"), "nav": 101.0, "aum": 1010.0, "published": True},
        # 50cr subscription on top of the market move.
        {"date": d("2026-09-03"), "nav": 102.0, "aum": 1070.0, "published": True},
        # AMFI repeats yesterday's figure: no flow booked here...
        {"date": d("2026-09-04"), "nav": 103.0, "aum": 1070.0, "published": True},
        # ...and this day is measured all the way back to 03-Sep.
        {"date": d("2026-09-05"), "nav": 104.0, "aum": 1100.0, "published": True},
    ]
    df = net_flows(rows)
    pd.set_option("display.width", 140)
    print("Worked example — NAV +1%/day\n")
    print(df.to_string(index=False, float_format=lambda v: f"{v:,.4f}"))
    print("""
Reading it:
  02-Sep  AUM 1000 -> 1010 is exactly the 1% market move, so flow = 0.
  03-Sep  1010 would have become 1020 on market alone; actual 1070, so +50.
  04-Sep  AUM repeated (1070 = 1070): no new information, flow = 0.
  05-Sep  measured from the 03-Sep anchor across two days of NAV
          (102 -> 104), not from the repeated figure.""")


def compare_with_the_app():
    """Same numbers through nav_fetcher's real function; the flows must match."""
    try:
        from nav_fetcher import calculate_flows_for_dataframe
    except Exception as exc:                                   # pragma: no cover
        print("\n(could not import nav_fetcher:", exc, ")")
        return

    dates = ["01-Sep-2026", "02-Sep-2026", "03-Sep-2026", "04-Sep-2026", "05-Sep-2026"]
    navs  = [100.0, 101.0, 102.0, 103.0, 104.0]
    aums  = [1000.0, 1010.0, 1070.0, 1070.0, 1100.0]

    df = pd.DataFrame({
        "Asset Class": ["Equity"] * 5, "Scheme Name": ["Example Large Cap Fund"] * 5,
        "Scheme Code": [1] * 5, "ISIN Div Payout / ISIN Growth": ["INF000000001"] * 5,
        "ISIN Div Reinvestment": [""] * 5, "Plan Type": ["Regular"] * 5,
        "Option Type": ["Growth"] * 5, "NAV Date": dates, "NAV": navs, "AUM": aums,
        "_aum_live": [True] * 5,
    })
    meta = ["Asset Class", "Scheme Code", "ISIN Div Payout / ISIN Growth",
            "ISIN Div Reinvestment", "Scheme Name", "Plan Type", "Option Type"]
    app = calculate_flows_for_dataframe(df, "2026-09-01", meta)

    mine = net_flows([{"date": pd.Timestamp(d), "nav": n, "aum": a, "published": True}
                      for d, n, a in zip(dates, navs, aums)])["flow"].tolist()
    theirs = [None if pd.isna(v) else float(v)
              for v in pd.to_numeric(app["Net flows on current day"], errors="coerce")]

    print("\n\nAgainst nav_fetcher.calculate_flows_for_dataframe()\n")
    print(pd.DataFrame({"date": dates, "this file": mine, "nav_fetcher": theirs})
          .to_string(index=False))
    blank = lambda v: v is None or (isinstance(v, float) and pd.isna(v))
    same = all((blank(a) and blank(b)) or
               (not blank(a) and not blank(b) and abs(a - b) < 1e-6)
               for a, b in zip(mine, theirs))
    print("\nIdentical:", same)


if __name__ == "__main__":
    demo()
    compare_with_the_app()
