"use client";

import { useId } from "react";

type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  hint?: string;
  error?: string;
  /** Fixed text shown before the input, e.g. "₱". */
  prefix?: string;
};

/** Label, input, and a hint that an error replaces. */
export function TextField({ label, hint, error, prefix, className, ...input }: TextFieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className={`flex h-10 items-center rounded-lg border bg-surface focus-within:outline-2 focus-within:outline-primary ${error ? "border-danger" : "border-border"}`}>
        {prefix && <span className="pl-3 text-base text-muted">{prefix}</span>}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          className={`h-full min-w-0 flex-1 rounded-lg bg-transparent text-base outline-none ${prefix ? "pr-3" : "px-3"} ${className ?? ""}`}
          {...input}
        />
      </div>
      {note && (
        <p id={noteId} className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}
