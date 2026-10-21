"use client";

import { useId, useRef } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses, secondaryButtonClasses } from "./button-styles";
import { useCloseOnHide } from "./use-close-on-hide";

type ConfirmButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** The question, e.g. "Cancel order #1001?" */
  title: string;
  /** What happens, e.g. "Its items go back into stock. You can't undo this." */
  message?: string;
  /** The dialog's action button, e.g. "Cancel order". */
  confirmLabel: string;
  /** "danger" for actions that delete or cancel. */
  tone?: "default" | "danger";
  /** Label shown while the surrounding form is submitting. */
  pendingLabel?: string;
};

/**
 * A submit button that asks first, in a dialog, instead of the browser's confirm().
 * The click goes through only after "confirmLabel" is pressed, so the button's name,
 * value and form attribute still reach the form; its own onClick runs only then.
 */
export function ConfirmButton({
  title,
  message,
  confirmLabel,
  tone = "default",
  pendingLabel,
  children,
  disabled,
  onClick,
  ...props
}: ConfirmButtonProps) {
  // useFormStatus follows the form the button sits in; a button that submits another form
  // through form= tracks its own busy state (disabled + its label) instead.
  const formStatus = useFormStatus();
  const pending = formStatus.pending && !props.form;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);
  const titleId = useId();
  const messageId = useId();

  useCloseOnHide(dialogRef);

  return (
    <>
      <button
        {...props}
        ref={buttonRef}
        type="submit"
        disabled={disabled || pending}
        onClick={(e) => {
          if (!confirmed.current) {
            e.preventDefault();
            dialogRef.current?.showModal();
            backRef.current?.focus(); // "Go back" first, so Enter never confirms by accident
            return;
          }
          confirmed.current = false;
          onClick?.(e);
        }}
      >
        {pending && pendingLabel ? pendingLabel : children}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-border bg-surface text-foreground backdrop:bg-overlay"
        // The dialog has no padding of its own, so a click that lands on it is on the backdrop: close.
        onClick={(e) => e.target === e.currentTarget && dialogRef.current?.close()}
      >
        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {message && (
              <p id={messageId} className="text-sm text-muted">
                {message}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button ref={backRef} type="button" className={secondaryButtonClasses("sm")} onClick={() => dialogRef.current?.close()}>
              Go back
            </button>
            <button
              type="button"
              className={tone === "danger" ? secondaryButtonClasses("sm", "danger") : buttonClasses("sm")}
              onClick={() => {
                dialogRef.current?.close();
                confirmed.current = true;
                buttonRef.current?.click();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
