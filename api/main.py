"""HTTP API over the existing NAV Fetcher logic.

Why this exists
---------------
The Streamlit app is one process that both renders the UI and does the work.
Vercel cannot host that: it runs serverless functions, while Streamlit needs a
persistent process holding a WebSocket per session, and this app budgets up to
an hour (AUM_BUDGET_SECONDS) for a single AUM pull. So the UI moves to Next.js
on Vercel and the Python stays here, behind HTTP, on a container host.

Nothing is reimplemented. Every endpoint calls the same functions the Streamlit
pages call, so the numbers cannot drift between the two front ends.

The speed problem
-----------------
Fund Performance had no way to ask for one fund. Picking Equity -> ALL matches
2,452 scheme rows and pulls every one across the whole date range -- about
466,000 NAV rows for a default run -- because the page resolves a *category* to
ISINs and exports all of them. /funds plus a single-ISIN /performance is the
fix: one fund over the same window is ~190 rows.
"""

from __future__ import annotations

import json
import os
import sys
import uuid
from collections import OrderedDict
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from amfi_nav import LATEST_CACHE_FILE                      # noqa: E402
from app import run_historical_export, select_regular_growth_isins  # noqa: E402
from nav_fetcher import map_section_to_ids                  # noqa: E402

app = FastAPI(
    title="NAV Fetcher API",
    version="1.0.0",
    description="AMFI mutual fund NAV, AUM and net flows.",
)

# The Next.js front end is served from another origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten to the Vercel domain before going live
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    # Without this the browser hides these from JS on a cross-origin response,
    # so the download lands under a default name and the row count is lost.
    expose_headers=["Content-Disposition", "X-Row-Count", "X-Note"],
)

ISIN_COL = "ISIN Div Payout/ ISIN Growth"


# ─── Scheme index ─────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _index() -> pd.DataFrame:
    """The AMFI scheme index, one row per scheme/plan/option.

    Cached: it is a file on disk that the fetcher refreshes, not per-request work.
    """
    if not LATEST_CACHE_FILE.exists():
        raise HTTPException(503, "Scheme index cache is missing; run the fetcher once.")
    df = pd.read_csv(LATEST_CACHE_FILE)
    df["_isin"] = df[ISIN_COL].astype(str).str.strip().str.upper()
    df["_name_lower"] = df["Scheme Name"].astype(str).str.lower()
    return df


class Fund(BaseModel):
    isin: str
    scheme_name: str
    amc: str
    asset_class: str
    plan_type: Optional[str] = None
    option_type: Optional[str] = None
    latest_nav: Optional[float] = None
    latest_nav_date: Optional[str] = None


class Performance(BaseModel):
    isin: str
    scheme_name: str
    start: str
    end: str
    row_count: int
    columns: List[str]
    rows: List[dict]
    note: Optional[str] = None


@app.get("/health")
def health() -> dict:
    try:
        n = len(_index())
    except HTTPException:
        n = 0
    return {"status": "ok", "schemes_indexed": n}


@app.get("/funds", response_model=List[Fund])
def funds(
    q: str = Query("", description="Case-insensitive substring of the scheme name"),
    limit: int = Query(50, ge=1, le=500),
    regular_growth_only: bool = Query(
        True, description="Drop Direct plans and IDCW/Bonus options, as the reports do"),
) -> List[Fund]:
    """Searchable fund list — this is what the dropdown reads.

    Returning a filtered page rather than all 14,371 rows is deliberate: the
    dropdown should be typeahead, not a download.
    """
    df = _index()
    if regular_growth_only:
        isins, *_ = select_regular_growth_isins(df)
        df = df[df["_isin"].isin(set(isins))]
    if q:
        df = df[df["_name_lower"].str.contains(q.strip().lower(), regex=False, na=False)]

    df = df.drop_duplicates("_isin").head(limit)
    out: List[Fund] = []
    for _, r in df.iterrows():
        nav = pd.to_numeric(r.get("NAV"), errors="coerce")
        out.append(Fund(
            isin=r["_isin"],
            scheme_name=str(r.get("Scheme Name", "")),
            amc=str(r.get("AMC Name", "")),
            asset_class=str(r.get("Asset Class", "")),
            plan_type=(None if pd.isna(r.get("Plan Type")) else str(r.get("Plan Type"))),
            option_type=(None if pd.isna(r.get("Option Type")) else str(r.get("Option Type"))),
            latest_nav=(None if pd.isna(nav) else float(nav)),
            latest_nav_date=(None if pd.isna(r.get("NAV Date")) else str(r.get("NAV Date"))),
        ))
    return out


