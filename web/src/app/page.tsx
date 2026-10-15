"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Play } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { FundCombobox } from "@/components/fund-combobox";
import { StatCards, summarise } from "@/components/stat-cards";
import { NavFlowChart, Point } from "@/components/nav-flow-chart";
import { DailyTable } from "@/components/daily-table";
import { CategoryTable } from "@/components/category-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxField } from "@/components/ui/checkbox-field";
import { Input } from "@/components/ui/input";
import { SelectField } from "@/components/ui/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CATEGORIES, CATEGORY_IDS, COL, CategoryResult, Fund, MATURITY_TYPES, Performance, Subcategory,
  downloadCategoryExcel, downloadFundExcel,
  fetchByCategory, fetchPerformance, fetchSubcategories, num,
} from "@/lib/api";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const MODES = ["By category", "Specific fund"] as const;
type Mode = (typeof MODES)[number];

export default function FundPerformancePage() {
  const [mode, setMode] = useState<Mode>("By category");

  // Category selection, as the Streamlit page had it.
  const [maturity, setMaturity] = useState<string>("Open Ended");
  const [category, setCategory] = useState<string>("Equity");
  const [subcats, setSubcats] = useState<Subcategory[]>([]);
  const [subcatSource, setSubcatSource] = useState<string>("");
  const [subcatId, setSubcatId] = useState<string>("ALL");

  const [fund, setFund] = useState<Fund | null>(null);

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

  const [single, setSingle] = useState<Performance | null>(null);
  const [bulk, setBulk] = useState<CategoryResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const now = new Date();
    setStart(`${now.getFullYear()}-01-01`);
    setEnd(iso(now));
    setToday(iso(now));
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    setSubcats([]); setSubcatId("ALL");
    fetchSubcategories(CATEGORY_IDS[category], ctl.signal)
      .then((d) => { setSubcats(d.subcategories); setSubcatSource(d.source); })
      .catch(() => setSubcatSource("unavailable"));
    return () => ctl.abort();
  }, [category]);

  const clear = () => { setSingle(null); setBulk(null); setError(null); };

  const run = async () => {
    setBusy(true); clear();
    try {
      if (mode === "Specific fund") {
        if (!fund) return;
        setSingle(await fetchPerformance(fund.isin, start, end, liveAum));
      } else {
        setBulk(await fetchByCategory({
          maturity_type: maturity, category,
          subcategory_id: subcatId === "ALL" ? null : Number(subcatId),
          start, end,
          carry_forward: carryForward, skip_saturdays: skipSaturdays, skip_sundays: skipSundays,
          want_nav: wantNav, want_aum: wantAum, want_flows: wantFlows, fetch_live_aum: liveAum,
        }));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true); setError(null);
    try {
      if (mode === "Specific fund" && fund) {
        await downloadFundExcel(fund.isin, start, end, liveAum);
      } else {
        await downloadCategoryExcel({
          maturity_type: maturity, category,
          subcategory_id: subcatId === "ALL" ? null : Number(subcatId),
          start, end,
          carry_forward: carryForward, skip_saturdays: skipSaturdays, skip_sundays: skipSundays,
          want_nav: wantNav, want_aum: wantAum, want_flows: wantFlows, fetch_live_aum: liveAum,
        });
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const rows = single?.rows ?? [];
  const dates = rows.map((r) => String(r[COL.date] ?? ""));
  const navs = rows.map((r) => num(r[COL.nav]));
  const aums = rows.map((r) => num(r[COL.aum]));
  const flows = rows.map((r) => num(r[COL.flow]));
  const points: Point[] = rows.map((r, i) => ({ date: dates[i], nav: navs[i], flow: flows[i] }));

  const forced = wantFlows;   // Flows force NAV and AUM on in the Python
  const canRun = !busy && !!start && !!end && (mode === "By category" || !!fund);

  return (
    <>
      <SiteHeader breadcrumb={["Research", "Fund Performance"]} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl space-y-5 p-5">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Fund Performance</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              NAV, published AUM and net flows — across a whole category, or for one scheme.
            </p>
          </div>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Selection</CardTitle>
              <CardDescription>
                A category answers &ldquo;how did every large cap fund do&rdquo;. One fund is far
                quicker when you already know which scheme you want.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="flex flex-wrap gap-2">
                {MODES.map((m) => (
                  <Button key={m} size="sm" variant={mode === m ? "default" : "outline"}
                          onClick={() => { setMode(m); clear(); }}>
                    {m}
                  </Button>
                ))}
              </div>

              {mode === "By category" ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SelectField id="mt" label="Maturity Type" value={maturity} onChange={setMaturity}
                               options={MATURITY_TYPES.map((v) => ({ label: v, value: v }))} />
                  <SelectField id="cat" label="Category" value={category} onChange={setCategory}
                               options={CATEGORIES.map((v) => ({ label: v, value: v }))} />
                  <div>
                    <SelectField id="sub" label="Subcategory" value={subcatId} onChange={setSubcatId}
                                 options={[{ label: "ALL", value: "ALL" },
                                           ...subcats.map((s) => ({ label: s.name, value: String(s.id) }))]} />
                    {subcatSource && subcatSource !== "live" && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        AMFI&rsquo;s category list is unavailable; using the {subcatSource} list.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="mb-1.5 block text-xs text-muted-foreground">Fund</label>
                  <FundCombobox selected={fund} onSelect={(f) => { setFund(f); clear(); }} />
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label htmlFor="sd" className="mb-1.5 block text-xs text-muted-foreground">Start Date</label>
                  <Input id="sd" type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="ed" className="mb-1.5 block text-xs text-muted-foreground">End Date</label>
                  <Input id="ed" type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} />
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
                               checked={liveAum} onChange={setLiveAum}
                               className="sm:col-span-2 lg:col-span-3" />
              </div>

              <div className="border-t pt-4">
                <div className="flex flex-wrap gap-3">
                  <Button onClick={run} disabled={!canRun}>
                    {busy ? <Loader2 className="animate-spin" /> : <Play />}
                    {busy ? "Fetching…" : "Go"}
                  </Button>
                  {(single || bulk) && (
                    <Button variant="outline" onClick={exportExcel} disabled={exporting || busy}>
                      {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                      {exporting ? "Building…" : "Download Styled Excel"}
                    </Button>
                  )}
                </div>
                {mode === "By category" && subcatId === "ALL" && category === "Equity" && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Equity → ALL matches about 2,450 scheme rows. Narrowing the subcategory, or
                    switching to a specific fund, is much quicker.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {busy && (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[6.5rem]" />)}
              </div>
              <Card><CardContent className="px-5 py-5">
                <Skeleton className="h-56 w-full" />
                <p className="mt-4 text-sm text-muted-foreground">
                  Fetching from AMFI. Every extra scheme and every extra day adds to the wait;
                  published AUM adds a call per day on the first run, then answers from cache.
                </p>
              </CardContent></Card>
            </div>
          )}

          {error && (
            <Card><CardContent className="px-5 py-5">
              <p className="text-sm font-medium text-loss">Could not fetch that</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Try a shorter window or a narrower subcategory, or clear
                <em> Fetch actual daily AUM</em> for a NAV-only run.
              </p>
            </CardContent></Card>
          )}

          {single && !busy && (
            <div className="space-y-5">
              {fund && (
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h2 className="text-lg font-semibold tracking-tight">{fund.scheme_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {fund.amc} · <span className="font-mono text-xs">{fund.isin}</span>
                  </p>
                </div>
              )}
              <StatCards stats={summarise(navs, aums, flows, dates)} />
              <NavFlowChart data={points} />
              <DailyTable rows={rows} />
              {single.note && <p className="text-sm text-muted-foreground">Note: {single.note}</p>}
            </div>
          )}

          {bulk && !busy && (
            <div className="space-y-5">
              <StatCards stats={[
                { label: "Scheme rows matched", value: bulk.matched_scheme_rows.toLocaleString("en-IN") },
                { label: "Regular Growth funds", value: bulk.regular_growth_funds.toLocaleString("en-IN"),
                  hint: "Direct plans and IDCW/Bonus options excluded" },
                { label: "Direct plans excluded", value: bulk.excluded_direct.toLocaleString("en-IN") },
                { label: "Data rows", value: bulk.row_count.toLocaleString("en-IN") },
              ]} />
              <CategoryTable columns={bulk.columns} rows={bulk.rows}
                             caption={`${maturity} · ${category} · ${subcatId === "ALL" ? "ALL" : subcats.find((s) => String(s.id) === subcatId)?.name ?? subcatId}`} />
              {bulk.note && <p className="text-sm text-muted-foreground">Note: {bulk.note}</p>}
            </div>
          )}

          {!single && !bulk && !busy && !error && (
            <Card className="border-dashed">
              <CardContent className="px-5 py-14 text-center">
                <p className="font-medium">Choose a selection and press Go</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-muted-foreground">
                  Pick a category to see every fund in it, or switch to a specific fund when you
                  already know the scheme.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </>
  );
}
