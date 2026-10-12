import { fmtCr, fmtNum, fmtPct } from "@/lib/api";

type Stat = {
  label: string;
  value: string;
  tone?: "gain" | "loss" | "plain";
  hint?: string;
};

export function Metrics({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-rule bg-rule md:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className="bg-surface px-5 py-4">
          <p className="text-xs text-ink-faint">{s.label}</p>
          <p
            className={`figure mt-1.5 text-2xl font-medium tracking-tight ${
              s.tone === "gain" ? "text-gain" : s.tone === "loss" ? "text-loss" : "text-ink"
            }`}
          >
            {s.value}
          </p>
          {s.hint && <p className="mt-1 text-xs text-ink-faint">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

/** Builds the four headline figures from the rows the API returned. */
export function summarise(
  navs: (number | null)[],
  aums: (number | null)[],
  flows: (number | null)[],
  dates: string[],
): Stat[] {
  const firstNav = navs.find((n) => n !== null) ?? null;
  const lastNav = [...navs].reverse().find((n) => n !== null) ?? null;
  const lastAum = [...aums].reverse().find((n) => n !== null) ?? null;

  const periodReturn =
    firstNav !== null && lastNav !== null && firstNav !== 0
      ? (lastNav / firstNav - 1) * 100
      : null;

  const booked = flows.filter((f): f is number => f !== null);
  const netFlow = booked.length ? booked.reduce((a, b) => a + b, 0) : null;

  return [
    {
      label: "Latest NAV",
      value: fmtNum(lastNav, 4),
      hint: dates.length ? `as on ${dates[dates.length - 1]}` : undefined,
    },
    {
      label: "Period return",
      value: fmtPct(periodReturn),
      tone: periodReturn === null ? "plain" : periodReturn >= 0 ? "gain" : "loss",
      hint: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : undefined,
    },
    { label: "Latest AUM", value: fmtCr(lastAum) },
    {
      label: "Net flow, period",
      value: fmtCr(netFlow),
      tone: netFlow === null ? "plain" : netFlow >= 0 ? "gain" : "loss",
      hint: `${booked.length} day(s) measured`,
    },
  ];
}