@app.get("/performance", response_model=Performance)
def performance(
    isin: str = Query(..., min_length=8, description="One scheme's ISIN"),
    start: date = Query(..., description="YYYY-MM-DD"),
    end: date = Query(..., description="YYYY-MM-DD"),
    want_nav: bool = True,
    want_aum: bool = True,
    want_flows: bool = True,
    fetch_live_aum: bool = Query(
        True, description="Pull AMFI's published daily AUM. Off is much faster."),
    carry_forward: bool = True,
    skip_saturdays: bool = True,
    skip_sundays: bool = True,
) -> Performance:
    """NAV, AUM and net flows for **one** fund.

    Same call the Streamlit page makes, with a single ISIN instead of a whole
    category -- which is the entire speed difference.
    """
    if start > end:
        raise HTTPException(400, "start must not be after end")

    key = str(isin).strip().upper()
    df_idx = _index()
    match = df_idx[df_idx["_isin"] == key]
    if match.empty:
        raise HTTPException(404, f"ISIN {key} is not in the AMFI scheme index")
    scheme_name = str(match.iloc[0].get("Scheme Name", key))

    df, _is_aum_only, err = run_historical_export(
        parsed_isins=[key],
        start_date=start,
        end_date=end,
        carry_forward=carry_forward,
        skip_sundays=skip_sundays,
        want_nav=want_nav,
        want_aum=want_aum,
        want_flows=want_flows,
        fetch_live_aum=fetch_live_aum,
        skip_saturdays=skip_saturdays,
    )
    if df is None or df.empty:
        raise HTTPException(404, err or "AMFI returned no rows for that fund and window")

    clean = df.where(pd.notna(df), None)
    return Performance(
        isin=key, scheme_name=scheme_name,
        start=start.isoformat(), end=end.isoformat(),
        row_count=len(clean), columns=[str(c) for c in clean.columns],
        rows=clean.to_dict(orient="records"), note=err,
    )


@app.get("/categories")
def categories() -> dict:
    """The maturity / category / sub-category ids the AMFI feed uses."""
    return {
        "maturity": {"Open Ended": 1, "Close Ended": 2, "Interval": 2},
        "category": {"Equity": 1, "Debt": 2, "Hybrid": 3,
                     "Solution Oriented": 4, "Other": 5},
    }


# ─── Historical ISIN export ───────────────────────────────────────────────────

class ExportRequest(BaseModel):
    """Mirrors the Streamlit page's controls one for one."""
    isins: List[str] = Field(..., min_length=1, description="Target ISINs")
    start: date
    end: date
    carry_forward: bool = True          # Carry forward NAV on holidays/weekends
    skip_saturdays: bool = True         # Skip Saturdays
    skip_sundays: bool = True           # Skip Sundays
    want_nav: bool = True               # Want NAV
    want_aum: bool = True               # Want AUM
    want_flows: bool = True             # Want Flows
    fetch_live_aum: bool = True         # Fetch actual daily AUM from AMFI (slower)


@app.post("/export/historical")
def export_historical(req: ExportRequest) -> Response:
    """The 'Fetch & generate Excel' button: a styled .xlsx for a list of ISINs.

    Returns the workbook itself rather than JSON, so the browser can hand it
    straight to a download the way st.download_button did.
    """
    if req.start > req.end:
        raise HTTPException(400, "start must not be after end")

    cleaned = [i.strip().upper() for i in req.isins if i and i.strip()]
    if not cleaned:
        raise HTTPException(400, "No usable ISINs were supplied")

    df, is_aum_only, err = run_historical_export(
        parsed_isins=cleaned, start_date=req.start, end_date=req.end,
        carry_forward=req.carry_forward, skip_sundays=req.skip_sundays,
        want_nav=req.want_nav, want_aum=req.want_aum, want_flows=req.want_flows,
        fetch_live_aum=req.fetch_live_aum, skip_saturdays=req.skip_saturdays,
    )
    if df is None or df.empty:
        raise HTTPException(404, err or "AMFI returned no rows for those ISINs and dates")

    from nav_fetcher import build_date_cols, style_excel          # local: heavy import
    date_cols = build_date_cols(req.start, req.end,
                                skip_sunday=req.skip_sundays, skip_saturday=req.skip_saturdays)
    present = [c for c in date_cols if c in df.columns] or [
        c for c in df.columns if c not in ("Scheme Name", "ISIN Div Payout / ISIN Growth")]
    try:
        blob = style_excel(df, present, is_aum_only=is_aum_only)
    except Exception as exc:                                       # pragma: no cover
        raise HTTPException(500, f"Could not write the workbook: {exc}") from exc

    stamp = f"{req.start:%Y%m%d}_{req.end:%Y%m%d}"
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="nav_export_{stamp}.xlsx"',
                 "X-Row-Count": str(len(df)), "X-Note": err or ""},
    )


