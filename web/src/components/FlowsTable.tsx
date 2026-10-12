import { COL, PerformanceRow, fmtNum, num } from "@/lib/api";

export default function FlowsTable({ rows }: { rows: PerformanceRow[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-surface">
      <div className="flex items-baseline justify-between gap-4 border-b border-rule px-5 py-4">
        <h2 className="text-sm font-semibold text-ink">Daily detail</h2>
        <p className="text-xs text-ink-faint">{rows.length} day(s)</p>
      </div>
      <div className="max-h-[32rem] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-surface-sunk">
            <tr className="text-left text-xs text-ink-muted">
              <th scope="col" className="px-5 py-2.5 font-medium">Date</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">NAV</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">AUM (₹ cr)</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Return</th>
              <th scope="col" className="px-5 py-2.5 text-right font-medium">Net flow (₹ cr)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ret = num(r[COL.ret]);
              const flow = num(r[COL.flow]);
              return (
                <tr key={i} className="border-t border-rule">
                  <td className="figure px-5 py-2.5 text-ink-muted">{String(r[COL.date] ?? "—")}</td>
                  <td className="figure px-5 py-2.5 text-right">{fmtNum(num(r[COL.nav]), 4)}</td>
                  <td className="figure px-5 py-2.5 text-right">{fmtNum(num(r[COL.aum]), 2)}</td>
                  <td className={`figure px-5 py-2.5 text-right ${
                      ret === null ? "text-ink-faint" : ret >= 0 ? "text-gain" : "text-loss"}`}>
                    {ret === null ? "—" : `${ret >= 0 ? "+" : ""}${ret.toFixed(3)}%`}
                  </td>
                  <td className={`figure px-5 py-2.5 text-right ${
                      flow === null ? "text-ink-faint" : flow >= 0 ? "text-gain" : "text-loss"}`}>
                    {flow === null ? "—" : fmtNum(flow, 2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
