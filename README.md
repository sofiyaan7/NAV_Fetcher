---
title: NAV Fetcher
emoji: 📈
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
license: mit
---

# NAV Fetcher

A Streamlit app for fetching and analyzing Indian Mutual Fund NAV and AUM historical data from AMFI India.

## Features
- Historical NAV data fetching from AMFI India portal
- Fund performance and AUM data from AMFI performance API
- Excel export with rich formatting
- Carry-forward for missing dates
- Net flows calculation

## Net flows method (same as the Cash Pile dashboard)

Net flow = AUM − previous published AUM × NAV end ÷ NAV start (the AUM change left after removing the market move). Daily AUM comes from AMFI's Fund Performance API (`dailyAUM`, scheme total of all plans).

Handling of AMFI's data:
- **Late AUM filers** — Axis, JM Financial and quant file each day's AUM one day late (all their schemes, index funds & ETFs included). The AUM keeps its date; the market move is removed with the NAVs one NAV date earlier (`is_lagged_amc`).
- **AUM not updated** — `^` on AMFI's page (`specialCharAum`), or the same figure repeated: no flow that day; the next published AUM carries the movement with NAVs spanning the gap.
- **Scheme missing on a day** (no NAV, mostly overseas holdings) — bridged up to 14 days.
- **Only published AUMs are measured** — carried and monthly-fallback AUMs are shown but never used for flows (`_aum_live`).
- **Older-day answers** — for a date not yet published AMFI returns its latest older day; those rows are dropped and empty answers are never cached.
- **Data errors** — an active fund's one-day flow above 25% of AUM is not booked (e.g. DSP Value Fund shown at 5,237 Cr); a day whose AUMs did not move with NAVs (31-Mar/1-Apr) is skipped. Both are reported in `_LAST_FLOW_NOTES` (shown in the MIS notes).
