"""The model portfolio's rebalance history, read from 'Model Port data.xlsx'.

Why this module exists
----------------------
The MIS report prints two portfolio blocks: the current portfolio and the one
before it. The "before it" block used to come from an in-session carry-over that
is *seeded with a copy of the current portfolio* and only diverges if someone
edits the portfolio editor in that same browser session. The model portfolio is
rebalanced roughly once a year, so in practice it never diverged: every report
printed the same 14 schemes twice.

The workbook is the missing piece -- it records all 39 rebalances since 2013-05-31,
so the previous portfolio can be read rather than remembered.

Two things the workbook does not give us, and how they are handled:

* **Dates.** Sheet 'Actual dates ' carries the date a rebalance was decided and
  sheet 'With Shift ' the date it took effect, typically some weeks later. The
  holdings in the two sheets are identical block for block (asserted by the
  tests), so both dates are attached to one set of holdings rather than picking
  a winner. The effective date is what the UI leads with.

* **Benchmarks.** There is no benchmark column at all. Each scheme's benchmark
  comes from `scheme_benchmarks.json`, keyed by ISIN. An ISIN missing from that
  file is left blank and reported, deliberately: the MIS validator turns a blank
  benchmark into NIFTY 50, and a wrong benchmark that looks plausible is worse
  than a visible gap.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

import pandas as pd

_HERE = Path(__file__).resolve().parent

HISTORY_XLSX = _HERE / "Model Port data.xlsx"
BENCHMARK_MAP_JSON = _HERE / "scheme_benchmarks.json"

#: Sheet holding the date each rebalance took effect.
EFFECTIVE_SHEET = "With Shift "
#: Sheet holding the date each rebalance was decided.
ANNOUNCED_SHEET = "Actual dates "

PORTFOLIO_COLS = ["Scheme Name", "ISIN", "Allocation (%)", "Benchmark"]

# The four columns the workbook actually uses; column 0 is a spacer.
_COL_SCHEME, _COL_ISIN, _COL_DATE, _COL_WEIGHT = 1, 2, 3, 4


# ─── Benchmark map ────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _load_benchmark_map() -> Dict[str, dict]:
    if not BENCHMARK_MAP_JSON.exists():
        return {}
    with open(BENCHMARK_MAP_JSON, encoding="utf-8") as fh:
        raw = json.load(fh)
    # Keys beginning with '_' are documentation, not schemes.
    return {k: v for k, v in raw.items() if not k.startswith("_")}


class _BenchmarkMapping(dict):
    """Read-only view of the ISIN -> benchmark map, loaded on first use."""

    def __getitem__(self, key):  # pragma: no cover - dict protocol
        return _load_benchmark_map()[key]

    def __iter__(self):
        return iter(_load_benchmark_map())

    def __len__(self):
        return len(_load_benchmark_map())

    def items(self):
        return _load_benchmark_map().items()

    def get(self, key, default=None):
        return _load_benchmark_map().get(key, default)


SCHEME_BENCHMARKS = _BenchmarkMapping()


def benchmark_for(isin: str) -> str:
    """Benchmark index for one scheme, or ``""`` when it is not mapped.

    Blank rather than a default on purpose -- see the module docstring.
    """
    entry = _load_benchmark_map().get(str(isin).strip().upper())
    return str(entry.get("benchmark", "")).strip() if entry else ""


def unmapped_schemes(frame: pd.DataFrame) -> List[str]:
    """Scheme names in ``frame`` that have no benchmark, for the UI to name."""
    if frame is None or frame.empty:
        return []
    return [
        str(row["Scheme Name"])
        for _, row in frame.iterrows()
        if not str(row.get("Benchmark", "")).strip()
    ]


# ─── Reading the workbook ─────────────────────────────────────────────────────

@dataclass(frozen=True)
class Rebalance:
    """One dated rebalance of the model portfolio."""

    effective: date              # when it took effect ('With Shift ')
    announced: Optional[date]    # when it was decided ('Actual dates ')
    frame: pd.DataFrame          # PORTFOLIO_COLS, weights summing to 100
    unmapped: List[str] = field(default_factory=list)

    @property
    def label(self) -> str:
        """Human date label, announcement shown alongside when it differs."""
        base = self.effective.strftime("%d %b %Y")
        if self.announced and self.announced != self.effective:
            return f"{base} (decided {self.announced.strftime('%d %b %Y')})"
        return base


def _read_sheet(path: Path, sheet: str) -> pd.DataFrame:
    """Flatten one sheet's repeating header/rows blocks into tidy rows."""
    raw = pd.read_excel(path, sheet_name=sheet, header=None)
    cols = [_COL_SCHEME, _COL_ISIN, _COL_DATE, _COL_WEIGHT]
    missing = [c for c in cols if c not in raw.columns]
    if missing:
        raise ValueError(f"{path.name}!{sheet!r} is missing expected columns {missing}")

    tidy = raw[cols].copy()
    tidy.columns = ["Scheme Name", "ISIN", "Date", "Allocation (%)"]

    # Drop spacer rows and the "Scheme Name / ISIN / Date / Weights" header that
    # repeats above every block.
    tidy = tidy[tidy["ISIN"].notna()]
    tidy = tidy[tidy["Scheme Name"].astype(str).str.strip().str.lower() != "scheme name"]

    tidy["Date"] = pd.to_datetime(tidy["Date"], errors="coerce")
    tidy = tidy[tidy["Date"].notna()]
    tidy["ISIN"] = tidy["ISIN"].astype(str).str.strip().str.upper()
    tidy["Scheme Name"] = tidy["Scheme Name"].astype(str).str.strip()
    tidy["Allocation (%)"] = pd.to_numeric(tidy["Allocation (%)"], errors="coerce").fillna(0.0)
    return tidy


