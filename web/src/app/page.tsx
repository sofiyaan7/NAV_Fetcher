"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { FundCombobox } from "@/components/fund-combobox";
import { StatCards, summarise } from "@/components/stat-cards";
import { NavFlowChart, Point } from "@/components/nav-flow-chart";
import { DailyTable } from "@/components/daily-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { COL, Fund, Performance, fetchPerformance, num } from "@/lib/api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };

export default function FundPerformancePage() {
  const [fund, setFund] = useState<Fund | null>(null);
  // Set after mount: Next refuses to prerender a component that reads the clock,
  // because the built HTML would be stamped with the build date.
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [today, setToday] = useState("");
  const [liveAum, setLiveAum] = useState(true);
  const [data, setData] = useState<Performance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStart(iso(monthsAgo(1)));
    setEnd(iso(new Date()));
    setToday(iso(new Date()));
  }, []);

  const run = async () => {
    if (!fund) return;
    setBusy(true); setError(null); setData(null);
    try {
      setData(await fetchPerformance(fund.isin, start, end, liveAum));
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
  const points: Point[] = rows.map((r, i) => ({ date: dates[i], nav: navs[i], flow: flows[i] }));

  return (
    <>
      <SiteHeader breadcrumb={["Research", "Fund Performance"]} />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-5 p-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Fund Performance</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              NAV, published AUM and net flows for a single scheme. One fund at a time, which is
              what keeps a lookup to seconds.
            </p>
          </div>

          {/* Query bar */}
          <Card>
            <CardContent className="grid gap-3 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] lg:items-end">
              <div className="min-w-0">
                <label className="mb-1.5 block text-xs text-muted-foreground">Fund</label>
                <FundCombobox selected={fund} onSelect={(f) => { setFund(f); setData(null); setError(null); }} />
              </div>
              <div>
                <label htmlFor="from" className="mb-1.5 block text-xs text-muted-foreground">From</label>
                <Input id="from" type="date" value={start} max={end}
                       onChange={(e) => setStart(e.target.value)} className="w-[9.5rem]" />
              </div>
              <div>
                <label htmlFor="to" className="mb-1.5 block text-xs text-muted-foreground">To</label>
                <Input id="to" type="date" value={end} min={start} max={today}
                       onChange={(e) => setEnd(e.target.value)} className="w-[9.5rem]" />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input type="checkbox" checked={liveAum} onChange={(e) => setLiveAum(e.target.checked)}
                       className="size-4 accent-primary" />
                <span>Published AUM</span>
              </label>
              <Button onClick={run} disabled={!fund || busy || !start || !end}>
                {busy && <Loader2 className="animate-spin" />}
                {busy ? "Fetching…" : "Run"}
              </Button>
            </CardContent>
          </Card>

          {fund && (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-lg font-semibold tracking-tight">{fund.scheme_name}</h2>
              <p className="text-sm text-muted-foreground">
                {fund.amc} · <span className="font-mono text-xs">{fund.isin}</span> ·{" "}
                {fund.asset_class.replace(/^Open Ended Schemes\(|\)$/g, "")}
              </p>
            </div>
          )}

          {busy && <LoadingState />}

          {error && (
            <Card>
              <CardContent className="px-5 py-5">
                <p className="text-sm font-medium text-loss">Could not fetch that fund</p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try a shorter window, or clear <em>Published AUM</em> for a NAV-only run.
                </p>
              </CardContent>
            </Card>
          )}

          {!fund && !busy && (
            <Card className="border-dashed">
              <CardContent className="px-5 py-14 text-center">
                <p className="font-medium">Search for a fund to begin</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                  Start typing a scheme name above. The old page made you pick a whole category;
                  naming one fund is what makes this quick.
                </p>
              </CardContent>
            </Card>
          )}

          {data && !busy && (
            <div className="space-y-5">
              <StatCards stats={summarise(navs, aums, flows, dates)} />
              <NavFlowChart data={points} />
              <DailyTable rows={rows} />
              {data.note && <p className="text-sm text-muted-foreground">Note from the fetcher: {data.note}</p>}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function LoadingState() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[6.5rem]" />)}
      </div>
      <Card>
        <CardContent className="px-5 py-5">
          <Skeleton className="h-72 w-full" />
          <p className="mt-4 text-sm text-muted-foreground">
            Fetching from AMFI. NAV history comes from their portal and usually takes ten to
            twenty seconds; published AUM adds a call per day on the first run, then answers
            from cache.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
