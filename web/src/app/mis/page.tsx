"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, RotateCcw } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PortfolioEditor } from "@/components/portfolio-editor";
import { MisTable } from "@/components/mis-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import {
  Holding, MisResult, PreviousPortfolio,
  downloadMis, fetchDefaultPortfolio, fetchPreviousPortfolio, generateMis,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const fyStart = (d: Date) => {
  // India's financial year starts 1 April.
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-04-01`;
};

const PREV_SOURCES = ["Model Portfolio History", "Manual Entry / Edit", "None"] as const;
type PrevSource = (typeof PREV_SOURCES)[number];

export default function MisPage() {
  const [portfolio, setPortfolio] = useState<Holding[]>([]);
  const [prevSource, setPrevSource] = useState<PrevSource>("Model Portfolio History");
  const [prevPortfolio, setPrevPortfolio] = useState<Holding[]>([]);
  const [prevMeta, setPrevMeta] = useState<PreviousPortfolio | null>(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [includeFlows, setIncludeFlows] = useState(false);
  const [sinceInception, setSinceInception] = useState(false);
  const [skipSaturdays, setSkipSaturdays] = useState(true);
  const [separateMis3, setSeparateMis3] = useState(false);
  const [mis3Start, setMis3Start] = useState("");
  const [mis3End, setMis3End] = useState("");

  const [result, setResult] = useState<MisResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    setEndDate(iso(now));
    setStartDate(fyStart(now));
    setMis3Start(fyStart(now));
    setMis3End(iso(now));
    fetchDefaultPortfolio().then((d) => setPortfolio(d.portfolio)).catch(() => {});
  }, []);

  const loadPrevious = useCallback(async (rows: Holding[]) => {
    if (!rows.length) return;
    try {
      const prev = await fetchPreviousPortfolio(rows);
      setPrevMeta(prev);
      setPrevPortfolio(prev.found ? prev.portfolio : []);
    } catch {
      setPrevMeta(null);
    }
  }, []);

  useEffect(() => {
    if (prevSource === "Model Portfolio History" && portfolio.length) loadPrevious(portfolio);
  }, [prevSource, portfolio, loadPrevious]);

  const reset = async () => {
    const d = await fetchDefaultPortfolio();
    setPortfolio(d.portfolio);
    setResult(null);
  };

  const generate = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      setResult(await generateMis({
        portfolio,
        previous_portfolio: prevSource === "None" ? null : prevPortfolio.length ? prevPortfolio : null,
        start_date: startDate,
        end_date: endDate,
        include_flows: includeFlows,
        since_inception: sinceInception,
        skip_saturdays: skipSaturdays,
        mis3_start: separateMis3 ? mis3Start : null,
        mis3_end: separateMis3 ? mis3End : null,
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = async (fmt: "xlsx" | "pdf") => {
    if (!result) return;
    setDownloading(fmt);
    try {
      await downloadMis(result.report_id, fmt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <>
      <SiteHeader breadcrumb={["Portfolio", "MIS Generator"]} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-5 p-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">MIS Generator</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Portfolio against Nifty and against each scheme&rsquo;s own benchmark — for the day,
              the period, and since 1 April. Benchmarks come from a passive index fund on the same
              AMFI feed, and show N/A where one cannot be sourced.
            </p>
          </div>

          {/* 1. Portfolio Input */}
          <Card>
            <CardHeader className="flex-row items-center border-b">
              <div>
                <CardTitle>1. Portfolio Input</CardTitle>
                <CardDescription>Scheme name, ISIN, allocation and benchmark.</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={reset} className="ml-auto">
                <RotateCcw /> Reset Sample Template
              </Button>
            </CardHeader>
            <CardContent className="pt-4">
              <PortfolioEditor rows={portfolio} onChange={(r) => { setPortfolio(r); setResult(null); }} />
            </CardContent>
          </Card>

          {/* 2. Previous Portfolio */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle>2. Previous Portfolio (optional)</CardTitle>
              <CardDescription>
                The second comparison block beneath each MIS table. Leave as None to skip it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex flex-wrap gap-2">
                {PREV_SOURCES.map((s) => (
                  <Button key={s} size="sm" variant={prevSource === s ? "default" : "outline"}
                          onClick={() => { setPrevSource(s); setResult(null); }}>
                    {s}
                  </Button>
                ))}
              </div>

              {prevSource === "Model Portfolio History" && prevMeta && (
                prevMeta.found ? (
                  <>
                    <p className="text-sm">
                      Previous model portfolio — <strong>{prevMeta.label}</strong> ·{" "}
                      {prevMeta.portfolio.length} schemes, read from the rebalance history file.
                    </p>
                    {!!prevMeta.unmapped?.length && (
                      <p className="text-sm text-loss">
                        No benchmark on file for: {prevMeta.unmapped.join(", ")}
                      </p>
                    )}
                    <PortfolioEditor rows={prevPortfolio} readOnly />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{prevMeta.detail}</p>
                )
              )}

              {prevSource === "Manual Entry / Edit" && (
                <PortfolioEditor rows={prevPortfolio} onChange={setPrevPortfolio} />
              )}

              {prevSource === "None" && (
                <p className="text-sm text-muted-foreground">
                  Only the current portfolio will be written.
                </p>
              )}
            </CardContent>
          </Card>

          {/* 3. Settings */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle>3. Report Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label htmlFor="ps" className="mb-1.5 block text-xs text-muted-foreground">Period Start Date</label>
                  <Input id="ps" type="date" value={startDate} max={endDate}
                         onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="rd" className="mb-1.5 block text-xs text-muted-foreground">Report Date</label>
                  <Input id="rd" type="date" value={endDate} min={startDate}
                         onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
                <CheckboxField label="Include Flows column" checked={includeFlows} onChange={setIncludeFlows} />
                <CheckboxField label="Measure new funds from inception" checked={sinceInception} onChange={setSinceInception} />
                <CheckboxField label="Skip Saturday / Sunday NAV marks" checked={skipSaturdays} onChange={setSkipSaturdays} />
                <CheckboxField label="Use a separate date range for MIS 3" checked={separateMis3} onChange={setSeparateMis3} />
              </div>

              {separateMis3 && (
                <div className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label htmlFor="m3s" className="mb-1.5 block text-xs text-muted-foreground">MIS 3 Start Date</label>
                    <Input id="m3s" type="date" value={mis3Start} max={mis3End}
                           onChange={(e) => setMis3Start(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor="m3e" className="mb-1.5 block text-xs text-muted-foreground">MIS 3 End Date</label>
                    <Input id="m3e" type="date" value={mis3End} min={mis3Start}
                           onChange={(e) => setMis3End(e.target.value)} />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button onClick={generate} disabled={busy || !portfolio.length || !startDate || !endDate}>
                  {busy && <Loader2 className="animate-spin" />}
                  {busy ? "Generating…" : "Generate MIS Reports"}
                </Button>
                {result && (
                  <>
                    <Button variant="outline" onClick={() => download("xlsx")} disabled={downloading !== null}>
                      {downloading === "xlsx" ? <Loader2 className="animate-spin" /> : <Download />}
                      Download Excel (.xlsx)
                    </Button>
                    <Button variant="outline" onClick={() => download("pdf")} disabled={downloading !== null}>
                      {downloading === "pdf" ? <Loader2 className="animate-spin" /> : <FileText />}
                      Download PDF (.pdf)
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {busy && (
            <Card><CardContent className="px-5 py-5 text-sm text-muted-foreground">
              Contacting AMFI and building the pack. This runs one NAV pass across every scheme and
              every benchmark proxy, so it usually takes a minute or two.
            </CardContent></Card>
          )}

          {error && (
            <Card><CardContent className="px-5 py-5">
              <p className="text-sm font-medium text-loss">Could not build the report</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </CardContent></Card>
          )}

          {result && (
            <div className="space-y-5">
              {!!result.warnings.length && (
                <Card><CardContent className="space-y-1.5 px-5 py-4">
                  {result.warnings.map((w, i) => (
                    <p key={i} className="text-sm text-muted-foreground">{w}</p>
                  ))}
                </CardContent></Card>
              )}
              {result.current.map((t) => <MisTable key={t.key} table={t} />)}
              {!!result.previous.length && (
                <>
                  <h2 className="pt-2 text-base font-semibold">Previous portfolio</h2>
                  {result.previous.map((t) => <MisTable key={`p-${t.key}`} table={t} />)}
                </>
              )}
              {!!result.benchmarks.length && (
                <Card>
                  <CardHeader className="border-b">
                    <CardTitle>Benchmark sources</CardTitle>
                    <CardDescription>Which index fund stood in for each benchmark.</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs text-muted-foreground">
                            {Object.keys(result.benchmarks[0]).map((k) => (
                              <th key={k} className="px-3 py-2 font-medium">{k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.benchmarks.map((b, i) => (
                            <tr key={i} className="border-b last:border-0">
                              {Object.keys(result.benchmarks[0]).map((k) => (
                                <td key={k} className={cn("px-3 py-2",
                                     String(b[k]) === "UNAVAILABLE" && "text-loss")}>
                                  {b[k] === null ? "—" : String(b[k])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
