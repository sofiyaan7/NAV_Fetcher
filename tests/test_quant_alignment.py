"""quant AMC's one-day offset belongs to the AUM only, never to the NAV.

quant files a day's AUM against the following day, so their AUM series is
pulled back one observation (``_shift_quant_aum``). Their NAVs are published
exactly like everyone else's, so the daily return that the flow formula charges
against that AUM pair must be computed from the *current* day's NAV, the same as
any other fund.

The bug these guard against: an earlier implementation expressed the same
one-day correction by shifting the NAV instead, and when the AUM shift replaced
it the NAV shift was never removed. Both were live, so the correction was
applied twice and quant's daily return came off the wrong pair of NAVs.
"""

import sys
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import nav_fetcher
from nav_fetcher import _shift_quant_aum, calculate_flows_for_dataframe

DATES = ["01-Sep-2026", "02-Sep-2026", "03-Sep-2026", "04-Sep-2026"]
NAVS = [100.0, 101.0, 102.0, 103.0]
AUMS = [1000.0, 1100.0, 1200.0, 1300.0]

META = ["Asset Class", "Scheme Code", "ISIN Div Payout / ISIN Growth",
        "ISIN Div Reinvestment", "Scheme Name", "Plan Type", "Option Type"]


def _frame(name, code):
    """One scheme, four days, identical numbers whoever the AMC is."""
    return pd.DataFrame({
        "Asset Class": ["Equity"] * 4,
        "Scheme Name": [name] * 4,
        "Scheme Code": [code] * 4,
        "ISIN Div Payout / ISIN Growth": [f"INF{code:09d}"] * 4,
        "ISIN Div Reinvestment": [""] * 4,
        "Plan Type": ["Regular"] * 4,
        "Option Type": ["Growth"] * 4,
        "NAV Date": DATES,
        "NAV": list(NAVS),
        "AUM": list(AUMS),
        "_aum_live": [True] * 4,
    })


def _both_houses():
    """A quant scheme and a non-quant scheme carrying identical figures."""
    return _frame("quant Large Cap Fund - Growth", 1), _frame("Other Large Cap Fund - Growth", 2)


# ─── The AUM offset must keep working ─────────────────────────────────────────

def test_quant_aum_is_still_pulled_back_one_day():
    quant, other = _both_houses()
    shifted = _shift_quant_aum(quant)
    # Day D takes the figure AMFI filed under D+1; the final day has no
    # successor and is left empty rather than invented.
    assert list(shifted["AUM"])[:3] == [1100.0, 1200.0, 1300.0]
    assert pd.isna(list(shifted["AUM"])[3])


def test_non_quant_aum_is_untouched():
    _, other = _both_houses()
    assert list(_shift_quant_aum(other)["AUM"]) == AUMS


# ─── The NAV must NOT be offset ───────────────────────────────────────────────

def test_quant_return_matches_an_identical_non_quant_fund():
    """The regression test for the reported bug.

    Two funds whose NAVs moved identically must report the same daily return.
    Only their AUM handling may differ.
    """
    quant, other = _both_houses()
    q_out = calculate_flows_for_dataframe(_shift_quant_aum(quant), "2026-09-01", META)
    o_out = calculate_flows_for_dataframe(_shift_quant_aum(other), "2026-09-01", META)

    q_ret = [r for r in q_out["Daily return"] if r is not None and pd.notna(r)]
    o_ret = [r for r in o_out["Daily return"] if r is not None and pd.notna(r)]
    assert q_ret == pytest.approx(o_ret), (
        f"quant returns {q_ret} differ from an identically-moving fund's {o_ret}"
    )


def test_quant_return_is_computed_from_the_current_day_nav():
    """03-Sep must use 102/101, not the previous day's 101/100."""
    quant, _ = _both_houses()
    out = calculate_flows_for_dataframe(_shift_quant_aum(quant), "2026-09-01", META)
    row = out[out["NAV Date"] == "03-09-2026"].iloc[0]
    expected = (102.0 - 101.0) / 101.0 * 100
    assert float(row["Daily return"]) == pytest.approx(expected)


def test_displayed_nav_is_the_real_published_nav():
    """A shifted NAV in the output is correct arithmetic shown as a wrong price."""
    quant, _ = _both_houses()
    out = calculate_flows_for_dataframe(_shift_quant_aum(quant), "2026-09-01", META)
    assert list(out["NAVs"]) == NAVS


def test_the_superseded_nav_shift_is_gone():
    """Two live implementations of one correction is what caused the bug."""
    assert not hasattr(nav_fetcher, "_align_quant_nav"), (
        "_align_quant_nav shifted the NAV; the AUM shift replaced it"
    )
    import mis_generator
    assert not hasattr(mis_generator, "_align_quant_nav"), (
        "dead duplicate in mis_generator -- it rewrote the NAV column outright"
    )


def test_a_quant_named_fund_from_another_house_is_not_touched():
    """Quantum, Axis Quant and ABSL Quant are different houses."""
    for name in ("Quantum Large Cap Fund - Growth",
                 "Axis Quant Fund - Growth",
                 "Aditya Birla Sun Life Quant Fund - Growth"):
        frame = _frame(name, 9)
        assert list(_shift_quant_aum(frame)["AUM"]) == AUMS, f"{name} must be untouched"
