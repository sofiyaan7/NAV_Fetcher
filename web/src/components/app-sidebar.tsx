"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Database, FileSpreadsheet, LineChart, PieChart, Sigma,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** The Streamlit app's modes, as navigation. */
const NAV = [
  {
    label: "Research",
    items: [
      { href: "/", title: "Fund Performance", icon: LineChart, ready: true },
      { href: "/historical-export", title: "Historical Export", icon: FileSpreadsheet, ready: false },
    ],
  },
  {
    label: "Portfolio",
    items: [
      { href: "/mis", title: "MIS Generator", icon: Sigma, ready: false },
      { href: "/buckets", title: "Bucket Tracker", icon: PieChart, ready: false },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/aum-cache", title: "AUM Cache", icon: Database, ready: false },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <Activity className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">NAV Terminal</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">AMFI India</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((group) => (
          <div key={group.label} className="mb-4">
            <p className="px-2 pb-1 text-[11px] font-medium text-muted-foreground">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span className="truncate">{item.title}</span>
                      {!item.ready && (
                        <span className="ml-auto rounded border px-1 text-[10px] text-muted-foreground">
                          soon
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t px-4 py-3">
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          NAV from AMFI&rsquo;s daily file. AUM from the fund-performance disclosure,
          about two days in arrears.
        </p>
      </div>
    </aside>
  );
}
