/**
 * Client for the Python API that wraps nav_fetcher.
 *
 * The Python cannot live on Vercel — Streamlit's engine needs a persistent
 * process and a single AUM pull is allowed an hour — so it runs on a container
 * host and this app talks to it over HTTP.
 */

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:8077";

export type Fund = {
  isin: string;
  scheme_name: string;
  amc: string;
  asset_class: string;
  plan_type: string | null;
  option_type: string | null;
  latest_nav: number | null;
  latest_nav_date: string | null;
};

export type PerformanceRow = Record<string, string | number | null>;

export type Performance = {
  isin: string;
  scheme_name: string;
  start: string;
  end: string;
  row_count: number;
  columns: string[];
  rows: PerformanceRow[];
  note: string | null;
};

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { signal, cache: "no-store" });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* the body was not JSON; the status line is all we have */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const searchFunds = (q: string, signal?: AbortSignal) =>
  get<Fund[]>(`/funds?q=${encodeURIComponent(q)}&limit=25`, signal);

export const fetchPerformance = (
  isin: string,
  start: string,
  end: string,
  liveAum: boolean,
  signal?: AbortSignal,
) =>
  get<Performance>(
    `/performance?isin=${encodeURIComponent(isin)}&start=${start}&end=${end}` +
      `&fetch_live_aum=${liveAum}`,
    signal,
  );

/** Column names as the Python export emits them. */
export const COL = {
  date: "NAV Date",
  nav: "NAVs",
  aum: "Actual AUM as on current date",
  ret: "Daily return",
  flow: "Net flows on current day",
} as const;

export const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return v === null || v === undefined || Number.isNaN(n) ? null : n;
};

/** "01-09-2026" (as the export writes it) -> Date */
export const parseDMY = (s: string): Date | null => {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
};

export const fmtNum = (v: number | null, dp = 2): string =>
  v === null ? "—" : v.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });

/** Indian mutual fund figures are quoted in crore. */
export const fmtCr = (v: number | null): string =>
  v === null ? "—" : `₹${fmtNum(v, 2)} cr`;

export const fmtPct = (v: number | null, dp = 2): string =>
  v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;

// ─── Historical ISIN export ──────────────────────────────────────────────────

export type ExportOptions = {
  isins: string[];
  start: string;
  end: string;
  carry_forward: boolean;
  skip_saturdays: boolean;
  skip_sundays: boolean;
  want_nav: boolean;
  want_aum: boolean;
  want_flows: boolean;
  fetch_live_aum: boolean;
};

/** Posts the options and hands back the workbook, the way st.download_button did. */
export async function exportHistorical(
  opts: ExportOptions,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string; rows: string | null; note: string | null }> {
  const res = await fetch(`${API_BASE}/export/historical`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  const disp = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disp);
  return {
    blob: await res.blob(),
    filename: match ? match[1] : "nav_export.xlsx",
    rows: res.headers.get("X-Row-Count"),
    note: res.headers.get("X-Note") || null,
  };
}

