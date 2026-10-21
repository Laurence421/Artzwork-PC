"use client";

import { useId } from "react";

type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id" | "type"> & {
  label: React.ReactNode;
  hint?: string;
  /** "switch" draws an on/off switch; the control is still a checkbox, so forms submit it the same way. */
  variant?: "checkbox" | "switch";
};

/** A labelled checkbox or on/off switch. */
export function Checkbox({ label, hint, variant = "checkbox", ...input }: CheckboxProps) {
  const id = useId();
  const noteId = `${id}-note`;

  const control =
    variant === "switch"
      ? "relative h-6 w-10 shrink-0 cursor-pointer appearance-none rounded-full bg-border transition-colors checked:bg-primary " +
        "before:absolute before:top-0.5 before:left-0.5 before:size-5 before:rounded-full before:bg-surface before:shadow before:transition-transform checked:before:translate-x-4"
      : "size-4 shrink-0 cursor-pointer accent-primary";

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        role={variant === "switch" ? "switch" : undefined}
        aria-describedby={hint ? noteId : undefined}
        className={`mt-0.5 ${control} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
        {...input}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </label>
        {hint && (
          <p id={noteId} className="text-sm text-muted">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
