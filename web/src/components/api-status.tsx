"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { API_BASE } from "@/lib/api";

/**
 * Says so when the data service cannot be reached.
 *
 * The page is static and deploys to Vercel; the Python runs elsewhere. If
 * NEXT_PUBLIC_API_URL was never set, the build falls back to localhost, which
 * resolves to the *viewer's* machine and fails. Without this the app simply
 * looks broken -- an empty search and no explanation.
 */
export function ApiStatus() {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    fetch(`${API_BASE}/health`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => setState(r.ok ? "ok" : "down"))
      .catch(() => setState("down"))
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); ctl.abort(); };
  }, []);

  if (state !== "down") return null;

  const isLocal = /localhost|127\.0\.0\.1/.test(API_BASE);

  return (
    <div className="border-b bg-muted/60 px-5 py-3">
      <div className="mx-auto flex max-w-7xl gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-loss" />
        <div className="text-sm">
          <p className="font-medium">The data service is not reachable.</p>
          <p className="mt-1 text-muted-foreground">
            {isLocal ? (
              <>
                This build points at <code className="font-mono text-xs">{API_BASE}</code>, which
                means the Python API. Start it with{" "}
                <code className="font-mono text-xs">uvicorn api.main:app --port 8077</code>, or set{" "}
                <code className="font-mono text-xs">NEXT_PUBLIC_API_URL</code> to a hosted one and
                redeploy.
              </>
            ) : (
              <>
                Tried <code className="font-mono text-xs">{API_BASE}</code>. The service may be
                asleep — a free host takes about 30 seconds to wake — or it may be down. Reload in
                a moment.
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
