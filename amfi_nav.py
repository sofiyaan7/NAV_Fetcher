"""AMFI NAV fetching, parsing, search, and export helpers.

The official source is the AMFI NAVAll text feed. This module keeps the data
layer independent from the Streamlit UI so it can be reused by tests, scripts,
or a future API wrapper.
"""

from __future__ import annotations

import io
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable, List, Optional, Union

import pandas as pd
import time
import requests


AMFI_NAV_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
# AMFI's scheme master: one row per scheme code with its full NAV name, e.g.
# "Motilal Oswal Midcap Fund-Regular Plan-Growth Option". Used only to fill in
# the plan and option where NAVAll leaves them blank (see _parse_nav_text).
AMFI_SCHEME_MASTER_URL = "https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0"
DEFAULT_CACHE_DIR = Path("cache")
DEFAULT_ARCHIVE_DIR = DEFAULT_CACHE_DIR / "archive"
LATEST_CACHE_FILE = DEFAULT_CACHE_DIR / "latest_nav.csv"
META_CACHE_FILE = DEFAULT_CACHE_DIR / "latest_nav_meta.json"
SCHEME_MASTER_CACHE_FILE = DEFAULT_CACHE_DIR / "scheme_master.csv"


class AMFINavError(RuntimeError):
    """Raised when AMFI data cannot be fetched or parsed."""


@dataclass(frozen=True)
class CacheMetadata:
    fetched_at: str
    source_url: str
    row_count: int


PLAN_DIRECT_PATTERNS = [r"\bdirect\b", r"\bdirect plan\b", r"\bdir\b"]
PLAN_REGULAR_PATTERNS = [r"\bregular\b", r"\bregular plan\b"]
# ICICI Prudential names its growth option "Cumulative" (Manufacturing,
# Healthcare, India Opportunities, Nifty 50 Index...): same thing, no payouts.
OPTION_GROWTH_PATTERNS = [r"\bgrowth\b", r"\bcumulative\b"]
OPTION_IDCW_PATTERNS = [r"\bidcw\b", r"\bdividend\b", r"income distribution", r"capital withdrawal"]
OPTION_BONUS_PATTERNS = [r"\bbonus\b"]


def ensure_cache_dirs() -> None:
    DEFAULT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    DEFAULT_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)


