"use client";

import { useActionState } from "react";
import { AuthLink } from "@/features/shared/ui/auth-shell";
import { Button } from "@/features/shared/ui/button";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { TextField } from "@/features/shared/ui/text-field";
import { login, type AuthFormState } from "./actions";
import { GoogleButton } from "./google-button";
import { LeaveIfSignedIn } from "./leave-if-signed-in";

export function LoginForm({
  next,
  notice,
  noticeTone = "danger",
  withGoogle,
  leaveIfSignedIn,
}: {
  next?: string;
  notice?: string;
  /** Good news (password changed) shows green; problems red. */
  noticeTone?: "success" | "danger";
  withGoogle?: boolean;
  /** Seller site: leave for the dashboard if already signed in (also after Back). */
  leaveIfSignedIn?: boolean;
}) {
  const [state, action] = useActionState<AuthFormState, FormData>(login, {});

  return (
    <div className="flex flex-col gap-4">
      {leaveIfSignedIn && <LeaveIfSignedIn next={next} />}
      {withGoogle && <GoogleButton next={next} from="/login" />}
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
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <p className="text-right text-sm">
        <AuthLink href="/forgot-password">Forgot password?</AuthLink>
      </p>
      {/* One form-level message: a failed login replaces the notice the page arrived with. */}
      {(state.error ?? notice) && <FormAlert tone={state.error ? "danger" : noticeTone}>{state.error ?? notice}</FormAlert>}
      <Button pendingLabel="Logging in…">Log in</Button>
      </form>
    </div>
  );
}
