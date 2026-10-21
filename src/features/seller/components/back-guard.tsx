"use client";

import { useEffect } from "react";

const BASE = "artzworkSellerBase";

/**
 * Signed in, the browser's Back button must not leave the seller app by accident.
 * When the app opens, the current history entry is marked as the base and a copy is
 * pushed on top. Back between seller pages works as usual; Back that reaches the base
 * moves forward again, so the seller stays put. Logging out leaves the app normally.
 */
export function BackGuard() {
  useEffect(() => {
    if (!window.history.state?.[BASE]) {
      window.history.replaceState({ ...window.history.state, [BASE]: true }, "", window.location.href);
      window.history.pushState({ ...window.history.state, [BASE]: false }, "", window.location.href);
    }
    const onPop = (e: PopStateEvent) => {
      if (e.state?.[BASE]) window.history.go(1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return null;
}
