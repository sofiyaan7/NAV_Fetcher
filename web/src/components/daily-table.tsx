import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { COL, PerformanceRow, fmtNum, num } from "@/lib/api";
import { cn } from "@/lib/utils";

export function DailyTable({ rows }: { rows: PerformanceRow[] }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center border-b">
        <div>
          <CardTitle>Daily detail</CardTitle>
          <CardDescription>NAV, published AUM, return and the flow left after the market move</CardDescription>
        </div>
        <CardAction className="text-xs text-muted-foreground">{rows.length} day(s)</CardAction>
      </CardHeader>
      <div className="max-h-[28rem] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">NAV</TableHead>
              <TableHead className="text-right">AUM (₹ cr)</TableHead>
              <TableHead className="text-right">Return</TableHead>
              <TableHead className="text-right">Net flow (₹ cr)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const ret = num(r[COL.ret]);
              const flow = num(r[COL.flow]);
              return (
                <TableRow key={i}>
                  <TableCell className="tabular font-mono text-xs text-muted-foreground">
                    {String(r[COL.date] ?? "—")}
                  </TableCell>
                  <TableCell className="tabular text-right font-mono">{fmtNum(num(r[COL.nav]), 4)}</TableCell>
                  <TableCell className="tabular text-right font-mono">{fmtNum(num(r[COL.aum]), 2)}</TableCell>
                  <TableCell className={cn("tabular text-right font-mono",
                      ret === null ? "text-muted-foreground" : ret >= 0 ? "text-gain" : "text-loss")}>
                    {ret === null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(3)}%`}
                  </TableCell>
                  <TableCell className={cn("tabular text-right font-mono",
                      flow === null ? "text-muted-foreground" : flow >= 0 ? "text-gain" : "text-loss")}>
                    {flow === null ? "—" : fmtNum(flow, 2)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
