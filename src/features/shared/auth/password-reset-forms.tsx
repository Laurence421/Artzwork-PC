"use client";

import { useActionState } from "react";
import { Button } from "@/features/shared/ui/button";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextField } from "@/features/shared/ui/text-field";
import { requestPasswordReset, setNewPassword, type NewPasswordState, type ResetRequestState } from "./actions";

/** "Forgot password?": the email to send the reset link to. */
export function ForgotPasswordForm() {
  const [state, action] = useActionState<ResetRequestState, FormData>(requestPasswordReset, {});

  if (state.sent) {
    return (
      <FormAlert tone="success" title="Check your email">
        If an account uses {state.email}, we&apos;ve sent it a link to set a new password. It can take a few minutes; check your spam folder too.
      </FormAlert>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.email}
        error={state.fieldError}
      />
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <Button pendingLabel="Sending…">Send reset link</Button>
    </form>
  );
}

/** "Set a new password", opened from the email link. */
export function NewPasswordForm() {
  const [state, action] = useActionState<NewPasswordState, FormData>(setNewPassword, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <TextField label="New password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters" error={e.password} />
      <TextField label="Type it again" name="confirm" type="password" autoComplete="new-password" required error={e.confirm} />
      {state.error && <FormAlert>{state.error}</FormAlert>}
      <Button pendingLabel="Saving…">Save new password</Button>
    </form>
  );
}