@lru_cache(maxsize=4)
def load_history(path: Optional[str] = None) -> List[Rebalance]:
    """Every rebalance in the workbook, oldest first.

    Cached: the workbook ships with the app and does not change at runtime.
    """
    xlsx = Path(path) if path else HISTORY_XLSX
    if not xlsx.exists():
        return []

    effective = _read_sheet(xlsx, EFFECTIVE_SHEET)

    # The announcement dates are optional -- the effective sheet alone is enough
    # to build every block, so a missing or renamed sheet degrades to no
    # announcement label rather than failing the whole page.
    try:
        announced_dates = sorted(_read_sheet(xlsx, ANNOUNCED_SHEET)["Date"].unique())
    except (ValueError, KeyError):
        announced_dates = []

    blocks: List[Rebalance] = []
    for idx, stamp in enumerate(sorted(effective["Date"].unique())):
        rows = effective[effective["Date"] == stamp].copy()
        rows["Benchmark"] = rows["ISIN"].map(benchmark_for)
        frame = rows[PORTFOLIO_COLS].reset_index(drop=True)

        # Pair the two sheets positionally. They are the same 39 rebalances in
        # the same order; only the date labels differ.
        ann = (pd.Timestamp(announced_dates[idx]).date()
               if idx < len(announced_dates) else None)

        blocks.append(Rebalance(
            effective=pd.Timestamp(stamp).date(),
            announced=ann,
            frame=frame,
            unmapped=unmapped_schemes(frame),
        ))
    return blocks


# ─── Comparing portfolios ─────────────────────────────────────────────────────

def _holdings_key(frame: Optional[pd.DataFrame]) -> frozenset:
    """Order-independent identity of a portfolio: {(ISIN, weight)}.

    Row order and scheme spelling are presentation; what makes two portfolios
    the same is holding the same schemes at the same weights.
    """
    if frame is None or frame.empty:
        return frozenset()
    isin_col = next((c for c in frame.columns if "isin" in str(c).lower()), None)
    wt_col = next((c for c in frame.columns
                   if "alloc" in str(c).lower() or "weight" in str(c).lower()), None)
    if isin_col is None:
        return frozenset()

    pairs = set()
    for _, row in frame.iterrows():
        isin = str(row[isin_col]).strip().upper()
        if not isin or isin in ("NAN", "NONE", "-"):
            continue
        try:
            weight = round(float(row[wt_col]), 2) if wt_col else 0.0
        except (TypeError, ValueError):
            weight = 0.0
        pairs.add((isin, weight))
    return frozenset(pairs)


def same_holdings(a: Optional[pd.DataFrame], b: Optional[pd.DataFrame]) -> bool:
    """True when two frames hold the same schemes at the same weights."""
    key_a, key_b = _holdings_key(a), _holdings_key(b)
    return bool(key_a) and key_a == key_b


def previous_portfolio(current: Optional[pd.DataFrame],
                       path: Optional[str] = None) -> Optional[Rebalance]:
    """The most recent rebalance that is *not* the current portfolio.

    Walking back until the holdings actually differ is what keeps the reported
    bug fixed. Matching on holdings rather than on date means it works whether
    the live portfolio is the newest block in the workbook (previous is then the
    block before it) or a newer rebalance not yet recorded there (previous is
    then the newest block). Either way the two report blocks can never be the
    same portfolio printed twice.
    """
    blocks = load_history(path)
    if not blocks:
        return None
    for block in reversed(blocks):
        if not same_holdings(block.frame, current):
            return block
    return None  # every recorded rebalance matches the current portfolio