# ─── AUM cache ────────────────────────────────────────────────────────────────

@app.get("/aum-cache/stats")
def aum_cache_stats() -> dict:
    """What the AUM Cache page reports: how much has been collected, and whether
    the Hugging Face sync is even available on this machine."""
    import aum_backfill
    import aum_cache_sync

    summary = aum_backfill.cache_summary()
    ok, why = aum_cache_sync.available()
    return {
        "files": summary.get("files", 0),
        "dates": summary.get("dates", 0),
        "mb": summary.get("mb", 0),
        "earliest": summary.get("earliest"),
        "latest": summary.get("latest"),
        "sync_available": ok,
        "sync_detail": why,
        "repo": aum_cache_sync.repo_id(),
    }


# ─── MIS Generator ────────────────────────────────────────────────────────────
#
# Generating a pack costs an AMFI pass that can run into minutes, so a build is
# done once and kept in memory under an id. The Excel and PDF endpoints then
# write from that same result instead of fetching all over again, which is what
# the Streamlit page got for free by holding it in session state.

_MIS_RESULTS: "OrderedDict[str, dict]" = OrderedDict()
_MIS_KEEP = 8


def _remember(result: dict) -> str:
    rid = uuid.uuid4().hex[:12]
    _MIS_RESULTS[rid] = result
    while len(_MIS_RESULTS) > _MIS_KEEP:
        _MIS_RESULTS.popitem(last=False)
    return rid


def _recall(rid: str) -> dict:
    data = _MIS_RESULTS.get(rid)
    if data is None:
        raise HTTPException(
            404, "That report is no longer held in memory. Generate it again.")
    return data


class Holding(BaseModel):
    scheme_name: str = Field(..., alias="Scheme Name")
    isin: str = Field(..., alias="ISIN")
    allocation: float = Field(..., alias="Allocation (%)")
    benchmark: str = Field("", alias="Benchmark")

    model_config = {"populate_by_name": True}


class MisRequest(BaseModel):
    """The MIS page's controls, one for one."""
    portfolio: List[Holding]
    previous_portfolio: Optional[List[Holding]] = None
    start_date: date                       # Period Start Date
    end_date: date                         # Report Date
    include_flows: bool = False            # Include Flows column
    since_inception: bool = False          # Measure new funds from inception
    skip_saturdays: bool = True            # Skip Saturday / Sunday NAV marks
    mis3_start: Optional[date] = None      # Use a separate date range for MIS 3
    mis3_end: Optional[date] = None


def _frame(rows: List[Holding]) -> "pd.DataFrame":
    return pd.DataFrame([
        {"Scheme Name": h.scheme_name, "ISIN": h.isin,
         "Allocation (%)": h.allocation, "Benchmark": h.benchmark}
        for h in rows
    ])


@app.get("/mis/default-portfolio")
def mis_default_portfolio() -> dict:
    """The sample template the 'Reset Sample Template' button restores."""
    from mis_generator import DEFAULT_SAMPLE_PORTFOLIO
    return {"portfolio": DEFAULT_SAMPLE_PORTFOLIO}


@app.post("/mis/previous-portfolio")
def mis_previous_portfolio(portfolio: List[Holding]) -> dict:
    """The 'Model Portfolio History' source: the most recent rebalance that is
    genuinely different from the portfolio supplied."""
    import model_portfolio

    block = model_portfolio.previous_portfolio(_frame(portfolio))
    if block is None:
        return {"found": False, "detail":
                "No earlier portfolio in the rebalance history file.", "portfolio": []}
    frame = block.frame.where(pd.notna(block.frame), None)
    return {
        "found": True,
        "effective": block.effective.isoformat(),
        "announced": block.announced.isoformat() if block.announced else None,
        "label": block.label,
        "unmapped": block.unmapped,
        "portfolio": frame.to_dict(orient="records"),
    }


