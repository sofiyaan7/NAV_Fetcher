"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { BucketChart } from "@/components/bucket-chart";
import { CategoryTable } from "@/components/category-table";
import { StatCards } from "@/components/stat-cards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Bucket, BucketHolding, TrackResult,
  deleteBucket, downloadBucketExcel, fetchBuckets, saveBucket, trackBucket,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const money = (v: unknown) =>
  typeof v === "number" ? `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—";
const pct = (v: unknown) =>
  typeof v === "number" ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}%` : "—";

export default function BucketsPage() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [active, setActive] = useState<string>("");
  const [holdings, setHoldings] = useState<BucketHolding[]>([]);
  const [newName, setNewName] = useState("");

  const [startDate, setStartDate] = useState("");
  const [amount, setAmount] = useState("1000000");
  const [skipSundays, setSkipSundays] = useState(true);

  const [result, setResult] = useState<TrackResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (prefer?: string) => {
    try {
      const d = await fetchBuckets();
      setBuckets(d.buckets);
      const pick = prefer && d.buckets.some((b) => b.name === prefer)
        ? prefer
        : d.buckets[0]?.name ?? "";
      setActive(pick);
      setHoldings(d.buckets.find((b) => b.name === pick)?.holdings ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const now = new Date();
    setStartDate(`${now.getFullYear()}-01-01`);
    load();
  }, [load]);

  const switchTo = (name: string) => {
    setActive(name);
    setHoldings(buckets.find((b) => b.name === name)?.holdings ?? []);
    setResult(null);           // stale results belong to the previous bucket
    setNotice(null);
  };

  const edit = (i: number, key: keyof BucketHolding, value: string) => {
    setHoldings((rows) => rows.map((r, j) =>
      j === i ? { ...r, [key]: key === "Weight (%)" ? Number(value) || 0 : value } : r));
    setResult(null);
  };

  const persist = async () => {
    setSaving(true); setError(null);
    try {
      await saveBucket(active, holdings);
      setNotice(`Saved “${active}”.`);
      await load(active);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true); setError(null);
    try {
      await saveBucket(name, holdings.length ? holdings : [{ "Scheme Name": "", ISIN: "", "Weight (%)": 0 }]);
      setNewName(""); setResult(null);
      await load(name);
      setNotice(`Created “${name}”.`);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  const remove = async () => {
    setSaving(true); setError(null);
    try {
      await deleteBucket(active);
      setResult(null);
      await load();
      setNotice(`Deleted “${active}”.`);
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  const track = async () => {
    setBusy(true); setError(null); setNotice(null); setResult(null);
    try {
      setResult(await trackBucket({
        holdings, start_date: startDate,
        initial_amount: Number(amount) || 0, skip_sundays: skipSundays,
      }));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const download = async () => {
    if (!result) return;
    setDownloading(true);
    try { await downloadBucketExcel(result.report_id); }
    catch (e) { setError((e as Error).message); }
    finally { setDownloading(false); }
  };

  const weightSum = holdings.reduce((a, r) => a + (Number(r["Weight (%)"]) || 0), 0);
  const m = result?.metrics ?? {};

  return (
    <>
      <SiteHeader breadcrumb={["Portfolio", "Bucket Tracker"]} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-5 p-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Bucket Tracker</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A named basket of funds with weights, run from the day you started investing to
              today, against the same money in Nifty 50 and Nifty 500.
            </p>
          </div>

          {/* Bucket management */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Bucket Management</CardTitle>
              <CardDescription>Create, switch or delete fund buckets. Buckets are saved on the server.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
              <SelectField id="bk" label="Active bucket" value={active} onChange={switchTo}
                           options={buckets.map((b) => ({ label: b.name, value: b.name }))} />
              <div className="flex items-end">
                <Button variant="outline" onClick={remove} disabled={saving || buckets.length < 2}
                        title={buckets.length < 2 ? "Create another bucket first" : undefined}>
                  <Trash2 /> Delete Active Bucket
                </Button>
              </div>
              <div>
                <label htmlFor="nb" className="mb-1.5 block text-xs text-muted-foreground">New Bucket Name</label>
                <Input id="nb" value={newName} placeholder="e.g. Aggressive Equity"
                       onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button variant="outline" onClick={create} disabled={saving || !newName.trim()}>
                  <Plus /> Create New Bucket
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Investment setup */}
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Investment Setup</CardTitle>
              <CardDescription>Pick when you started investing — the tracker runs to today automatically.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="sd" className="mb-1.5 block text-xs text-muted-foreground">Start date</label>
                <Input id="sd" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setResult(null); }} />
              </div>
              <div>
                <label htmlFor="amt" className="mb-1.5 block text-xs text-muted-foreground">Investment Amount (₹)</label>
                <Input id="amt" inputMode="numeric" value={amount}
                       onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "")); setResult(null); }} />
              </div>
              <div className="flex items-end pb-2">
                <CheckboxField label="Skip Sundays" checked={skipSundays} onChange={(v) => { setSkipSundays(v); setResult(null); }} />
              </div>
            </CardContent>
          </Card>

          {/* Composition */}
          <Card>
            <CardHeader className="flex-row items-center border-b">
              <div>
                <CardTitle>Bucket Composition</CardTitle>
                <CardDescription>Add or remove funds and set weights for “{active}”.</CardDescription>
              </div>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={persist} disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : null} Save bucket
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              <div className="overflow-hidden rounded-md border">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted">
                      <TableRow>
                        <TableHead className="w-[46%]">Scheme Name</TableHead>
                        <TableHead className="w-[26%]">ISIN</TableHead>
                        <TableHead className="text-right">Weight (%)</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holdings.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-1">
                            <input value={r["Scheme Name"]} onChange={(e) => edit(i, "Scheme Name", e.target.value)}
                                   aria-label={`Scheme name, row ${i + 1}`}
                                   className="w-full bg-transparent px-1 py-0.5 text-sm outline-none focus:rounded-sm focus:bg-accent" />
                          </TableCell>
                          <TableCell className="py-1">
                            <input value={r.ISIN} onChange={(e) => edit(i, "ISIN", e.target.value)}
                                   aria-label={`ISIN, row ${i + 1}`}
                                   className="w-full bg-transparent px-1 py-0.5 font-mono text-xs outline-none focus:rounded-sm focus:bg-accent" />
                          </TableCell>
                          <TableCell className="py-1">
                            <input type="number" step="0.0001" value={r["Weight (%)"]}
                                   onChange={(e) => edit(i, "Weight (%)", e.target.value)}
                                   aria-label={`Weight, row ${i + 1}`}
                                   className="tabular w-full bg-transparent px-1 py-0.5 text-right font-mono text-sm outline-none focus:rounded-sm focus:bg-accent" />
                          </TableCell>
                          <TableCell className="py-1">
                            <Button variant="ghost" size="icon" aria-label={`Remove row ${i + 1}`}
                                    onClick={() => { setHoldings(holdings.filter((_, j) => j !== i)); setResult(null); }}>
                              <Trash2 className="text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" size="sm"
                        onClick={() => setHoldings([...holdings, { "Scheme Name": "", ISIN: "", "Weight (%)": 0 }])}>
                  <Plus /> Add fund
                </Button>
                <p className="text-xs text-muted-foreground">
                  {holdings.length} fund(s) · weights sum to{" "}
                  <span className={cn("tabular font-mono", Math.abs(weightSum - 100) > 0.0001 ? "text-loss" : "text-gain")}>
                    {weightSum.toFixed(4).replace(/\.?0+$/, "")}%
                  </span>
                  {Math.abs(weightSum - 100) > 0.0001 && " — normalised to 100% when tracked"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                <Button onClick={track} disabled={busy || !holdings.length}>
                  {busy ? <Loader2 className="animate-spin" /> : null}
                  {busy ? "Tracking…" : "Track Portfolio"}
                </Button>
                <Button variant="outline" onClick={track} disabled={busy}>
                  <RefreshCw /> Refresh
                </Button>
                {result && (
                  <Button variant="outline" onClick={download} disabled={downloading}>
                    {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                    Download Excel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {notice && <p className="text-sm text-gain">{notice}</p>}

          {busy && (
            <Card><CardContent className="px-5 py-5 text-sm text-muted-foreground">
              Fetching NAV history for every fund in the bucket and overlaying today&rsquo;s live NAV.
              The first run over a new date range is slow; after that it answers from cache.
            </CardContent></Card>
          )}

          {error && (
            <Card><CardContent className="px-5 py-5">
              <p className="text-sm font-medium text-loss">Could not do that</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </CardContent></Card>
          )}

          {result && !busy && (
            <div className="space-y-5">
              <StatCards stats={[
                { label: "Current value", value: money(m["Current Value"]),
                  hint: `NAV as on ${m["NAV Date"] ?? "—"}` },
                { label: "Total gain / loss", value: money(m["Total Gain/Loss"]),
                  tone: typeof m["Total Gain/Loss"] === "number" && (m["Total Gain/Loss"] as number) >= 0 ? "gain" : "loss",
                  hint: `from ${money(m["Initial Value"])}` },
                { label: "Total return", value: pct(m["Total Return (%)"]),
                  delta: typeof m["Total Return (%)"] === "number" ? (m["Total Return (%)"] as number) : null },
                { label: "Max drawdown", value: pct(m["Max Drawdown (%)"]),
                  tone: "loss", hint: "worst peak-to-trough fall" },
              ]} />
              <BucketChart rows={result.tracker} columns={result.tracker_columns} />
              <CategoryTable columns={result.composition_columns} rows={result.composition}
                             caption={`Holdings of “${active}” at today's NAV`} />
            </div>
          )}
        </div>
      </main>
    </>
  );
}
