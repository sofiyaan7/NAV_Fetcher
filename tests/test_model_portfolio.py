"""Tests for the model-portfolio history source.

The bug these guard against: the MIS "Previous Portfolio" block showed the
*current* portfolio, because its only source was an in-session carry-over that
starts life as a copy of the current one. The model portfolio is rebalanced
about once a year, so that carry-over never diverged and the two blocks in
every report were identical.
"""

import sys
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import benchmark_proxy
import model_portfolio as mp
from mis_generator import DEFAULT_SAMPLE_PORTFOLIO, validate_and_normalize_portfolio

PORTFOLIO_COLS = ["Scheme Name", "ISIN", "Allocation (%)", "Benchmark"]


# ─── The history file itself ──────────────────────────────────────────────────

def test_history_file_is_bundled():
    assert mp.HISTORY_XLSX.exists(), f"{mp.HISTORY_XLSX} must ship with the repo"


def test_history_loads_every_rebalance_in_order():
    blocks = mp.load_history()
    assert len(blocks) == 39
    dates = [b.effective for b in blocks]
    assert dates == sorted(dates), "blocks must come back oldest-first"
    assert dates[0] == date(2013, 5, 31)
    assert dates[-1] == date(2025, 11, 30)


def test_every_block_is_a_complete_portfolio():
    for blk in mp.load_history():
        assert not blk.frame.empty
        assert list(blk.frame.columns) == PORTFOLIO_COLS
        total = blk.frame["Allocation (%)"].sum()
        assert total == pytest.approx(100.0, abs=0.01), f"{blk.effective} sums to {total}"
        assert blk.frame["ISIN"].is_unique


def test_announced_date_is_carried_alongside_effective_date():
    """Both sheets hold identical holdings and differ only in date labels."""
    last = mp.load_history()[-1]
    assert last.effective == date(2025, 11, 30)
    assert last.announced == date(2025, 10, 15)


# ─── Benchmarks: the file has no benchmark column of its own ──────────────────

def test_every_historical_scheme_has_a_benchmark():
    missing = sorted(
        (blk.effective.isoformat(), isin)
        for blk in mp.load_history()
        for isin in blk.frame["ISIN"]
        if not mp.benchmark_for(isin)
    )
    assert missing == [], f"schemes with no benchmark mapping: {missing}"


def test_every_mapped_benchmark_resolves_to_a_real_index():
    """A typo would silently fall back to NIFTY 50 and quietly misreport."""
    unresolved = []
    for isin, entry in mp.SCHEME_BENCHMARKS.items():
        name = entry["benchmark"]
        canonical, proxy = benchmark_proxy.resolve_benchmark(name)
        if proxy is None:
            unresolved.append((isin, name))
        elif (canonical == benchmark_proxy.DEFAULT_BENCHMARK
              and "NIFTY 50" not in name.upper()):
            unresolved.append((isin, name, "silently fell back to NIFTY 50"))
    assert unresolved == [], f"benchmark names that do not resolve: {unresolved}"


def test_benchmarks_match_the_live_portfolio_where_they_overlap():
    """The 14 schemes held today must not be given a second opinion here."""
    for row in DEFAULT_SAMPLE_PORTFOLIO:
        mapped = mp.benchmark_for(row["ISIN"])
        assert mapped == row["Benchmark"], (
            f"{row['Scheme Name']}: history map says {mapped!r}, "
            f"live portfolio says {row['Benchmark']!r}"
        )


def test_unmapped_isin_is_left_blank_not_defaulted():
    """Silently benchmarking an unknown scheme to NIFTY 50 is the failure mode."""
    assert mp.benchmark_for("INF000000XXX") == ""


# ─── The actual bug ───────────────────────────────────────────────────────────

def test_previous_is_never_the_current_portfolio():
    """The regression test for the reported bug."""
    current = pd.DataFrame(DEFAULT_SAMPLE_PORTFOLIO)
    prev = mp.previous_portfolio(current)
    assert prev is not None
    assert not mp.same_holdings(prev.frame, current), (
        "previous portfolio came back identical to the current one"
    )


def test_previous_of_the_live_portfolio_is_the_block_before_it():
    """Current == the 2025-11-30 block, so previous must be the one before."""
    current = pd.DataFrame(DEFAULT_SAMPLE_PORTFOLIO)
    prev = mp.previous_portfolio(current)
    assert prev.effective == date(2024, 7, 15)
    # The two schemes that were dropped at that rebalance.
    dropped = set(prev.frame["ISIN"]) - {r["ISIN"] for r in DEFAULT_SAMPLE_PORTFOLIO}
    assert dropped == {"INF966L01234", "INF200K01362"}


def test_previous_of_a_newer_portfolio_is_the_latest_block():
    """A 2026 portfolio newer than anything in the file: previous is 2025-11-30."""
    current = pd.DataFrame([
        {"Scheme Name": "Some New Fund Gr", "ISIN": "INF000000ZZZ",
         "Allocation (%)": 100.0, "Benchmark": "Nifty 500 TR INR"},
    ])
    prev = mp.previous_portfolio(current)
    assert prev.effective == date(2025, 11, 30)
    assert prev.announced == date(2025, 10, 15)
    assert len(prev.frame) == 14


def test_previous_ignores_pure_reordering():
    """Same holdings in a different row order is the same portfolio."""
    current = pd.DataFrame(DEFAULT_SAMPLE_PORTFOLIO).iloc[::-1].reset_index(drop=True)
    prev = mp.previous_portfolio(current)
    assert prev.effective == date(2024, 7, 15)


def test_previous_survives_an_empty_current_portfolio():
    prev = mp.previous_portfolio(pd.DataFrame(columns=PORTFOLIO_COLS))
    assert prev.effective == date(2025, 11, 30)


# ─── It has to be usable by the report builder ────────────────────────────────

def test_previous_frame_passes_the_mis_validator():
    current = pd.DataFrame(DEFAULT_SAMPLE_PORTFOLIO)
    prev = mp.previous_portfolio(current)
    clean, warns, errs = validate_and_normalize_portfolio(prev.frame)
    assert errs == []
    assert len(clean) == len(prev.frame)
    assert clean["Allocation (%)"].sum() == pytest.approx(100.0, abs=0.01)
    assert not clean["Benchmark"].astype(str).str.strip().eq("").any()


# ─── Wiring into the MIS page ─────────────────────────────────────────────────

def test_history_is_the_default_previous_portfolio_source():
    import mis_generator
    assert mis_generator._PREV_MODES[0] == mis_generator._PREV_MODE_HISTORY, (
        "the history source must be first so it is what a fresh session renders"
    )


def test_stuck_auto_workspace_is_detected_for_migration():
    """The condition the page uses to migrate an old workspace off Auto mode."""
    current = pd.DataFrame(DEFAULT_SAMPLE_PORTFOLIO)
    # The broken state that shipped: auto-previous is a copy of current.
    assert mp.same_holdings(current.copy(), current) is True
    # A genuine Auto carry-over must not be migrated away.
    genuine = mp.previous_portfolio(current).frame
    assert mp.same_holdings(genuine, current) is False
    # A missing carry-over is not the bug state either.
    assert mp.same_holdings(None, current) is False
