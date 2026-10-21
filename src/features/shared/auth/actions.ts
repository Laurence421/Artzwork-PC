"use server";

import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { z } from "zod";
import { currentSite, redirectOnSite } from "@/lib/site-server";
import { createClient } from "@/lib/supabase/server";
import { sellerHome } from "./destination";
import { googleSignInEnabled } from "./google-status";
import { NOT_OWNER } from "./messages";
import { sendOwnerToSellerSite } from "./owner-redirect";
import { safeNext } from "./next-path";
import { clearResetCookie, RESET_PATH, resetAllowedFor } from "./password-reset";

export type AuthFormState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
  values?: { email: string };
  /** Sign-up only: the confirmation email was sent. */
  sent?: boolean;
};

const signupCredentials = z.object({
  email: z.email({ error: "Enter a valid email" }),
  password: z.string().min(8, { error: "At least 8 characters" }),
});

const loginCredentials = signupCredentials.extend({
  password: z.string().min(1, { error: "Enter your password" }),
});

/** This site's own address, for links that must come back here (confirmation, Google). */
async function requestOrigin() {
  const h = await headers();
  return h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

function readCredentials(formData: FormData, schema = signupCredentials) {
  return schema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
}

function fieldErrors(error: z.ZodError<z.infer<typeof signupCredentials>>) {
  const flat = z.flattenError(error).fieldErrors;
  return { email: flat.email?.[0], password: flat.password?.[0] };
}

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = readCredentials(formData, loginCredentials);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error: error.code === "email_not_confirmed"
        ? "Confirm your email first. Check your inbox for the link."
        : "Wrong email or password",
      values: { email },
    };
  }

  const next = safeNext(formData.get("next"));

  if ((await currentSite()) === "seller") {
    const home = await sellerHome(supabase);
    if (!home) {
      // Only the owner may be signed in on the seller site.
      await supabase.auth.signOut();
      return { error: NOT_OWNER, values: { email } };
    }
    // replace: Back from the dashboard must not return to the login form.
    return redirectOnSite(next ?? home, RedirectType.replace);
  }

  // The owner belongs on the seller site, which keeps its own login.
  await sendOwnerToSellerSite(supabase);

  // Link any guest orders placed with this email to the account.
  await supabase.rpc("claim_customer_records");
  redirect(next ?? "/", RedirectType.replace);
}

export async function signup(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = readCredentials(formData);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values: { email } };

  // The confirmation link comes back to the site the person signed up on.
  const origin = await requestOrigin();
  const next = safeNext(formData.get("next"));
  const confirmUrl = `${origin}/auth/confirm${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: confirmUrl } });

  // An already-registered email gets the same answer, so the form can't be used to
  // find out who has an account.
  if (error && error.code !== "user_already_exists") {
    return {
      error: error.code === "over_email_send_rate_limit"
        ? "Too many sign-ups right now. Try again in a few minutes."
        : "We couldn't create your account. Try again.",
      values: { email },
    };
  }

  return { sent: true, values: { email } };
}

/** Customer site only: sign in or sign up with Google, coming back through /auth/confirm. */
export async function signInWithGoogle(formData: FormData) {
  if ((await currentSite()) === "seller" || !(await googleSignInEnabled())) return redirectOnSite("/login");

  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await requestOrigin()}/auth/confirm${next ? `?next=${encodeURIComponent(next)}` : ""}` },
  });
  const from = formData.get("from") === "/signup" ? "/signup" : "/login";
  redirect(error || !data.url ? `${from}?error=google` : data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Shoppers keep shopping; the seller site has nothing to show signed out but its login.
  return redirectOnSite((await currentSite()) === "seller" ? "/login" : "/", RedirectType.replace);
}

// Forgot password ------------------------------------------------------------------------

export type ResetRequestState = { error?: string; fieldError?: string; email?: string; sent?: boolean };

/**
 * Emails a reset link (Supabase sends it). The answer is the same whether or not the email has an
 * account, so the form can't be used to find out who shops here. The link comes back through
 * /auth/confirm, signed in for this one purpose, to the "Set a new password" page.
 */
export async function requestPasswordReset(_prev: ResetRequestState, formData: FormData): Promise<ResetRequestState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!z.email().safeParse(email).success) return { fieldError: "Enter a valid email", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/auth/confirm?next=${encodeURIComponent(RESET_PATH)}`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.status === 429) {
    return { error: "Too many reset emails right now. Try again in a few minutes.", email };
  }
  return { sent: true, email };
}

export type NewPasswordState = { error?: string; fieldErrors?: { password?: string; confirm?: string } };

/** "Set a new password": only with the session the reset link opened; then log in again. */
export async function setNewPassword(_prev: NewPasswordState, formData: FormData): Promise<NewPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { fieldErrors: { password: "At least 8 characters" } };
  if (password !== confirm) return { fieldErrors: { confirm: "The two passwords don't match" } };

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  // Only the session a real reset link opened (see /auth/confirm), never just any signed-in device.
  if (!data.user || !(await resetAllowedFor(data.user.id))) {
    return { error: "That link has expired or was already used. Ask for a new one." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Choose a password different from your old one."
          : error.code === "weak_password"
            ? "Choose a stronger password: longer, with numbers or symbols."
            : "We couldn't change your password. Try again.",
    };
  }
  // Every device logs in again with the new password; the link can't be used twice.
  await clearResetCookie();
  await supabase.auth.signOut({ scope: "global" });
  return redirectOnSite("/login?error=reset", RedirectType.replace);
}
