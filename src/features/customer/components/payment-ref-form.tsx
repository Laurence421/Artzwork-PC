"use client";

import { useActionState, useState } from "react";
import { Button } from "@/features/shared/ui/button";
import { secondaryButtonClasses } from "@/features/shared/ui/button-styles";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextField } from "@/features/shared/ui/text-field";
import { submitPaymentRef, type PaymentRefState } from "../actions/orders";
import { AlertAction } from "./cart-load-error";

/**
 * Under "How to pay": once paid by GCash or bank, the customer sends the reference number so the
 * shop can match the payment. Shows the one already sent, with a way to correct it.
 */
export function PaymentRefForm({ token, current, optional = false }: { token: string; current: string | null; optional?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [opened, setOpened] = useState(false);
  const [state, action] = useActionState<PaymentRefState, FormData>(async (prev, formData) => {
    const result = await submitPaymentRef(token, prev, formData);
    if (result.sent) setEditing(false); // back to "Reference sent" with the new one
    return result;
  }, {});

  if (current && !editing) {
    return (
      <div className="flex flex-col gap-4 border-t border-border pt-4">
        {state.sent && <FormAlert tone="success">Thanks! The shop will confirm your payment soon.</FormAlert>}
        <div className="flex flex-col gap-1">
          <p>
            Reference sent: <span className="font-semibold tabular-nums">{current}</span>
          </p>
          <p className="text-muted">
            The shop checks it and marks your order as paid. <AlertAction onClick={() => setEditing(true)}>Change it</AlertAction>
          </p>
        </div>
      </div>
    );
  }

  // Payments are confirmed automatically: the reference is only a fallback, one line until asked for.
  if (optional && !current && !opened && !state.value) {
    return (
      <p className="border-t border-border pt-4 text-muted">
        Paid but not confirmed after 10 minutes? <AlertAction onClick={() => setOpened(true)}>Send your reference number</AlertAction>
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4 border-t border-border pt-4" key={state.value ?? ""}>
      <TextField
        label={current ? "Correct the reference number" : "Already paid? Enter the reference number"}
        name="ref"
        required
        maxLength={40}
        autoComplete="off"
        // Opened with "Change it": the button that was clicked is gone, so focus moves here.
        autoFocus={editing || opened}
        defaultValue={state.value ?? current ?? ""}
        hint="It's on your GCash or bank receipt. The shop uses it to find your payment."
        error={state.fieldError}
      />
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <div className="flex justify-end gap-2">
        {!current && opened && (
          <button type="button" className={secondaryButtonClasses("sm")} onClick={() => setOpened(false)}>
            Never mind
          </button>
        )}
        {current && (
          <button type="button" className={secondaryButtonClasses("sm")} onClick={() => setEditing(false)}>
            Keep it
          </button>
        )}
        <Button size="sm" pendingLabel="Sending…">
          Send reference
        </Button>
      </div>
    </form>
  );
}
