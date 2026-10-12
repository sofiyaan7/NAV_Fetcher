"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Fund, searchFunds } from "@/lib/api";

/**
 * Typeahead over the AMFI scheme index.
 *
 * The old page had no way to name a fund: you chose a category and it pulled
 * every scheme in it. Searching the index first is what turns a 2,452-scheme
 * fetch into a one-scheme fetch.
 */
export default function FundSearch({
  onSelect,
  selected,
}: {
  onSelect: (f: Fund) => void;
  selected: Fund | null;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Fund[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // Debounced so a fast typist makes one request, not one per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setBusy(true);
      setError(null);
      try {
        const found = await searchFunds(q, ctl.signal);
        setResults(found);
        setActive(0);
        setOpen(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setError(
            "Could not reach the data service. Is the API running?",
          );
        }
      } finally {
        setBusy(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const choose = (f: Fund) => {
    onSelect(f);
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={boxRef} className="relative w-full">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search for a fund by name
      </label>
      <div className="relative">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40"
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
        <input
          id={`${listId}-input`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={query}
          placeholder={selected ? selected.scheme_name : "Search any fund — try “HDFC Flexi Cap”"}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-xl border border-white/15 bg-white/10 py-4 pl-12 pr-28
                     text-base text-white placeholder:text-white/40
                     focus:border-white/35 focus:bg-white/15 focus:outline-none"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/35">
          {busy ? "searching…" : selected ? "change fund" : "14,371 schemes"}
        </span>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-300">{error}</p>
      )}

      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 max-h-96 w-full overflow-auto rounded-xl border
                     border-rule bg-surface py-1 shadow-xl shadow-black/20"
        >
          {results.map((f, i) => (
            <li key={f.isin} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(f)}
                className={`flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left
                            ${i === active ? "bg-accent-soft" : "bg-transparent"}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {f.scheme_name}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    {f.amc} · {f.isin}
                  </span>
                </span>
                {f.latest_nav !== null && (
                  <span className="figure shrink-0 text-sm text-ink-muted">
                    {f.latest_nav.toFixed(2)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !busy && query.trim().length >= 2 && results.length === 0 && !error && (
        <div className="absolute z-30 mt-2 w-full rounded-xl border border-rule bg-surface px-4 py-3
                        text-sm text-ink-muted shadow-xl shadow-black/20">
          No fund matches “{query.trim()}”. Regular Growth plans only.
        </div>
      )}
    </div>
  );
}
