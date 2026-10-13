"use client";

import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type Point = { date: string; nav: number | null; flow: number | null };

/**
 * NAV as a line against net flows as bars.
 *
 * Two axes on purpose: a NAV in rupees and a flow in crore share no units, and
 * one axis would flatten whichever series is smaller into the baseline. Bars
 * take the gain/loss pair, the line takes a neutral chart colour, so a price
 * move is never read as money moving.
 */
export function NavFlowChart({ data }: { data: Point[] }) {
  const hasFlows = data.some((d) => d.flow !== null && d.flow !== 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>NAV and net flows</CardTitle>
          <CardDescription>NAV in ₹ (left) · net flow in ₹ crore (right)</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "var(--border)" }}
                     tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} minTickGap={30} />
              <YAxis yAxisId="nav" tickLine={false} axisLine={false} width={60}
                     tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} domain={["auto", "auto"]} />
              <YAxis yAxisId="flow" orientation="right" tickLine={false} axisLine={false} width={56}
                     tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} hide={!hasFlows} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)", fontSize: 12,
                }}
                labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
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
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              {hasFlows && (
                <Bar yAxisId="flow" dataKey="flow" name="Net flow" radius={[2, 2, 0, 0]}>
                  {data.map((d, i) => (
                    <Cell key={i} fill={(d.flow ?? 0) >= 0 ? "var(--gain)" : "var(--loss)"} />
                  ))}
                </Bar>
              )}
              <Line yAxisId="nav" type="monotone" dataKey="nav" name="NAV"
                    stroke="var(--chart-3)" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
