"use client";

import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SERIES = [
  { key: "Total Portfolio Value (₹)", label: "Portfolio", colour: "var(--chart-3)" },
  { key: "Nifty 50 Valuation (₹)", label: "Nifty 50", colour: "var(--chart-1)" },
  { key: "Nifty 500 Valuation (₹)", label: "Nifty 500", colour: "var(--chart-2)" },
];

/** The bucket against the two index valuations the tracker computes alongside it. */
export function BucketChart({
  rows, columns,
}: {
  rows: Record<string, string | number | null>[];
  columns: string[];
}) {
  const present = SERIES.filter((s) => columns.includes(s.key));
  const data = rows.map((r) => {
    const point: Record<string, string | number | null> = { Date: String(r.Date ?? "") };
    for (const s of present) point[s.label] = typeof r[s.key] === "number" ? (r[s.key] as number) : null;
    return point;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio value over time</CardTitle>
        <CardDescription>
          The bucket against the same money in Nifty 50 and Nifty 500, in ₹.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="Date" tickLine={false} axisLine={{ stroke: "var(--border)" }}
                     tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} minTickGap={40} />
              <YAxis tickLine={false} axisLine={false} width={78}
                     tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                     domain={["auto", "auto"]}
                     tickFormatter={(v: number) => v.toLocaleString("en-IN", { notation: "compact" })} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)", fontSize: 12,
                }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
                formatter={(value, name) => {
                  const n = typeof value === "number" ? value : Number(value);
                  return [Number.isNaN(n) ? "—" : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`,
                          String(name)];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              {present.map((s) => (
                <Line key={s.label} type="monotone" dataKey={s.label} name={s.label}
                      stroke={s.colour} strokeWidth={2} dot={false} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
