import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp } from "lucide-react";
import { fmtCr, fmtNum, fmtPct } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Stat = {
  label: string;
  value: string;
  delta?: number | null;   // shown as a percentage badge
  tone?: "gain" | "loss"; // colours the figure itself, for money rather than a rate
  hint?: string;
};

export function StatCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label}>
          <CardContent className="px-5 pt-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              {s.delta !== undefined && s.delta !== null && (
                <Badge variant={s.delta >= 0 ? "gain" : "loss"}>
                  {s.delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                  {fmtPct(s.delta)}
                </Badge>
              )}
            </div>
            <p className={cn("tabular mt-2 font-mono text-2xl font-semibold tracking-tight",
                             s.tone === "gain" && "text-gain", s.tone === "loss" && "text-loss")}>
              {s.value}
            </p>
            {s.hint && <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** The four headline figures, derived from the rows the API returned. */
export function summarise(
  navs: (number | null)[], aums: (number | null)[],
  flows: (number | null)[], dates: string[],
): Stat[] {
  const firstNav = navs.find((n) => n !== null) ?? null;
  const lastNav = [...navs].reverse().find((n) => n !== null) ?? null;
  const lastAum = [...aums].reverse().find((n) => n !== null) ?? null;
  const periodReturn =
    firstNav !== null && lastNav !== null && firstNav !== 0 ? (lastNav / firstNav - 1) * 100 : null;
  const booked = flows.filter((f): f is number => f !== null);
  const netFlow = booked.length ? booked.reduce((a, b) => a + b, 0) : null;

  return [
    { label: "Latest NAV", value: fmtNum(lastNav, 4),
      hint: dates.length ? `as on ${dates[dates.length - 1]}` : undefined },
    { label: "Period return", value: fmtPct(periodReturn), delta: periodReturn,
      hint: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : undefined },
    { label: "Latest AUM", value: fmtCr(lastAum), hint: "published by AMFI" },
    { label: "Net flow, period", value: fmtCr(netFlow),
      tone: netFlow === null ? undefined : netFlow >= 0 ? "gain" : "loss",
      hint: `${booked.length} day(s) measured` },
  ];
}
