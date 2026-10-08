"""Net flows from AMFI daily AUM and NAV -- the Cash Pile method.

Net flow = AUM - previous published AUM x NAV end / NAV start.

Guards against the problems found in AMFI's feed:
  * Axis, JM and quant file each day's AUM one day late (their AUM moves the
    day after their NAV), so their market move is stripped with the NAVs one
    NAV date earlier. The AUM keeps its own date.
  * AMFI repeats a scheme's previous AUM ('^' on its page) or leaves a scheme
    out on a day; no flow is booked then, and the next published AUM carries
    the whole movement with the NAV pair spanning the gap.
  * Carried and monthly-fallback AUMs are never measured against.
  * An active fund's one-day flow above 25% of AUM is a data error.
  * A day on which AUMs did not move with NAVs (31-Mar/1-Apr) is skipped.
"""

import inspect
import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import nav_fetcher
from nav_fetcher import calculate_flows_for_dataframe, is_lagged_amc

META = ["Asset Class", "Scheme Code", "ISIN Div Payout / ISIN Growth",
        "ISIN Div Reinvestment", "Scheme Name", "Plan Type", "Option Type"]
DATES = ["01-Sep-2026", "02-Sep-2026", "03-Sep-2026", "04-Sep-2026"]


def _frame(name, code, navs, aums, live=None, asset="Open Ended Schemes(Equity Scheme - Large Cap Fund)",
           dates=DATES):
    n = len(dates)
    df = pd.DataFrame({
        "Asset Class": [asset] * n,
        "Scheme Name": [name] * n,
        "Scheme Code": [code] * n,
        "ISIN Div Payout / ISIN Growth": [f"INF{code:09d}"] * n,
        "ISIN Div Reinvestment": [""] * n,
        "Plan Type": ["Regular"] * n,
        "Option Type": ["Growth"] * n,
        "NAV Date": dates,
        "NAV": list(navs),
        "AUM": list(aums),
    })
    if live is not None:
        df["_aum_live"] = live
    return df


def _flows(df):
    out = calculate_flows_for_dataframe(df, "2026-09-01", META)
    return {d: f for d, f in zip(out["NAV Date"], out["Net flows on current day"])}


# ─── formula ──────────────────────────────────────────────────────────────────

def test_flow_is_aum_change_after_market_move():
    df = _frame("HDFC Large Cap Fund", 1, [100, 110, 110, 121], [1000, 1150, 1150, 1265],
                live=[True, True, False, True])
    f = _flows(df)
    assert f["02-09-2026"] == pytest.approx(1150 - 1000 * 110 / 100)       # 50
    # 03-Sep: AUM not published ('^') -> no flow; 04-Sep spans both days
    assert f["03-09-2026"] == 0.0
    assert f["04-09-2026"] == pytest.approx(1265 - 1150 * 121 / 110)       # 0


def test_repeated_aum_is_not_a_flow_and_the_next_day_spans_the_gap():
    # AMFI served 1150 twice while the NAV fell 10%: arithmetically impossible
    df = _frame("Kotak Midcap Fund", 2, [100, 110, 99, 99], [1000, 1150, 1150, 1040])
    f = _flows(df)
    assert f["03-09-2026"] == 0.0
    assert f["04-09-2026"] == pytest.approx(1040 - 1150 * 99 / 110)


def test_carried_and_fallback_aum_are_never_measured():
    df = _frame("SBI Small Cap Fund", 3, [100, 101, 102, 103], [1000, 999, 777, 1030],
                live=[True, False, False, True])
    f = _flows(df)
    assert f["02-09-2026"] == 0.0 and f["03-09-2026"] == 0.0
    assert f["04-09-2026"] == pytest.approx(1030 - 1000 * 103 / 100)


def test_scheme_missing_from_amfi_list_is_bridged():
    df = _frame("Nippon India Japan Equity Fund", 4, [10, 10.2, None, 10.5], [500, 510, None, 530])
    f = _flows(df)
    assert f["04-09-2026"] == pytest.approx(530 - 510 * 10.5 / 10.2)


# ─── one-day-late AMCs ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("name", ["quant Small Cap Fund", "Axis Large Cap Fund",
                                  "Axis Quant Fund", "JM Flexicap Fund"])
def test_lagged_amcs_use_the_previous_nav_date(name):
    assert is_lagged_amc(name)
    df = _frame(name, 5, [100, 110, 121, 121], [1000, 1000, 1100, 1210])
    f = _flows(df)
    # AUM of 03-Sep reflects the 02-Sep NAV move (100 -> 110): 1100 = 1000 x 1.1
    assert f["03-09-2026"] == pytest.approx(1100 - 1000 * 110 / 100)
    assert f["04-09-2026"] == pytest.approx(1210 - 1100 * 121 / 110)


