"use client";

import { useId } from "react";

type TextAreaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  hint?: string;
  error?: string;
};

/** Multi-line TextField: label, textarea, and a hint that an error replaces. */
export function TextArea({ label, hint, error, rows = 5, ...textarea }: TextAreaProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={`rounded-lg border bg-surface px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-primary ${error ? "border-danger" : "border-border"}`}
        {...textarea}
      />
      {note && (
        <p id={noteId} className={`text-sm ${error ? "text-danger" : "text-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}
