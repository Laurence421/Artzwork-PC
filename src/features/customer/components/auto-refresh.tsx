"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Keeps an open page up to date without a manual refresh, cheaply: every `every` ms it asks
 * `check()` for a small version value (one tiny database lookup) and re-renders the page from
 * the server only when that value changed. Checks run only while the tab is visible, right away
 * when the customer comes back to it, and slow down (to `idle` ms) after 10 quiet minutes.
 */
export function LiveUpdates({
  version,
  check,
  every = 20_000,
  idle = 60_000,
}: {
  version: string | null;
  check: () => Promise<string | null>;
  every?: number;
  idle?: number;
}) {
  const router = useRouter();
  const known = useRef(version);
  const lastChange = useRef(0);

  // A server re-render brings the new version in; remember it.
  useEffect(() => {
    known.current = version;
  }, [version]);

  useEffect(() => {
    let timer = 0;
    let stopped = false;
    lastChange.current = Date.now();

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const now = await check();
          if (now && now !== known.current) {
            known.current = now;
            lastChange.current = Date.now();
            router.refresh();
          }
        } catch {
          // offline for a moment: try again next time
        }
      }
      const quiet = Date.now() - lastChange.current > 10 * 60_000;
      timer = window.setTimeout(tick, quiet ? idle : every);
    };
    timer = window.setTimeout(tick, every);

    const onBack = () => {
      if (document.visibilityState !== "visible") return;
      lastChange.current = Date.now(); // the customer is back: check at the normal pace again
      window.clearTimeout(timer);
      void tick();
    };
    document.addEventListener("visibilitychange", onBack);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [check, every, idle, router]);

  return null;
}