@app.post("/mis/generate")
def mis_generate(req: MisRequest) -> dict:
    """The 'Generate MIS Reports' button."""
    from mis_generator import generate_mis_reports_data, validate_and_normalize_portfolio

    if req.start_date > req.end_date:
        raise HTTPException(400, "Period start must not be after the report date")

    clean, warns, errs = validate_and_normalize_portfolio(_frame(req.portfolio))
    if errs:
        raise HTTPException(400, "; ".join(errs))

    prev_clean = None
    if req.previous_portfolio:
        prev_clean, prev_warns, _ = validate_and_normalize_portfolio(_frame(req.previous_portfolio))
        warns = list(warns) + [f"Previous portfolio: {w}" for w in prev_warns]
        if prev_clean.empty:
            prev_clean = None

    try:
        result = generate_mis_reports_data(
            portfolio_df=clean,
            start_date=req.start_date,
            end_date=req.end_date,
            previous_portfolio_df=prev_clean,
            include_flows=req.include_flows,
            skip_saturdays=req.skip_saturdays,
            mis3_start=req.mis3_start,
            mis3_end=req.mis3_end,
            since_inception=req.since_inception,
        )
    except Exception as exc:
        raise HTTPException(500, f"MIS build failed: {exc}") from exc

    rid = _remember(result)

    def tables(block) -> list:
        """MIS 1, 2 and 3 as plain rows the browser can render.

        A block is a dict carrying mis1/mis2/mis3 specs; each spec holds its
        rows as a DataFrame plus the display headers the report prints, which
        are not the same as the internal column names.
        """
        if not isinstance(block, dict):
            return []
        out = []
        for key in ("mis1", "mis2", "mis3"):
            spec = block.get(key)
            if not isinstance(spec, dict):
                continue
            frame = spec.get("rows")
            if frame is None or getattr(frame, "empty", True):
                continue
            safe = frame.where(pd.notna(frame), None)
            headers = spec.get("headers") or {}
            cols = [str(c) for c in (spec.get("columns") or safe.columns)]
            out.append({
                "key": key,
                "title": str(spec.get("title", "")),
                "columns": cols,
                "headers": [str(headers.get(c, c)) for c in cols],
                "rows": safe.to_dict(orient="records"),
                "footers": [
                    {"label": str(f.get("label", "")),
                     "values": {str(k): (None if pd.isna(v) else v)
                                for k, v in (f.get("values") or {}).items()}}
                    for f in (spec.get("footers") or []) if isinstance(f, dict)
                ],
                "pct_cols": [str(c) for c in (spec.get("pct_cols") or [])],
                "colour_cols": [str(c) for c in (spec.get("colour_cols") or [])],
            })
        return out

    dates = {k: (v.isoformat() if hasattr(v, "isoformat") else v)
             for k, v in (result.get("dates") or {}).items()}
    bench = result.get("benchmark_report")
    return {
        "report_id": rid,
        "dates": dates,
        "warnings": list(warns) + list(result.get("warnings") or []),
        "include_flows": bool(result.get("include_flows")),
        "current": tables(result.get("current")),
        "previous": tables(result.get("previous")),
        "benchmarks": (bench.where(pd.notna(bench), None).to_dict(orient="records")
                       if bench is not None and not getattr(bench, "empty", True) else []),
    }


@app.get("/mis/{report_id}/export")
def mis_export(report_id: str, fmt: str = Query("xlsx", pattern="^(xlsx|pdf)$")) -> Response:
    """The two download buttons, written from the held result."""
    from mis_generator import export_mis_to_excel, export_mis_to_pdf

    data = _recall(report_id)
    try:
        blob = export_mis_to_excel(data) if fmt == "xlsx" else export_mis_to_pdf(data)
    except Exception as exc:
        raise HTTPException(500, f"Could not write the {fmt.upper()}: {exc}") from exc

    media = ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
             if fmt == "xlsx" else "application/pdf")
    stamp = datetime.now().strftime("%Y%m%d")
    return Response(
        content=blob, media_type=media,
        headers={"Content-Disposition": f'attachment; filename="MIS_Report_{stamp}.{fmt}"'},
    )


# ─── Fund Performance by category ─────────────────────────────────────────────
#
# The Streamlit page selects a *category*, resolves it to every matching scheme
# and exports all of them. That is what made it slow, but it is also how you ask
# "how did every large cap fund do", so both ways in are kept: this, and the
# single-ISIN /performance above.

