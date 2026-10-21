"use client";

import { focusRingClasses } from "@/features/shared/ui/button-styles";
import { FormAlert } from "@/features/shared/ui/form-alert";

/** Text button inside a FormAlert (underlined, with the shared focus ring). */
export function AlertAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`cursor-pointer font-medium underline ${focusRingClasses}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** Shown on the cart and checkout when the cart's product details couldn't be loaded. */
export function CartLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <FormAlert>
      We couldn&apos;t load your cart. <AlertAction onClick={onRetry}>Try again</AlertAction>
    </FormAlert>
  );
}
