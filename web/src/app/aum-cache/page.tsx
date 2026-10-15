"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/site-header";
import { StatCards } from "@/components/stat-cards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AumCacheStats, downloadAumCacheExcel, fetchAumCacheStats } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export default function AumCachePage() {
  const [stats, setStats] = useState<AumCacheStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    fetchAumCacheStats(ctl.signal)
      .then(setStats)
      .catch((e) => { if ((e as Error).name !== "AbortError") setError((e as Error).message); });
    return () => ctl.abort();
  }, []);

  return (
    <>
      <SiteHeader breadcrumb={["System", "AUM Cache"]} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl space-y-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
            <h1 className="text-xl font-semibold tracking-tight">AUM Cache</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              AMFI rate-limits by IP and answers 403 once it decides a caller is being greedy, so
              published AUM is collected slowly and kept on disk. Past-date AUM never changes, so
              the cache is write-once.
            </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => downloadAumCacheExcel().catch((e) => setError((e as Error).message))}>
              <Download /> Export to Excel
            </Button>
          </div>

          {error && (
            <Card><CardContent className="px-5 py-5">
              <p className="text-sm font-medium text-loss">Could not read the cache</p>
              <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            </CardContent></Card>
          )}

          {!stats && !error && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[6.5rem]" />)}
            </div>
          )}

          {stats && (
            <>
              <StatCards stats={[
                { label: "Cached queries", value: stats.files.toLocaleString("en-IN") },
                { label: "Dates covered", value: stats.dates.toLocaleString("en-IN") },
                { label: "Size on disk", value: `${stats.mb} MB` },
                { label: "Coverage",
                  value: stats.earliest && stats.latest ? `${stats.earliest} → ${stats.latest}` : "—",
                  hint: "oldest to newest day held" },
              ]} />

              <Card>
                <CardHeader>
                  <CardTitle>Hugging Face sync</CardTitle>
                  <CardDescription>
                    A hosted deployment wipes its disk on restart, so the cache is pushed to a
                    dataset and pulled back on boot.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm">
                    Status:{" "}
                    <span className={stats.sync_available ? "text-gain" : "text-loss"}>
                      {stats.sync_available ? "available" : "unavailable"}
                    </span>
                  </p>
                  {!stats.sync_available && (
                    <p className="text-sm text-muted-foreground">{stats.sync_detail}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Dataset: <span className="font-mono text-xs">{stats.repo}</span>
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </>
  );
}
