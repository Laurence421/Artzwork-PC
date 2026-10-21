"use client";

import { useActionState } from "react";
import { Button } from "@/features/shared/ui/button";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextField } from "@/features/shared/ui/text-field";
import { signup, type AuthFormState } from "./actions";
import { GoogleButton } from "./google-button";
import { LeaveIfSignedIn } from "./leave-if-signed-in";

export function SignupForm({
  next,
  notice,
  withGoogle,
  leaveIfSignedIn,
}: {
  next?: string;
  notice?: string;
  withGoogle?: boolean;
  /** Seller site: leave for the dashboard if already signed in (also after Back). */
  leaveIfSignedIn?: boolean;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(signup, {});

  if (state.sent) {
    return (
      <FormAlert tone="success" title="Check your email">
        We sent a confirmation link to {state.values?.email}. Open it to finish creating your account.
      </FormAlert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {leaveIfSignedIn && <LeaveIfSignedIn next={next} />}
      {withGoogle && <GoogleButton next={next} from="/signup" />}
      <form action={action} className="flex flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="At least 8 characters"
        error={state.fieldErrors?.password}
      />
      {(state.error ?? notice) && <FormAlert>{state.error ?? notice}</FormAlert>}
      <Button pendingLabel="Creating account…">Create account</Button>
      </form>
    </div>
  );
}
