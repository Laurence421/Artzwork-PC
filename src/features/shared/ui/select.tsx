"use client";

import { useId } from "react";

type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  options: { value: string; label: string }[];
};

/** Dropdown with the same label / hint / error layout as TextField. */
export function Select({ label, hint, error, options, ...select }: SelectProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={`h-10 rounded-lg border bg-surface px-3 text-base focus-visible:outline-2 focus-visible:outline-primary ${error ? "border-danger" : "border-border"}`}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {note && (
        <p id={noteId} className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}
