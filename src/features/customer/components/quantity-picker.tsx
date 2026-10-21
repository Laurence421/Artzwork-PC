"use client";

import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";

/** − [n] + with a typed value kept between 1 and max. */
export function QuantityPicker({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (qty: number) => void;
  /** Names the field for screen readers, e.g. "Quantity of Mouse". */
  label: string;
}) {
  const clamp = (n: number) => Math.max(1, Math.min(max, Number.isFinite(n) ? Math.floor(n) : 1));

  return (
    <div role="group" aria-label={label} className="flex items-center gap-1">
      <button
        type="button"
        className={`${secondaryButtonClasses("sm")} w-9 px-0`}
        aria-label="Decrease quantity"
        disabled={value <= 1}
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={max}
        value={value}
        aria-label="Quantity"
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="h-9 w-14 rounded-lg border border-border bg-surface text-center text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-primary"
      />
      <button
        type="button"
        className={`${secondaryButtonClasses("sm")} w-9 px-0`}
        aria-label="Increase quantity"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  );
}