MATURITY_IDS = {"Open Ended": 1, "Close Ended": 2, "Interval": 2}
CATEGORY_IDS = {"Equity": 1, "Debt": 2, "Hybrid": 3, "Solution Oriented": 4, "Other": 5}


@app.get("/subcategories")
def subcategories(category_id: int = Query(..., ge=1, le=5)) -> dict:
    """The Subcategory dropdown. Falls back to the last good answer, then to the
    built-in SEBI list, so a failing AMFI endpoint makes the list stale rather
    than empty."""
    from app import load_subcategories

    items, source = load_subcategories(category_id)
    return {
        "source": source,
        "subcategories": [{"name": n, "id": i} for n, i in items if n],
    }


class CategoryRequest(BaseModel):
    """The Fund Performance page's controls, one for one."""
    maturity_type: str = "Open Ended"
    category: str = "Equity"
    subcategory_id: Optional[int] = None    # None means ALL
    start: date
    end: date
    carry_forward: bool = True
    skip_saturdays: bool = True
    skip_sundays: bool = True
    want_nav: bool = True
    want_aum: bool = True
    want_flows: bool = True
    fetch_live_aum: bool = True


def _isins_for_category(maturity_id: int, cat_id: int, sub_id) -> tuple:
    """Every Regular Growth scheme in the chosen category, the way the page does it."""
    df = _index()
    keep = []
    for _, row in df.iterrows():
        m, c, s = map_section_to_ids(row.get("Asset Class", ""))
        if m == maturity_id and c == cat_id and (sub_id is None or s == sub_id):
            keep.append(row)
    if not keep:
        return [], 0, 0, 0
    matched = pd.DataFrame(keep)
    isins, n_kept, n_direct, n_option = select_regular_growth_isins(matched)
    return isins, len(matched), n_direct, n_option


@app.post("/performance/category")
def performance_by_category(req: CategoryRequest) -> dict:
    """The 'GO' button: NAV, AUM and flows for every scheme in a category.

    This is the heavy path by nature -- Equity/ALL is 2,452 scheme rows -- so the
    count it matched is reported alongside the rows.
    """
    if req.start > req.end:
        raise HTTPException(400, "start must not be after end")
    m_id = MATURITY_IDS.get(req.maturity_type)
    c_id = CATEGORY_IDS.get(req.category)
    if m_id is None or c_id is None:
        raise HTTPException(400, "Unknown maturity type or category")

    isins, matched_rows, n_direct, n_option = _isins_for_category(m_id, c_id, req.subcategory_id)
    if not isins:
        raise HTTPException(404, "No schemes in the AMFI index match that selection")

    df, _aum_only, err = run_historical_export(
        parsed_isins=list(isins), start_date=req.start, end_date=req.end,
        carry_forward=req.carry_forward, skip_sundays=req.skip_sundays,
        want_nav=req.want_nav, want_aum=req.want_aum, want_flows=req.want_flows,
        fetch_live_aum=req.fetch_live_aum, skip_saturdays=req.skip_saturdays,
    )
    if df is None or df.empty:
        raise HTTPException(404, err or "AMFI returned no rows for that selection")

    clean = df.where(pd.notna(df), None)
    return {
        "matched_scheme_rows": matched_rows,
        "regular_growth_funds": len(isins),
        "excluded_direct": n_direct,
        "excluded_options": n_option,
        "row_count": len(clean),
        "columns": [str(c) for c in clean.columns],
        "rows": clean.to_dict(orient="records"),
        "note": err,
    }


# ─── Portfolio Bucket Tracker ─────────────────────────────────────────────────
#
# Streamlit held buckets in session_state, which dies with the browser tab. A
# web front end has no equivalent, so they live on the server as one JSON file.
# Same shape, so a bucket made here is the bucket the Streamlit page would make.

BUCKET_STORE = ROOT / "bucket_state" / "buckets.json"

DEFAULT_BUCKET = "Default Balanced Portfolio"


def _default_buckets() -> dict:
    from app import DEFAULT_BUCKET_ROWS
    return {DEFAULT_BUCKET: DEFAULT_BUCKET_ROWS}


def _load_buckets() -> dict:
    try:
        if BUCKET_STORE.exists():
            with open(BUCKET_STORE, encoding="utf-8") as fh:
                data = json.load(fh)
            if isinstance(data, dict) and data:
                return data
    except (OSError, ValueError):
        pass                       # unreadable store falls back to the sample
    return _default_buckets()