def normalize_text(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"\(formerly known as.*?\)", " ", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def classify_plan_type(scheme_name: str) -> str:
    text = normalize_text(scheme_name)
    if any(re.search(pattern, text) for pattern in PLAN_DIRECT_PATTERNS):
        return "Direct"
    if any(re.search(pattern, text) for pattern in PLAN_REGULAR_PATTERNS):
        return "Regular"
    return "Unknown"


def _option_or_unknown(option: str) -> str:
    return "Unknown" if option == "Other" else option


def classify_option_type(scheme_name: str) -> str:
    text = normalize_text(scheme_name)
    if any(re.search(pattern, text) for pattern in OPTION_GROWTH_PATTERNS):
        return "Growth"
    if any(re.search(pattern, text) for pattern in OPTION_BONUS_PATTERNS):
        return "Bonus"
    if any(re.search(pattern, text) for pattern in OPTION_IDCW_PATTERNS):
        return "IDCW/Dividend"
    return "Other"


def derive_family_name(scheme_name: str) -> str:
    text = re.sub(r"\(formerly known as.*?\)", " ", scheme_name, flags=re.IGNORECASE)
    text = re.sub(r"(?i)\b(direct|regular)\s+plan\b", " ", text)
    text = re.sub(r"(?i)\b(direct|regular)\b", " ", text)
    text = re.sub(r"(?i)\bplan\b", " ", text)
    text = re.sub(r"(?i)\b(growth|growth option|dividend|bonus|idcw|income distribution cum capital withdrawal|payout|reinvestment|income distribution|capital withdrawal|option)\b", " ", text)
    text = re.sub(r"[-_/]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" -")
    return text.strip() or scheme_name.strip()


def build_family_key(scheme_name: str, amc_name: str) -> str:
    return f"{normalize_text(amc_name)}||{normalize_text(derive_family_name(scheme_name))}"


def _download_nav_text(session: Optional[requests.Session] = None, timeout: int = 30) -> str:
    client = session or requests.Session()
    response = client.get(AMFI_NAV_URL, timeout=timeout)
    response.raise_for_status()
    response.encoding = response.apparent_encoding or "utf-8"
    return response.text


def _map_nav_columns(header_line: str) -> dict:
    """Map the NAVAll header to column indices, falling back to the old layout."""
    names = [h.strip().lower() for h in header_line.split(";")]
    out: dict = {}
    for i, h in enumerate(names):
        if h.startswith("scheme code"):
            out.setdefault("scheme_code", i)
        elif "isin" in h and "reinvest" in h:
            out.setdefault("isin_reinvest", i)
        elif "isin" in h:
            out.setdefault("isin_growth", i)
        elif h in ("scheme name", "nav name") or h.endswith(" name"):
            out.setdefault("scheme_name", i)
        elif h == "plan":
            out.setdefault("plan", i)
        elif h == "option":
            out.setdefault("option", i)
        elif "net asset value" in h:
            out.setdefault("nav", i)
        elif h == "date":
            out.setdefault("date", i)
    for k, v in {"scheme_code": 0, "isin_growth": 1, "isin_reinvest": 2,
                 "scheme_name": 3, "nav": 4, "date": 5}.items():
        out.setdefault(k, v)
    return out


def _scheme_master_names(session: Optional[requests.Session] = None, timeout: int = 60) -> dict:
    """Scheme code -> AMFI's full NAV name, from the scheme master.

    NAVAll leaves Plan and Option blank for a good number of schemes and gives
    every plan the same bare name: Motilal Oswal Midcap Fund has four rows all
    called "Motilal Oswal Midcap Fund", as do HSBC Small Cap and Navi ELSS. With
    nothing to tell Regular Growth from Direct or IDCW, the selection rule
    dropped all four and the fund vanished from Fund performance. The scheme
    master names each code in full, so it settles them.

    Best effort: a failed download falls back to the last saved copy, and with
    neither the parse carries on exactly as before.
    """
    text = None
    try:
        client = session or requests.Session()
        response = client.get(AMFI_SCHEME_MASTER_URL, timeout=timeout,
                              headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        if response.text.lstrip().startswith("AMC,"):
            text = response.text
            try:
                ensure_cache_dirs()
                SCHEME_MASTER_CACHE_FILE.write_text(text, encoding="utf-8")
            except Exception:
                pass
    except Exception as exc:
        print(f"Warning: AMFI scheme master unavailable ({exc}); using the saved copy if any.")
    if text is None and SCHEME_MASTER_CACHE_FILE.exists():
        text = SCHEME_MASTER_CACHE_FILE.read_text(encoding="utf-8")
    if not text:
        return {}
    try:
        master = pd.read_csv(io.StringIO(text), dtype=str)
        master.columns = [c.strip() for c in master.columns]
        master = master.dropna(subset=["Code", "Scheme NAV Name"])
        return dict(zip(master["Code"].str.strip(), master["Scheme NAV Name"].str.strip()))
    except Exception as exc:
        print(f"Warning: could not read the AMFI scheme master: {exc}")
        return {}


def _parse_nav_text(text: str, master_names: Optional[dict] = None) -> pd.DataFrame:
    rows: List[dict] = []
    current_amc = "Unknown AMC"
    current_section = "Unknown"

    cols: dict = {}

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("Scheme Code;"):
            # Read the layout from the header rather than assuming it. AMFI
            # inserted Plan and Option, moving the ISINs from columns 1-2 to
            # 4-5; the old positional unpack then read an ISIN as the NAV and
            # produced nothing, which is why the index could not be refreshed.
            cols = _map_nav_columns(line)
            continue
        # AMFI writes "Close Ended Schemes", not "Closed". Missing those five
        # headers left their schemes inheriting the previous section, which put
        # thousands of rows under Interval Fund and wrecked categorisation.
        if line.startswith(("Open Ended", "Close Ended", "Closed Ended", "Interval Fund Schemes")):
            current_section = line
            continue
        if line.endswith("Mutual Fund") and line.count(";") == 0:
            current_amc = line.replace(" Mutual Fund", "").strip()
            continue
        if line.count(";") < 5:
            continue

        parts = [part.strip() for part in line.split(";")]
        if len(parts) < 6:
            continue

        def _col(key: str, default: str = "") -> str:
            i = cols.get(key)
            return parts[i] if i is not None and i < len(parts) else default

        scheme_code = _col("scheme_code")
        isin_growth = _col("isin_growth")
        isin_reinvestment = _col("isin_reinvest")
        scheme_name = _col("scheme_name")
        nav_value = _col("nav")
        nav_date = _col("date")
        _plan = _col("plan")
        _option = _col("option")
        full_name = (master_names or {}).get(scheme_code) or scheme_name
        nav = pd.to_numeric(nav_value.replace(",", ""), errors="coerce")
        parsed_date = pd.to_datetime(nav_date, format="%d-%b-%Y", errors="coerce")

        rows.append(
            {
                "AMC Name": current_amc,
                "Asset Class": current_section,
                "Scheme Code": scheme_code if scheme_code != "-" else None,
                "ISIN Div Payout/ ISIN Growth": isin_growth if isin_growth != "-" else None,
                "ISIN Div Reinvestment": isin_reinvestment if isin_reinvestment != "-" else None,
                "Scheme Name": scheme_name,
                # The scheme master's full name ("... -Plan B - Growth option"),
                # kept so the selection rule can see the share class even where
                # NAVAll gives only the bare scheme name. Blank when unknown.
                "Scheme NAV Name": full_name if full_name != scheme_name else "",
                "Family Name": derive_family_name(scheme_name),
                "Family Key": build_family_key(scheme_name, current_amc),
                # AMFI now publishes Plan and Option as their own columns, and
                # the scheme name no longer carries them: the new feed says
                # "The Wealth Company Large & Mid Cap Fund" where the old one
                # said "... - Regular Plan - Growth". Classifying from the name
                # then returned Unknown for every scheme and selection
                # collapsed -- Large Cap fell from 34 funds to 4. Prefer the
                # columns and keep the name-based reading as the fallback.
                #
                # Where NAVAll leaves a column blank, the scheme master's full
                # name for the code is read instead of the bare scheme name.
                # And an option that nothing names is "Unknown", not "Other":
                # the selection rule rejects "Other" as a stated non-Growth
                # option, which dropped every single-class ETF and every Regular
                # plan AMFI publishes without an option (Tata Nifty 50 Index Fund).
                "Plan Type": (_plan.title() if _plan else classify_plan_type(full_name)),
                "Option Type": (_option.title() if _option else
                                _option_or_unknown(classify_option_type(full_name))),
                "NAV": nav,
                "NAV Date": parsed_date,
                "Source Section": current_section,
                "Updated At": pd.Timestamp.now(tz=timezone.utc),
            }
        )

    if not rows:
        raise AMFINavError("AMFI feed downloaded successfully, but no scheme rows were parsed.")

    frame = pd.DataFrame(rows)
    frame = frame.dropna(subset=["Scheme Name", "NAV Date"])
    frame = frame.sort_values(["AMC Name", "Family Name", "NAV Date", "Plan Type", "Option Type", "Scheme Code"], ascending=[True, True, False, True, True, True])
    frame.reset_index(drop=True, inplace=True)
    return frame


def _write_cache(frame: pd.DataFrame, metadata: CacheMetadata) -> None:
    ensure_cache_dirs()
    export_frame = frame.copy()
    export_frame["NAV Date"] = export_frame["NAV Date"].dt.strftime("%d-%m-%Y")
    export_frame["Updated At"] = export_frame["Updated At"].astype(str)
    export_frame.to_csv(LATEST_CACHE_FILE, index=False)
    META_CACHE_FILE.write_text(json.dumps(metadata.__dict__, indent=2), encoding="utf-8")


def _read_cache() -> pd.DataFrame:
    if not LATEST_CACHE_FILE.exists():
        raise AMFINavError("No cached AMFI NAV data is available.")
    try:
        frame = pd.read_csv(LATEST_CACHE_FILE)
        if frame.empty:
            return pd.DataFrame()
        if "NAV Date" in frame.columns:
            frame["NAV Date"] = pd.to_datetime(frame["NAV Date"], errors="coerce")
        if "Updated At" in frame.columns:
            frame["Updated At"] = pd.to_datetime(frame["Updated At"], errors="coerce")
        return frame
    except Exception as exc:
        raise AMFINavError(f"Failed to read cached data: {exc}") from exc


def _archive_snapshot(frame: pd.DataFrame, fetched_at: datetime) -> None:
    ensure_cache_dirs()
    archive_file = DEFAULT_ARCHIVE_DIR / f"nav_{fetched_at.strftime('%Y%m%d_%H%M%S')}.csv.gz"
    archive_frame = frame.copy()
    archive_frame["NAV Date"] = archive_frame["NAV Date"].dt.strftime("%d-%m-%Y")
    archive_frame["Updated At"] = archive_frame["Updated At"].astype(str)
    archive_frame.to_csv(archive_file, index=False, compression="gzip")


# AMFI republishes NAVAll every business day, and new schemes only appear
# there. Without an age check the cached index is returned forever: one built
# on 3 August still had 14,215 rows against the live file's 17,988, so every
# fund launched since -- whole AMCs among them -- was invisible to the app in
# every category. A day keeps it current without refetching on every run.
MAX_CACHE_AGE_HOURS = 24


def _cache_is_stale() -> bool:
    """True when the cached scheme index is older than a day, or unreadable."""
    # Age comes from the recorded fetch time, not the file's mtime. A cache
    # shipped inside a container image gets a fresh mtime at build time, so
    # mtime would call a months-old index current and never refresh it.
    age_hours = None
    try:
        import json as _json
        meta = _json.loads(META_CACHE_FILE.read_text(encoding="utf-8"))
        fetched = datetime.fromisoformat(str(meta.get("fetched_at")))
        if fetched.tzinfo is None:
            fetched = fetched.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - fetched).total_seconds() / 3600.0
    except Exception:
        age_hours = None

    if age_hours is None:
        try:
            age_hours = (time.time() - LATEST_CACHE_FILE.stat().st_mtime) / 3600.0
        except OSError:
            return True
    if age_hours > MAX_CACHE_AGE_HOURS:
        print(f"Scheme index cache is {age_hours:.0f}h old; refreshing from AMFI.")
        return True
    return False


def fetch_nav_data(force_refresh: bool = False, session: Optional[requests.Session] = None) -> pd.DataFrame:
    """Fetch the latest AMFI NAV feed and cache it locally.

    On failure, this falls back to the last successful cached snapshot if one
    exists.
    """

    ensure_cache_dirs()
    if not force_refresh and LATEST_CACHE_FILE.exists() and not _cache_is_stale():
        try:
            cached = _read_cache()
            if not cached.empty:
                return cached
        except Exception as exc:
            print(f"Warning: Failed to load cache: {exc}. Attempting to fetch live data.")

    try:
        text = _download_nav_text(session=session)
        frame = _parse_nav_text(text, _scheme_master_names(session=session))
        fetched_at = datetime.now(timezone.utc)
        metadata = CacheMetadata(
            fetched_at=fetched_at.isoformat(),
            source_url=AMFI_NAV_URL,
            row_count=int(len(frame)),
        )
        # A parse that collapses is a parser problem, not an empty feed. Writing
        # it would replace a working index with nothing -- which is exactly what
        # happened when AMFI changed the column layout: a 14,215-row cache was
        # overwritten by a header-only file, taking the whole app down with it.
        if frame.empty:
            print("Refusing to cache an empty NAV parse; keeping the existing index.")
            if LATEST_CACHE_FILE.exists():
                try:
                    cached = _read_cache()
                    if not cached.empty:
                        return cached
                except Exception:
                    pass
            raise AMFINavError("Parsed zero schemes from the AMFI NAV feed.")

        try:
            existing = _read_cache() if LATEST_CACHE_FILE.exists() else None
        except Exception:
            existing = None
        if existing is not None and len(existing) > 100 and len(frame) < len(existing) * 0.5:
            print(f"Refusing to cache {len(frame)} schemes over an existing "
                  f"{len(existing)}; the feed or parser looks wrong.")
            return existing

        try:
            _write_cache(frame, metadata)
            _archive_snapshot(frame, fetched_at)
        except Exception as write_exc:
            print(f"Warning: Failed to write cache: {write_exc}")
        return frame
    except Exception as exc:
        if LATEST_CACHE_FILE.exists():
            try:
                cached = _read_cache()
                if not cached.empty:
                    return cached
            except Exception:
                pass
        raise AMFINavError(f"Unable to fetch AMFI NAV data: {exc}") from exc


def _latest_row(frame: pd.DataFrame) -> pd.Series:
    ordered = frame.sort_values(["NAV Date", "Scheme Code"], ascending=[False, True])
    return ordered.iloc[0]


def summarize_families(frame: pd.DataFrame) -> pd.DataFrame:
    if frame.empty:
        return pd.DataFrame()

    summaries: List[dict] = []
    for family_key, group in frame.groupby("Family Key", dropna=False):
        group = group.copy()
        latest = _latest_row(group)
        regular_group = group[group["Plan Type"] == "Regular"]
        direct_group = group[group["Plan Type"] == "Direct"]

        regular_latest = _latest_row(regular_group) if not regular_group.empty else None
        direct_latest = _latest_row(direct_group) if not direct_group.empty else None

        regular_growth = regular_group[regular_group["Option Type"] == "Growth"]
        regular_idcw = regular_group[regular_group["Option Type"].isin(["IDCW/Dividend", "Bonus"])]
        direct_growth = direct_group[direct_group["Option Type"] == "Growth"]
        direct_idcw = direct_group[direct_group["Option Type"].isin(["IDCW/Dividend", "Bonus"])]

        summaries.append(
            {
                "Family Key": family_key,
                "AMC Name": latest["AMC Name"],
                "Family Name": latest["Family Name"],
                "Latest Scheme Name": latest["Scheme Name"],
                "Latest Scheme Code": latest["Scheme Code"],
                "Latest NAV": latest["NAV"],
                "Latest NAV Date": latest["NAV Date"],
                "Plan Types": ", ".join(sorted(group["Plan Type"].dropna().unique().tolist())),
                "Option Types": ", ".join(sorted(group["Option Type"].dropna().unique().tolist())),
                "Total Rows": int(len(group)),
                "Regular NAV": float(regular_latest["NAV"]) if regular_latest is not None else None,
                "Regular NAV Date": regular_latest["NAV Date"] if regular_latest is not None else pd.NaT,
                "Direct NAV": float(direct_latest["NAV"]) if direct_latest is not None else None,
                "Direct NAV Date": direct_latest["NAV Date"] if direct_latest is not None else pd.NaT,
                "Regular Growth NAV": float(_latest_row(regular_growth)["NAV"]) if not regular_growth.empty else None,
                "Regular IDCW NAV": float(_latest_row(regular_idcw)["NAV"]) if not regular_idcw.empty else None,
                "Direct Growth NAV": float(_latest_row(direct_growth)["NAV"]) if not direct_growth.empty else None,
                "Direct IDCW NAV": float(_latest_row(direct_idcw)["NAV"]) if not direct_idcw.empty else None,
            }
        )

    summary = pd.DataFrame(summaries)
    summary = summary.sort_values(["Latest NAV Date", "Family Name"], ascending=[False, True]).reset_index(drop=True)
    return summary


def fuzzy_score(query: str, candidate: str) -> float:
    query_norm = normalize_text(query)
    candidate_norm = normalize_text(candidate)
    if not query_norm or not candidate_norm:
        return 0.0
    return SequenceMatcher(None, query_norm, candidate_norm).ratio()


def search_fund(
    frame: pd.DataFrame,
    query: str,
    *,
    plan_filter: Optional[Iterable[str]] = None,
    option_filter: Optional[Iterable[str]] = None,
    limit: int = 10,
) -> pd.DataFrame:
    """Return fuzzy matches for a single search query."""

    if frame.empty or not query.strip():
        return pd.DataFrame()

    summary = summarize_families(frame)
    if summary.empty:
        return summary

    plan_filter_set = {item.lower() for item in plan_filter} if plan_filter else None
    option_filter_set = {item.lower() for item in option_filter} if option_filter else None

    candidate_rows = []
    for _, row in summary.iterrows():
        score = max(
            fuzzy_score(query, str(row["Family Name"])),
            fuzzy_score(query, str(row["Latest Scheme Name"])),
            fuzzy_score(query, str(row["AMC Name"])),
        )
        if score >= 0.18 or normalize_text(query) in normalize_text(str(row["Family Name"])):
            candidate_rows.append({**row.to_dict(), "Match Score": round(score, 4)})

    results = pd.DataFrame(candidate_rows)
    if results.empty:
        return results

    if plan_filter_set:
        results = results[
            results["Plan Types"].fillna("").str.lower().apply(
                lambda value: any(token in value for token in plan_filter_set)
            )
        ]

    if option_filter_set:
        normalized_options = results["Option Types"].fillna("").str.lower()
        results = results[normalized_options.apply(lambda value: any(token in value for token in option_filter_set))]

    results = results.sort_values(["Match Score", "Latest NAV Date", "Total Rows"], ascending=[False, False, False]).head(limit)
    return results.reset_index(drop=True)


def filter_family_rows(frame: pd.DataFrame, family_key: str, plan_filter: Optional[Iterable[str]] = None, option_filter: Optional[Iterable[str]] = None) -> pd.DataFrame:
    family_rows = frame[frame["Family Key"] == family_key].copy()
    if family_rows.empty:
        return family_rows

    if plan_filter:
        allowed = {item.lower() for item in plan_filter}
        family_rows = family_rows[family_rows["Plan Type"].str.lower().isin(allowed)]

    if option_filter:
        allowed = {item.lower() for item in option_filter}
        family_rows = family_rows[family_rows["Option Type"].str.lower().isin(allowed)]

    family_rows = family_rows.sort_values(["NAV Date", "Plan Type", "Option Type"], ascending=[False, True, True])
    return family_rows.reset_index(drop=True)


def get_regular_nav(frame: pd.DataFrame, family_key: str) -> pd.DataFrame:
    return filter_family_rows(frame, family_key, plan_filter=["Regular"])


def get_direct_nav(frame: pd.DataFrame, family_key: str) -> pd.DataFrame:
    return filter_family_rows(frame, family_key, plan_filter=["Direct"])


def comparison_table(frame: pd.DataFrame, family_key: str) -> pd.DataFrame:
    selected = frame[frame["Family Key"] == family_key].copy()
    if selected.empty:
        return selected

    pivot = (
        selected.sort_values("NAV Date", ascending=False)
        .groupby(["Option Type", "Plan Type"], as_index=False)
        .first()
    )

    if pivot.empty:
        return pivot

    return pivot[["AMC Name", "Family Name", "Scheme Name", "Scheme Code", "Plan Type", "Option Type", "NAV", "NAV Date"]].sort_values(
        ["Option Type", "Plan Type"],
        ascending=[True, True],
    )


def export_to_excel(frame: pd.DataFrame, file_path: Union[str, Path]) -> None:
    export_frame = frame.copy()
    if "NAV Date" in export_frame.columns:
        export_frame["NAV Date"] = pd.to_datetime(export_frame["NAV Date"], errors="coerce").dt.strftime("%d-%m-%Y")
    if "Updated At" in export_frame.columns:
        export_frame["Updated At"] = pd.to_datetime(export_frame["Updated At"], errors="coerce").astype(str)

    with pd.ExcelWriter(file_path, engine="openpyxl") as writer:
        export_frame.to_excel(writer, index=False, sheet_name="NAV Results")


def export_to_csv(frame: pd.DataFrame, file_path: Union[str, Path]) -> None:
    export_frame = frame.copy()
    if "NAV Date" in export_frame.columns:
        export_frame["NAV Date"] = pd.to_datetime(export_frame["NAV Date"], errors="coerce").dt.strftime("%d-%m-%Y")
    export_frame.to_csv(file_path, index=False)


def load_historical_snapshots(family_key: str) -> pd.DataFrame:
    """Load historical rows from the local cache archive, if available."""

    ensure_cache_dirs()
    snapshots: List[pd.DataFrame] = []
    for archive_file in sorted(DEFAULT_ARCHIVE_DIR.glob("nav_*.csv.gz")):
        # Some archive files may be corrupted or not actually gzipped despite
        # the .gz extension. Try to read robustly and skip files that fail.
        snapshot = None
        try:
            # Prefer explicit gzip decompression first
            snapshot = pd.read_csv(archive_file, compression="gzip", low_memory=False)
        except Exception:
            try:
                # Fallback: try reading without compression (in case file is plain CSV)
                snapshot = pd.read_csv(archive_file, low_memory=False)
            except Exception as exc:
                # Skip corrupted/unreadable archive files but log the issue.
                print(f"Warning: skipping unreadable archive {archive_file}: {exc}")
                continue
        if snapshot is None:
            continue
        if "Family Key" not in snapshot.columns:
            continue
        filtered = snapshot[snapshot["Family Key"] == family_key].copy()
        if filtered.empty:
            continue
        filtered["Snapshot File"] = archive_file.name
        filtered["NAV Date"] = pd.to_datetime(filtered["NAV Date"], errors="coerce")
        snapshots.append(filtered)

    if not snapshots:
        return pd.DataFrame()

    history = pd.concat(snapshots, ignore_index=True)
    history = history.sort_values(["NAV Date", "Plan Type", "Option Type"], ascending=[True, True, True])
    history = adjust_dataframe_splits(history)
    return history.reset_index(drop=True)


def load_all_historical_snapshots() -> pd.DataFrame:
    """Load every readable archived NAV snapshot into a single frame."""

    ensure_cache_dirs()
    snapshots: List[pd.DataFrame] = []
    for archive_file in sorted(DEFAULT_ARCHIVE_DIR.glob("nav_*.csv.gz")):
        snapshot = None
        try:
            snapshot = pd.read_csv(archive_file, compression="gzip", low_memory=False)
        except Exception:
            try:
                snapshot = pd.read_csv(archive_file, low_memory=False)
            except Exception as exc:
                print(f"Warning: skipping unreadable archive {archive_file}: {exc}")
                continue

        if snapshot is None or snapshot.empty:
            continue

        if "NAV Date" in snapshot.columns:
            snapshot["NAV Date"] = pd.to_datetime(snapshot["NAV Date"], errors="coerce")
        if "Updated At" in snapshot.columns:
            snapshot["Updated At"] = pd.to_datetime(snapshot["Updated At"], errors="coerce")

        snapshot["Snapshot File"] = archive_file.name
        snapshots.append(snapshot)

    if LATEST_CACHE_FILE.exists():
        try:
            current = pd.read_csv(LATEST_CACHE_FILE, low_memory=False)
            if not current.empty:
                if "NAV Date" in current.columns:
                    current["NAV Date"] = pd.to_datetime(current["NAV Date"], errors="coerce")
                if "Updated At" in current.columns:
                    current["Updated At"] = pd.to_datetime(current["Updated At"], errors="coerce")
                current["Snapshot File"] = LATEST_CACHE_FILE.name
                snapshots.append(current)
        except Exception as exc:
            print(f"Warning: skipping unreadable cache {LATEST_CACHE_FILE}: {exc}")

    if not snapshots:
        return pd.DataFrame()

    history = pd.concat(snapshots, ignore_index=True)
    if "NAV Date" in history.columns:
        history = history.sort_values(["NAV Date", "Plan Type", "Option Type"], ascending=[True, True, True])
    history = adjust_dataframe_splits(history)
    return history.reset_index(drop=True)


def load_navs_on_date(target_date: Union[str, datetime]) -> pd.DataFrame:
    """Return all archived NAV rows whose NAV Date falls exactly on target_date."""

    target = pd.to_datetime(target_date, errors="coerce")
    if pd.isna(target):
        raise AMFINavError(f"Invalid target date: {target_date}")
    target_day = target.normalize()

    history = load_all_historical_snapshots()
    if history.empty or "NAV Date" not in history.columns:
        return history

    nav_dates = pd.to_datetime(history["NAV Date"], errors="coerce")
    history = history[nav_dates.dt.normalize() == target_day].copy()
    if history.empty:
        return history

    sort_cols = [col for col in ["NAV Date", "AMC Name", "Family Name", "Scheme Name", "Plan Type", "Option Type"] if col in history.columns]
    if sort_cols:
        history = history.sort_values(sort_cols, ascending=True)
    return history.reset_index(drop=True)


def sip_future_value(monthly_investment: float, annual_return_pct: float, years: int) -> float:
    if monthly_investment <= 0 or years <= 0:
        return 0.0
    monthly_rate = (1 + annual_return_pct / 100) ** (1 / 12) - 1
    periods = years * 12
    return monthly_investment * (((1 + monthly_rate) ** periods - 1) / monthly_rate) * (1 + monthly_rate)


def benchmark_delta(nav_values: pd.Series, benchmark_annual_return_pct: float) -> dict:
    cleaned = pd.to_numeric(nav_values, errors="coerce").dropna()
    if cleaned.empty:
        return {"observed_change_pct": None, "benchmark_change_pct": None, "delta_pct": None}

    observed_change = ((cleaned.iloc[-1] / cleaned.iloc[0]) - 1) * 100 if len(cleaned) > 1 else 0.0
    benchmark_change = benchmark_annual_return_pct
    return {
        "observed_change_pct": round(float(observed_change), 2),
        "benchmark_change_pct": round(float(benchmark_change), 2),
        "delta_pct": round(float(observed_change - benchmark_change), 2),
    }


def adjust_df_group_splits(grp: pd.DataFrame) -> pd.DataFrame:
    if grp.empty or "NAV" not in grp.columns:
        return grp
    grp = grp.sort_values("NAV Date").copy()
    navs = grp["NAV"].values.astype(float)
    n = len(navs)
    for i in range(1, n):
        prev_nav = navs[i-1]
        curr_nav = navs[i]
        if prev_nav > 1.0 and curr_nav > 1.0:
            ratio = curr_nav / prev_nav
            if 0.01 <= ratio <= 0.65:
                # Scale all previous NAV values in this group by ratio
                navs[:i] *= ratio
    grp["NAV"] = navs
    return grp

def adjust_dataframe_splits(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "Scheme Code" not in df.columns:
        return df
    return df.groupby("Scheme Code", group_keys=False).apply(adjust_df_group_splits)