/** Hands a blob to the browser as a download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── AUM cache ───────────────────────────────────────────────────────────────

export type AumCacheStats = {
  files: number;
  dates: number;
  mb: number;
  earliest: string | null;
  latest: string | null;
  sync_available: boolean;
  sync_detail: string;
  repo: string;
};

export const fetchAumCacheStats = (signal?: AbortSignal) =>
  get<AumCacheStats>("/aum-cache/stats", signal);

// ─── MIS Generator ───────────────────────────────────────────────────────────

export type Holding = {
  "Scheme Name": string;
  ISIN: string;
  "Allocation (%)": number;
  Benchmark: string;
};

export type MisTable = {
  key: string;
  title: string;
  columns: string[];
  headers: string[];
  rows: Record<string, string | number | null>[];
  footers: { label: string; values: Record<string, number | null> }[];
  pct_cols: string[];
  colour_cols: string[];
};

export type MisResult = {
  report_id: string;
  dates: Record<string, string>;
  warnings: string[];
  include_flows: boolean;
  current: MisTable[];
  previous: MisTable[];
  benchmarks: Record<string, string | number | null>[];
};

export type MisOptions = {
  portfolio: Holding[];
  previous_portfolio: Holding[] | null;
  start_date: string;
  end_date: string;
  include_flows: boolean;
  since_inception: boolean;
  skip_saturdays: boolean;
  mis3_start: string | null;
  mis3_end: string | null;
};

export const fetchDefaultPortfolio = (signal?: AbortSignal) =>
  get<{ portfolio: Holding[] }>("/mis/default-portfolio", signal);

export type PreviousPortfolio = {
  found: boolean;
  detail?: string;
  effective?: string;
  announced?: string | null;
  label?: string;
  unmapped?: string[];
  portfolio: Holding[];
};

export async function fetchPreviousPortfolio(
  portfolio: Holding[], signal?: AbortSignal,
): Promise<PreviousPortfolio> {
  const res = await fetch(`${API_BASE}/mis/previous-portfolio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(portfolio),
    signal,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export async function generateMis(opts: MisOptions, signal?: AbortSignal): Promise<MisResult> {
  const res = await fetch(`${API_BASE}/mis/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return res.json();
}

export async function downloadMis(reportId: string, fmt: "xlsx" | "pdf") {
  const res = await fetch(`${API_BASE}/mis/${reportId}/export?fmt=${fmt}`);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  const disp = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(disp);
  saveBlob(await res.blob(), m ? m[1] : `MIS_Report.${fmt}`);
}

// ─── Fund Performance by category ────────────────────────────────────────────

export const MATURITY_TYPES = ["Open Ended", "Close Ended", "Interval"] as const;
export const CATEGORIES = ["Equity", "Debt", "Hybrid", "Solution Oriented", "Other"] as const;
export const CATEGORY_IDS: Record<string, number> = {
  Equity: 1, Debt: 2, Hybrid: 3, "Solution Oriented": 4, Other: 5,
};

export type Subcategory = { name: string; id: number };

export const fetchSubcategories = (categoryId: number, signal?: AbortSignal) =>
  get<{ source: string; subcategories: Subcategory[] }>(
    `/subcategories?category_id=${categoryId}`, signal);

export type CategoryOptions = {
  maturity_type: string;
  category: string;
  subcategory_id: number | null;
  start: string;
  end: string;
  carry_forward: boolean;
  skip_saturdays: boolean;
  skip_sundays: boolean;
  want_nav: boolean;
  want_aum: boolean;
  want_flows: boolean;
  fetch_live_aum: boolean;
};

export type CategoryResult = {
  matched_scheme_rows: number;
  regular_growth_funds: number;
  excluded_direct: number;
  excluded_options: number;
  row_count: number;
  columns: string[];
  rows: PerformanceRow[];
  note: string | null;
};

export async function fetchByCategory(
  opts: CategoryOptions, signal?: AbortSignal,
): Promise<CategoryResult> {
  const res = await fetch(`${API_BASE}/performance/category`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
    signal,
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = String(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return res.json();
}

// ─── Portfolio Bucket Tracker ────────────────────────────────────────────────

export type BucketHolding = {
  "Scheme Name": string;
  ISIN: string;
  "Weight (%)": number;
};

export type Bucket = { name: string; holdings: BucketHolding[] };

export type TrackResult = {
  report_id: string;
  metrics: Record<string, number | string | null>;
  latest_nav_date: string | null;
  tracker_columns: string[];
  tracker: Record<string, string | number | null>[];
  composition_columns: string[];
  composition: Record<string, string | number | null>[];
};

export const fetchBuckets = (signal?: AbortSignal) =>
  get<{ buckets: Bucket[] }>("/buckets", signal);

async function send<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const b = await res.json();
      if (b?.detail) detail = String(b.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const saveBucket = (name: string, holdings: BucketHolding[]) =>
  send<{ saved: string }>(`/buckets/${encodeURIComponent(name)}`, "PUT", holdings);

export const deleteBucket = (name: string) =>
  send<{ deleted: string }>(`/buckets/${encodeURIComponent(name)}`, "DELETE");

export const trackBucket = (opts: {
  holdings: BucketHolding[];
  start_date: string;
  initial_amount: number;
  skip_sundays: boolean;
}) => send<TrackResult>("/buckets/track", "POST", opts);

export async function downloadBucketExcel(reportId: string) {
  const res = await fetch(`${API_BASE}/buckets/${reportId}/export`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const disp = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(disp);
  saveBlob(await res.blob(), m ? m[1] : "portfolio_tracker.xlsx");
}

// ─── Fund Performance exports ────────────────────────────────────────────────

async function downloadFrom(url: string, fallback: string) {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const b = await res.json();
      if (b?.detail) detail = String(b.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  const disp = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(disp);
  saveBlob(await res.blob(), m ? m[1] : fallback);
}

export const downloadFundExcel = (
  isin: string, start: string, end: string, liveAum: boolean,
) => downloadFrom(
  `${API_BASE}/performance/export?isin=${encodeURIComponent(isin)}&start=${start}&end=${end}` +
    `&fetch_live_aum=${liveAum}`,
  "fund_performance.xlsx",
);

export const downloadAumCacheExcel = () =>
  downloadFrom(`${API_BASE}/aum-cache/export`, "aum_cache_summary.xlsx");

export async function downloadCategoryExcel(opts: CategoryOptions) {
  const res = await fetch(`${API_BASE}/performance/category/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const b = await res.json();
      if (b?.detail) detail = String(b.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  const disp = res.headers.get("Content-Disposition") ?? "";
  const m = /filename="([^"]+)"/.exec(disp);
  saveBlob(await res.blob(), m ? m[1] : "fund_performance.xlsx");
}
