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
  const [state, setState] = useState<"checking" | "waking" | "ok" | "down">("checking");

  useEffect(() => {
    // A free host sleeps when idle and takes 30-60s to wake, so a single short
    // probe reports "down" for a service that is merely starting. Keep probing
    // for up to 90s and say it is waking in the meantime.
    const deadline = Date.now() + 90_000;
    let ctl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const probe = () => {
      ctl = new AbortController();
      const abort = setTimeout(() => ctl.abort(), 15_000);
      fetch(`${API_BASE}/health`, { signal: ctl.signal, cache: "no-store" })
        .then((r) => { if (!r.ok) throw new Error(String(r.status)); if (!cancelled) setState("ok"); })
        .catch(() => {
          if (cancelled) return;
          if (Date.now() < deadline) {
            setState("waking");
            timer = setTimeout(probe, 3_000);
          } else {
            setState("down");
          }
        })
        .finally(() => clearTimeout(abort));
    };
    probe();
    return () => { cancelled = true; clearTimeout(timer); ctl.abort(); };
  }, []);

  if (state === "waking") {
    return (
      <div className="border-b bg-muted/60 px-5 py-3">
        <div className="mx-auto max-w-7xl text-sm text-muted-foreground">
          Waking the data service — the free host sleeps when idle and takes up to a minute to start.
        </div>
      </div>
    );
  }

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
