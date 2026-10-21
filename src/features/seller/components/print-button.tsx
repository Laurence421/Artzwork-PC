"use client";

import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";

/** Opens the browser's print dialog; the seller frame hides itself when printing. */
export function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button type="button" className={`${secondaryButtonClasses("sm")} print:hidden`} onClick={() => window.print()}>
      {label}
    </button>
  );
}