def _save_buckets(buckets: dict) -> None:
    try:
        BUCKET_STORE.parent.mkdir(parents=True, exist_ok=True)
        tmp = BUCKET_STORE.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(buckets, fh, indent=1)
        os.replace(tmp, BUCKET_STORE)   # atomic: never a half-written store
    except OSError as exc:
        raise HTTPException(500, f"Could not save buckets: {exc}") from exc


class BucketHolding(BaseModel):
    scheme_name: str = Field("", alias="Scheme Name")
    isin: str = Field(..., alias="ISIN")
    weight: float = Field(0.0, alias="Weight (%)")

    model_config = {"populate_by_name": True}


def _holdings_frame(rows) -> "pd.DataFrame":
    return pd.DataFrame([
        {"Scheme Name": r.get("Scheme Name", ""), "ISIN": str(r.get("ISIN", "")).strip().upper(),
         "Weight (%)": float(r.get("Weight (%)") or 0)}
        for r in rows
    ])


@app.get("/buckets")
def list_buckets() -> dict:
    buckets = _load_buckets()
    return {"buckets": [{"name": n, "holdings": h} for n, h in buckets.items()]}


@app.put("/buckets/{name}")
def save_bucket(name: str, holdings: List[dict]) -> dict:
    """Create a bucket or replace its composition."""
    if not name.strip():
        raise HTTPException(400, "A bucket needs a name")
    buckets = _load_buckets()
    buckets[name.strip()] = holdings
    _save_buckets(buckets)
    return {"saved": name.strip(), "holdings": len(holdings)}


@app.delete("/buckets/{name}")
def delete_bucket(name: str) -> dict:
    """Delete Active Bucket. The last one cannot go -- the page needs one."""
    buckets = _load_buckets()
    if name not in buckets:
        raise HTTPException(404, f"No bucket named {name!r}")
    if len(buckets) == 1:
        raise HTTPException(400, "That is the only bucket; create another before deleting it.")
    buckets.pop(name)
    _save_buckets(buckets)
    return {"deleted": name, "remaining": list(buckets)}


class TrackRequest(BaseModel):
    holdings: List[dict]
    start_date: date                 # when the investment started
    initial_amount: float = 100000.0  # Investment Amount (Rs)
    skip_sundays: bool = True


@app.post("/buckets/track")
def track_bucket(req: TrackRequest) -> dict:
    """The 'Track Portfolio' button: run the bucket from its start date to today."""
    from nav_fetcher import run_live_portfolio

    frame = _holdings_frame(req.holdings)
    if frame.empty:
        raise HTTPException(400, "Bucket composition is empty")
    if req.initial_amount <= 0:
        raise HTTPException(400, "Investment amount must be greater than zero")

    try:
        res, err = run_live_portfolio(frame, req.start_date, float(req.initial_amount),
                                      req.skip_sundays)
    except Exception as exc:
        raise HTTPException(500, f"Tracking failed: {exc}") from exc
    if err or res is None:
        raise HTTPException(400, err or "The tracker returned nothing")

    rid = _remember({"kind": "bucket", "res": res})
    tracker = res["tracker"].where(pd.notna(res["tracker"]), None)
    comp = res["composition"].where(pd.notna(res["composition"]), None)
    return {
        "report_id": rid,
        "metrics": {k: (None if (isinstance(v, float) and pd.isna(v)) else v)
                    for k, v in res["metrics"].items()},
        "latest_nav_date": res.get("latest_nav_date"),
        "tracker_columns": [str(c) for c in tracker.columns],
        "tracker": tracker.to_dict(orient="records"),
        "composition_columns": [str(c) for c in comp.columns],
        "composition": comp.to_dict(orient="records"),
    }


@app.get("/buckets/{report_id}/export")
def export_bucket(report_id: str) -> Response:
    """The styled portfolio workbook the Streamlit page downloaded."""
    from nav_fetcher import style_portfolio_excel

    held = _recall(report_id)
    if held.get("kind") != "bucket":
        raise HTTPException(404, "That id is not a tracked bucket")
    try:
        blob = style_portfolio_excel(held["res"])
    except Exception as exc:
        raise HTTPException(500, f"Could not write the workbook: {exc}") from exc
    stamp = datetime.now().strftime("%Y%m%d")
    return Response(
        content=blob,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="portfolio_tracker_{stamp}.xlsx"'},
    )
