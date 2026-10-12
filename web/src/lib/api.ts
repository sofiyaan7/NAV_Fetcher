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
