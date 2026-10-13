import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MisTable as MisTableData } from "@/lib/api";
import { cn } from "@/lib/utils";

const fmt = (v: unknown, pct: boolean) => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return pct ? `${v.toFixed(2)}%` : v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return String(v);
};

export function MisTable({ table }: { table: MisTableData }) {
  const colour = new Set(table.colour_cols);
  const pct = new Set(table.pct_cols);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b">
        <CardTitle>{table.title}</CardTitle>
        <CardDescription>{table.rows.length} scheme(s)</CardDescription>
      </CardHeader>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow>
              {table.headers.map((h, i) => (
                <TableHead key={i} className={cn(i > 2 && "text-right")}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {table.rows.map((row, ri) => (
              <TableRow key={ri}>
                {table.columns.map((c, ci) => {
                  const v = row[c];
                  const tint = colour.has(c) && typeof v === "number"
                    ? v >= 0 ? "text-gain" : "text-loss"
                    : "";
                  return (
                    <TableCell key={ci}
                      className={cn(ci > 2 && "tabular text-right font-mono", tint,
                                    ci === 1 && "min-w-[14rem]")}>
                      {fmt(v, pct.has(c))}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
