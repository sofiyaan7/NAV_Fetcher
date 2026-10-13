import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PerformanceRow } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Whatever columns the export produced, shown as they come. */
export function CategoryTable({
  columns, rows, caption,
}: {
  columns: string[];
  rows: PerformanceRow[];
  caption: string;
}) {
  const show = rows.slice(0, 500);
  const numeric = (v: unknown) => typeof v === "number";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center border-b">
        <div>
          <CardTitle>Results</CardTitle>
          <CardDescription>{caption}</CardDescription>
        </div>
        <CardAction className="text-xs text-muted-foreground">
          {rows.length.toLocaleString("en-IN")} row(s)
          {rows.length > show.length && ` · showing first ${show.length}`}
        </CardAction>
      </CardHeader>
      <div className="max-h-[32rem] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-muted">
            <TableRow>
              {columns.map((c) => <TableHead key={c} className="whitespace-nowrap">{c}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {show.map((r, i) => (
              <TableRow key={i}>
                {columns.map((c) => (
                  <TableCell key={c}
                    className={cn("whitespace-nowrap",
                                  numeric(r[c]) && "tabular text-right font-mono")}>
                    {r[c] === null || r[c] === undefined || r[c] === ""
                      ? "—"
                      : typeof r[c] === "number"
                        ? (r[c] as number).toLocaleString("en-IN", { maximumFractionDigits: 4 })
                        : String(r[c])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
