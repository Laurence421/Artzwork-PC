"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { focusRingClasses } from "@/features/shared/ui/button-styles";

const DESKTOP = "(min-width: 1024px)";
const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

/**
 * The products filter: always open beside the list on desktop; on phones a "Filter & sort" button
 * so the products come first (open by itself when a filter is in use).
 */
export function FilterPanel({ filtered, children }: { filtered: boolean; children: React.ReactNode }) {
  // Open while rendering on the server, so it works before (and without) JavaScript.
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => true);
  const [open, setOpen] = useState(filtered);

  return (
    <details
      open={desktop || open}
      onToggle={(e) => !desktop && setOpen(e.currentTarget.open)}
      className="group h-fit rounded-2xl border border-border bg-surface lg:p-6"
    >
      <summary
        className={`flex h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 text-sm font-semibold lg:hidden [&::-webkit-details-marker]:hidden ${focusRingClasses}`}
      >
        <SlidersHorizontal aria-hidden className="size-4" />
        Filter &amp; sort
        <span className="ml-auto text-xs text-muted group-open:hidden">{filtered ? "On" : "Show"}</span>
        <span className="ml-auto hidden text-xs text-muted group-open:inline">Hide</span>
      </summary>
      <div className="px-4 pb-4 lg:p-0">{children}</div>
    </details>
  );
}
