"use client";

import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

export type Point = {
  date: string;
  nav: number | null;
  flow: number | null;
};

/**
 * NAV as a line against net flows as bars, on one time axis.
 *
 * Two scales on purpose: a NAV in rupees and a flow in crore share no units,
 * and forcing them onto one axis would flatten whichever is smaller into the
 * baseline. Flow bars take the gain/loss colours; the NAV line takes the
 * accent, so price movement is never mistaken for money moving.
 */
export default function PerformanceChart({ data }: { data: Point[] }) {
  const hasFlows = data.some((d) => d.flow !== null && d.flow !== 0);

  return (
    <div className="rounded-xl border border-rule bg-surface p-5">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold text-ink">NAV and net flows</h2>
        <p className="text-xs text-ink-faint">
          NAV in ₹ (left) · net flow in ₹ crore (right)
        </p>
      </div>
      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis
              dataKey="date" tickLine={false} axisLine={{ stroke: "var(--rule)" }}
              tick={{ fill: "var(--ink-faint)", fontSize: 11 }} minTickGap={28}
            />
            <YAxis
              yAxisId="nav" tickLine={false} axisLine={false} width={64}
              tick={{ fill: "var(--ink-faint)", fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <YAxis
              yAxisId="flow" orientation="right" tickLine={false} axisLine={false} width={64}
              tick={{ fill: "var(--ink-faint)", fontSize: 11 }} hide={!hasFlows}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)", border: "1px solid var(--rule)",
                borderRadius: 8, fontSize: 12,
              }}
              labelStyle={{ color: "var(--ink)", fontWeight: 600 }}
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value);
                if (Number.isNaN(n)) return ["—", String(name)];
                return [
                  name === "Net flow"
                    ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} cr`
                    : n.toLocaleString("en-IN", { maximumFractionDigits: 4 }),
                  String(name),
                ];
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink-muted)" }} />
            {hasFlows && (
              <Bar yAxisId="flow" dataKey="flow" name="Net flow" radius={[2, 2, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={(d.flow ?? 0) >= 0 ? "var(--gain)" : "var(--loss)"} />
                ))}
              </Bar>
            )}
            <Line
              yAxisId="nav" type="monotone" dataKey="nav" name="NAV"
              stroke="var(--accent)" strokeWidth={2} dot={false} connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
