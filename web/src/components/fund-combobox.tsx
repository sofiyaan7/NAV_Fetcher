"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Fund, searchFunds } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Typeahead over the AMFI scheme index.
 *
 * The Streamlit page had no way to name a fund: you chose a category and it
 * pulled every scheme in it, which is why Equity -> ALL fetched 2,452 schemes.
 * Naming one fund is what turns that into a single-scheme request.
 */
export function FundCombobox({
  selected, onSelect,
}: {
  selected: Fund | null;
  onSelect: (f: Fund) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Fund[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced, so a fast typist makes one request rather than one per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setError(null); return; }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setBusy(true); setError(null);
      try {
        const found = await searchFunds(q, ctl.signal);
        setResults(found); setActive(0); setOpen(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Could not reach the data service.");
      } finally { setBusy(false); }
    }, 220);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [query]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const choose = (f: Fund) => { onSelect(f); setQuery(""); setResults([]); setOpen(false); };

  return (
    <div ref={boxRef} className="relative">
      <label htmlFor={`${listId}-i`} className="sr-only">Search for a fund</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={`${listId}-i`} type="text" role="combobox" autoComplete="off"
          aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          value={query}
          placeholder={selected ? selected.scheme_name : "Search any fund — try “HDFC Flexi Cap”"}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
            else if (e.key === "Enter") { e.preventDefault(); choose(results[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-24 text-sm
                     placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {busy ? "searching…" : selected ? "change" : "14,371 schemes"}
        </span>
      </div>

      {error && <p className="mt-1.5 text-xs text-loss">{error}</p>}

      {open && results.length > 0 && (
        <ul id={listId} role="listbox"
            className="absolute z-50 mt-1.5 max-h-80 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {results.map((f, i) => (
            // The row itself is the option. It used to wrap a <button> that
            // carried the click, but the row is what sits under the pointer, so
            // a real mouse click landed on the <li> and nothing happened --
            // selecting a fund was impossible with a mouse. onMouseDown is
            // prevented so focus stays in the input, as a combobox should.
            <li
              key={f.isin}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(f)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5",
                i === active && "bg-accent",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm">{f.scheme_name}</span>
                <span className="block truncate text-xs text-muted-foreground">{f.amc} · {f.isin}</span>
              </span>
              {f.latest_nav !== null && (
                <span className="tabular shrink-0 font-mono text-xs text-muted-foreground">
                  {f.latest_nav.toFixed(2)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {open && !busy && query.trim().length >= 2 && !results.length && !error && (
        <div className="absolute z-50 mt-1.5 w-full rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          No fund matches “{query.trim()}”. Regular Growth plans only.
        </div>
      )}
    </div>
  );
}
