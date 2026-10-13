"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { exportHistorical, saveBlob } from "@/lib/api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthsAgo = (n: number) => { const d = new Date(); d.setMonth(d.getMonth() - n); return d; };

export default function HistoricalExportPage() {
  // Same controls as the Streamlit page, in the same order.
  const [isinText, setIsinText] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [today, setToday] = useState("");
  const [carryForward, setCarryForward] = useState(true);
  const [skipSaturdays, setSkipSaturdays] = useState(true);
  const [skipSundays, setSkipSundays] = useState(true);
  const [wantNav, setWantNav] = useState(true);
  const [wantAum, setWantAum] = useState(true);
  const [wantFlows, setWantFlows] = useState(true);
  const [liveAum, setLiveAum] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ filename: string; rows: string | null; note: string | null } | null>(null);

  useEffect(() => {
    setStart(iso(monthsAgo(3)));
    setEnd(iso(new Date()));
    setToday(iso(new Date()));
  }, []);

  // One per line or comma-separated, as the Streamlit text area accepted.
  const isins = isinText.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);

  const run = async () => {
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await exportHistorical({
        isins, start, end,
        carry_forward: carryForward, skip_saturdays: skipSaturdays, skip_sundays: skipSundays,
        want_nav: wantNav, want_aum: wantAum, want_flows: wantFlows, fetch_live_aum: liveAum,
      });
      saveBlob(res.blob, res.filename);
      setDone({ filename: res.filename, rows: res.rows, note: res.note });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Flows need both NAV and AUM; the Python forces this, so the UI shows it.
  const forced = wantFlows;

  return (
    <>
      <SiteHeader breadcrumb={["Research", "Historical Export"]} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Historical Export</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Pivoted NAV and AUM across a list of ISINs, written as a styled Excel workbook —
              one row per scheme, one column per date.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Target ISINs</CardTitle>
              <CardDescription>One per line, or comma-separated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                value={isinText}
                onChange={(e) => setIsinText(e.target.value)}
                rows={6}
                spellCheck={false}
                placeholder={"INF179K01608\nINF174K01DS9\nINF109K01BZ4"}
                className="w-full rounded-md border border-input bg-background p-3 font-mono text-sm
                           placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                {isins.length} ISIN{isins.length === 1 ? "" : "s"} recognised
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="s" className="mb-1.5 block text-xs text-muted-foreground">Start Date</label>
                  <Input id="s" type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="e" className="mb-1.5 block text-xs text-muted-foreground">End Date</label>
                  <Input id="e" type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-3">
                <CheckboxField label="Carry forward NAV on holidays/weekends" checked={carryForward} onChange={setCarryForward} />
                <CheckboxField label="Skip Saturdays" checked={skipSaturdays} onChange={setSkipSaturdays} />
                <CheckboxField label="Skip Sundays" checked={skipSundays} onChange={setSkipSundays} />
                <CheckboxField label="Want NAV" checked={wantNav || forced} onChange={setWantNav}
                               hint={forced ? "(required by Flows)" : undefined} />
                <CheckboxField label="Want AUM" checked={wantAum || forced} onChange={setWantAum}
                               hint={forced ? "(required by Flows)" : undefined} />
                <CheckboxField label="Want Flows" checked={wantFlows} onChange={setWantFlows} />
                <CheckboxField label="Fetch actual daily AUM from AMFI" hint="(slower)"
                               checked={liveAum} onChange={setLiveAum} className="sm:col-span-2 lg:col-span-3" />
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button onClick={run} disabled={busy || !isins.length || !start || !end}>
                  {busy ? <Loader2 className="animate-spin" /> : <Download />}
                  {busy ? "Fetching…" : "Fetch & generate Excel"}
                </Button>
                {!isins.length && <p className="text-xs text-muted-foreground">Add at least one ISIN.</p>}
              </div>
            </CardContent>
          </Card>

          {busy && (
            <Card><CardContent className="px-5 py-5 text-sm text-muted-foreground">
              Fetching from AMFI. Each extra ISIN and each extra day adds to the wait; published
              AUM adds a call per day on the first run, then answers from cache.
            </CardContent></Card>
          )}

          {error && (
            <Card><CardContent className="px-5 py-5">
              <p className="text-sm font-medium text-loss">Export failed</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </CardContent></Card>
          )}

          {done && (
            <Card><CardContent className="px-5 py-5">
              <p className="text-sm font-medium text-gain">Downloaded {done.filename}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {done.rows} row(s) written.{done.note ? ` ${done.note}` : ""}
              </p>
            </CardContent></Card>
          )}
        </div>
      </main>
    </>
  );
}
