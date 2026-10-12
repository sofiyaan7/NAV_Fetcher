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

import sys
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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
    allow_methods=["GET"],
    allow_headers=["*"],
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
