"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Holding } from "@/lib/api";
import { cn } from "@/lib/utils";

const BLANK: Holding = { "Scheme Name": "", ISIN: "", "Allocation (%)": 0, Benchmark: "" };

/** The st.data_editor equivalent: add, edit and remove rows in place. */
export function PortfolioEditor({
  rows, onChange, readOnly = false,
}: {
  rows: Holding[];
  onChange?: (rows: Holding[]) => void;
  readOnly?: boolean;
}) {
  const total = rows.reduce((a, r) => a + (Number(r["Allocation (%)"]) || 0), 0);

  const edit = (i: number, key: keyof Holding, value: string) => {
    if (!onChange) return;
    const next = rows.map((r, j) =>
      j === i
        ? { ...r, [key]: key === "Allocation (%)" ? Number(value) || 0 : value }
        : r,
    );
    onChange(next);
  };

  const cellCls =
    "w-full bg-transparent px-1 py-0.5 text-sm outline-none focus:rounded-sm focus:bg-accent";

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-md border">
        <div className="max-h-[22rem] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted">
              <TableRow>
                <TableHead className="w-[32%]">Scheme Name</TableHead>
                <TableHead className="w-[18%]">ISIN</TableHead>
                <TableHead className="w-[12%] text-right">Allocation (%)</TableHead>
                <TableHead>Benchmark</TableHead>
                {!readOnly && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="py-1">
                    <input readOnly={readOnly} value={r["Scheme Name"]}
                           onChange={(e) => edit(i, "Scheme Name", e.target.value)}
                           className={cellCls} aria-label={`Scheme name, row ${i + 1}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <input readOnly={readOnly} value={r.ISIN}
                           onChange={(e) => edit(i, "ISIN", e.target.value)}
                           className={cn(cellCls, "font-mono text-xs")} aria-label={`ISIN, row ${i + 1}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <input readOnly={readOnly} type="number" step="0.01" value={r["Allocation (%)"]}
                           onChange={(e) => edit(i, "Allocation (%)", e.target.value)}
                           className={cn(cellCls, "tabular text-right font-mono")}
                           aria-label={`Allocation, row ${i + 1}`} />
                  </TableCell>
                  <TableCell className="py-1">
                    <input readOnly={readOnly} value={r.Benchmark}
                           onChange={(e) => edit(i, "Benchmark", e.target.value)}
                           className={cellCls} aria-label={`Benchmark, row ${i + 1}`} />
                  </TableCell>
                  {!readOnly && (
                    <TableCell className="py-1">
                      <Button variant="ghost" size="icon" aria-label={`Remove row ${i + 1}`}
                              onClick={() => onChange?.(rows.filter((_, j) => j !== i))}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && (
          <Button variant="outline" size="sm" onClick={() => onChange?.([...rows, { ...BLANK }])}>
            <Plus /> Add row
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {rows.length} scheme{rows.length === 1 ? "" : "s"} · total allocation{" "}
          <span className={cn("tabular font-mono",
                              Math.abs(total - 100) > 0.01 ? "text-loss" : "text-gain")}>
            {total.toFixed(2)}%
          </span>
          {Math.abs(total - 100) > 0.01 && " — allocations are normalised to 100% when the report is built"}
        </p>
      </div>
    </div>
  );
}
