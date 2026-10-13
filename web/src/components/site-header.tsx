"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function SiteHeader({ breadcrumb }: { breadcrumb: string[] }) {
  const [dark, setDark] = useState(false);

  // Read after mount: the prerendered HTML cannot know the viewer's preference.
  useEffect(() => {
    const prefers = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const saved = localStorage.getItem("theme");
    const on = saved ? saved === "dark" : prefers;
    setDark(on);
    document.documentElement.classList.toggle("dark", on);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* private window: the choice simply will not persist */
    }
  };

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-5">
      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex items-center gap-1.5 text-sm">
          {breadcrumb.map((crumb, i) => (
            <li key={crumb} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground">/</span>}
              <span className={i === breadcrumb.length - 1 ? "font-medium" : "text-muted-foreground"}>
                {crumb}
              </span>
            </li>
          ))}
        </ol>
      </nav>
      <Button
        variant="ghost" size="icon" onClick={toggle} className="ml-auto"
        aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      >
        {dark ? <Sun /> : <Moon />}
      </Button>
    </header>
  );
}
