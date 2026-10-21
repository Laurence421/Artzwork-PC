"use client";

import { useEffect, useRef, useState } from "react";
import { FormAlert } from "@/features/shared/ui/form-alert";

/**
 * "Your order was updated: Shipped" when the status changes while the page is open (the page
 * refreshes itself), so the customer notices without reading the steps again.
 */
export function OrderUpdatedNote({ status, label }: { status: string; label: string }) {
  const first = useRef(status);
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (status === first.current) return;
    first.current = status;
    const show = window.setTimeout(() => setShown(label), 0);
    const hide = window.setTimeout(() => setShown(null), 15000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [status, label]);

  // A live region, so screen readers hear the update too.
  return (
    <div aria-live="polite" className="empty:hidden">
      {shown && <FormAlert tone="success">Your order was updated: {shown}</FormAlert>}
    </div>
  );
}
