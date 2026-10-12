"use client";

import { useEffect, useState } from "react";
import FundSearch from "@/components/FundSearch";
import FlowsTable from "@/components/FlowsTable";
import PerformanceChart, { Point } from "@/components/PerformanceChart";
import { Metrics, summarise } from "@/components/Metrics";
import { COL, Fund, Performance, fetchPerformance, num } from "@/lib/api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
};

export default function Home() {
  const [fund, setFund] = useState<Fund | null>(null);
  // Set after mount: Next 16 refuses to prerender a component that reads the
  // clock, because the built HTML would be stamped with the build date.
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [today, setToday] = useState("");
  const [liveAum, setLiveAum] = useState(true);
  const [data, setData] = useState<Performance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStart(iso(monthsAgo(3)));
    setEnd(iso(new Date()));
    setToday(iso(new Date()));
  }, []);

  const run = async (f: Fund | null = fund) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    setData(null);
    try {
      setData(await fetchPerformance(f.isin, start, end, liveAum));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const rows = data?.rows ?? [];
  const dates = rows.map((r) => String(r[COL.date] ?? ""));
  const navs = rows.map((r) => num(r[COL.nav]));
  const aums = rows.map((r) => num(r[COL.aum]));
  const flows = rows.map((r) => num(r[COL.flow]));
  const points: Point[] = rows.map((r, i) => ({
    date: dates[i], nav: navs[i], flow: flows[i],
  }));

  return (
    <main className="min-h-screen">
      {/* Masthead. The search is the hero: naming a fund is the whole point. */}
      <header className="bg-ink px-6 pb-10 pt-8 text-white">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">NAV Terminal</h1>
              <p className="mt-0.5 text-sm text-white/55">
                NAV, AUM and net flows for any Indian mutual fund — sourced from AMFI
              </p>
            </div>
            <span className="hidden text-xs text-white/40 sm:block">AMFI · CRISIL feed</span>
          </div>

          <div className="mt-7">
            <FundSearch selected={fund} onSelect={(f) => { setFund(f); setData(null); setError(null); }} />
          </div>

          {fund && (
            <div className="mt-5 flex flex-wrap items-end gap-4">
              <Field label="From">
                <input type="date" value={start} max={end}
                  onChange={(e) => setStart(e.target.value)} className={dateInput} />
              </Field>
              <Field label="To">
                <input type="date" value={end} min={start} max={today}
                  onChange={(e) => setEnd(e.target.value)} className={dateInput} />
              </Field>
              <label className="flex items-center gap-2 pb-2.5 text-sm text-white/70">
                <input type="checkbox" checked={liveAum}
                  onChange={(e) => setLiveAum(e.target.checked)}
                  className="h-4 w-4 accent-white" />
                Published AUM
                <span className="text-xs text-white/35">(slower)</span>
              </label>
              <button type="button" onClick={() => run()} disabled={busy || !start || !end}
                className="ml-auto rounded-lg bg-white px-6 py-2.5 text-sm font-semibold text-ink
                           transition-opacity hover:opacity-90 disabled:opacity-50">
                {busy ? "Fetching…" : "Get data"}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-8">
        {fund && (
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">{fund.scheme_name}</h2>
            <p className="mt-1 text-sm text-ink-muted">
              {fund.amc} · <span className="figure">{fund.isin}</span> ·{" "}
              {fund.asset_class.replace(/^Open Ended Schemes\(|\)$/g, "")}
            </p>
          </div>
        )}

        {busy && <Loading />}

        {error && (
          <div className="rounded-xl border border-rule bg-surface p-5">
            <p className="font-medium text-loss">Could not fetch that fund</p>
            <p className="mt-1 text-sm text-ink-muted">{error}</p>
            <p className="mt-3 text-sm text-ink-faint">
              The data service may be asleep or AMFI may be refusing requests. Try a shorter
              window, or turn off <em>Published AUM</em> for a NAV-only run.
            </p>
          </div>
        )}

        {!fund && !busy && <EmptyState />}

        {data && !busy && (
          <div className="space-y-6">
            <Metrics stats={summarise(navs, aums, flows, dates)} />
            <PerformanceChart data={points} />
            <FlowsTable rows={rows} />
            {data.note && (
              <p className="text-sm text-ink-muted">Note from the fetcher: {data.note}</p>
            )}
          </div>
        )}
      </div>

      <footer className="mx-auto max-w-6xl border-t border-rule px-6 py-6 text-xs text-ink-faint">
        NAV from AMFI&rsquo;s daily file. AUM from AMFI&rsquo;s fund-performance disclosure
        (operated by CRISIL), published about two days in arrears. Net flow removes the
        market move from the AUM change.
      </footer>
    </main>
  );
}

const dateInput =
  "rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm text-white " +
  "[color-scheme:dark] focus:border-white/35 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-white/45">{label}</span>
      {children}
    </label>
  );
}

function Loading() {
  return (
    <div className="rounded-xl border border-rule bg-surface p-8">
      <div className="relative h-1 w-full overflow-hidden rounded bg-surface-sunk sweep" />
      <p className="mt-5 text-sm font-medium text-ink">Fetching from AMFI…</p>
      <p className="mt-1 text-sm text-ink-muted">
        NAV history comes from AMFI&rsquo;s portal and usually takes ten to twenty seconds.
        Published AUM adds a call per day on the first run, then answers from cache.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-rule-strong bg-surface px-8 py-14 text-center">
      <p className="text-lg font-medium text-ink">Search for a fund to begin</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Start typing a scheme name above. One fund is fetched at a time, which is what keeps
        a lookup to seconds rather than pulling a whole category.
      </p>
    </div>
  );
}