@pytest.mark.parametrize("name", ["Quantum Value Fund", "Aditya Birla Sun Life Quant Fund",
                                  "HDFC Mid Cap Fund", "JMX Fund"])
def test_other_amcs_use_the_same_day_nav(name):
    assert not is_lagged_amc(name)
    df = _frame(name, 6, [100, 110, 121, 121], [1000, 1100, 1210, 1210])
    f = _flows(df)
    assert f["02-09-2026"] == pytest.approx(0.0)
    assert f["03-09-2026"] == pytest.approx(0.0)


def test_displayed_nav_is_the_real_published_nav():
    df = _frame("quant Small Cap Fund", 7, [100, 101, 102, 103], [1000, 1010, 1020, 1030])
    out = calculate_flows_for_dataframe(df, "2026-09-01", META)
    assert list(out["NAVs"]) == [100, 101, 102, 103]
    assert list(out["Actual AUM as on current date"]) == [1000, 1010, 1020, 1030]


# ─── data-error guards ─────────────────────────────────────────────────────────

def test_implausible_one_day_flow_of_an_active_fund_is_not_booked():
    # DSP Value Fund shown at 5,237cr instead of ~1,760cr
    df = _frame("DSP Value Fund", 8, [23.4, 23.3, 23.3, 23.4], [1758, 5237, 1760, 1765])
    f = _flows(df)
    assert f["02-09-2026"] == 0.0
    assert any("DSP Value Fund" in n for n in nav_fetcher._LAST_FLOW_NOTES)


def test_large_etf_creation_is_allowed():
    df = _frame("SBI Nifty 50 ETF", 9, [100, 100, 100, 100], [1000, 1500, 1500, 1500],
                asset="Open Ended Schemes(Other Scheme - Other  ETFs)")
    assert _flows(df)["02-09-2026"] == pytest.approx(500)


def test_out_of_sync_day_is_skipped_and_rolled_forward():
    # 60 active schemes; on 02-Sep every AUM ignored a 2% NAV rise
    frames = []
    for k in range(60):
        frames.append(_frame(f"Fund {k} Large Cap", 100 + k, [100, 102, 102, 103],
                             [1000, 1000.5 + k / 100, 1020 + k / 100, 1030 + k / 100]))
    df = pd.concat(frames, ignore_index=True)
    out = calculate_flows_for_dataframe(df, "2026-09-01", META)
    day2 = out[out["NAV Date"] == "02-09-2026"]["Net flows on current day"]
    assert (day2 == 0.0).all()
    day3 = out[(out["NAV Date"] == "03-09-2026") & (out["Scheme Code"] == 100)]["Net flows on current day"]
    assert float(day3.iloc[0]) == pytest.approx(1020 - 1000 * 102 / 100)


# ─── AMFI fetch ───────────────────────────────────────────────────────────────

def test_only_one_fetch_implementation():
    src = inspect.getsource(nav_fetcher)
    assert src.count("def fetch_performance_data_from_api(") == 1


def test_rows_for_an_older_day_are_dropped_and_not_cached(monkeypatch, tmp_path):
    class Resp:
        status_code = 200
        def json(self):
            return {"validationMsg": "SUCCESS", "data": [
                {"schemeName": "X Fund", "navDate": "06-Oct-2026", "dailyAUM": 10.0}]}

    class Session:
        def post(self, *a, **k):
            return Resp()

    monkeypatch.setattr(nav_fetcher, "API_CACHE_DIR", str(tmp_path))
    monkeypatch.setattr(nav_fetcher, "get_api_session", lambda: Session())
    rows = nav_fetcher.fetch_performance_data_from_api("07-Oct-2026", 1, 1, 1)
    assert rows == []
    assert list(tmp_path.iterdir()) == []


def test_latest_navs_read_columns_by_header(monkeypatch):
    text = ("Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;"
            "Net Asset Value;Date\n\nAxis Mutual Fund\n"
            "1;INF000000001;-;Axis Large Cap Fund;Regular;Growth;66.33;07-Oct-2026\n")

    class Resp:
        def raise_for_status(self):
            pass
    r = Resp()
    r.text = text
    monkeypatch.setattr(nav_fetcher.requests, "get", lambda *a, **k: r)
    got = nav_fetcher.fetch_latest_navs(["INF000000001"])
    assert got["INF000000001"]["nav"] == 66.33
    assert got["INF000000001"]["date"] == "07-Oct-2026"
