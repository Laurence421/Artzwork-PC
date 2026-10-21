import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentSite } from "@/lib/site-server";
import { createClient } from "@/lib/supabase/server";
import { sellerHome } from "./destination";
import { googleSignInEnabled } from "./google-status";
import { AuthLink, AuthShell } from "@/features/shared/ui/auth-shell";
import { FormAlert } from "@/features/shared/ui/form-alert";
import { LoginForm } from "./login-form";
import { NOT_OWNER, OWNER_ON_SHOP } from "./messages";
import { resetAllowedFor } from "./password-reset";
import { ForgotPasswordForm, NewPasswordForm } from "./password-reset-forms";
import { safeNext } from "./next-path";
import { SignupForm } from "./signup-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// "Continue with Google" shows only while Google is switched on in Supabase (googleSignInEnabled).

type ScreenProps = {
  title: string;
  subtitle: string;
  footer: React.ReactNode;
  searchParams: SearchParams;
  /** Customer site: offer "Continue with Google" above the email form. */
  withGoogle?: boolean;
  brand?: React.ReactNode;
};

const NOTICES: Record<string, string> = {
  link: "That link has expired or was already used. Log in, or sign up again to get a new one.",
  "not-owner": NOT_OWNER,
  "owner-here": OWNER_ON_SHOP,
  google: "We couldn't connect to Google. Try again, or use your email.",
  deleted: "Your account was deleted. Thank you for shopping with us.",
  reset: "Your password was changed. Log in with your new password.",
};

/** Notices that report something done, not a problem. */
const GOOD_NEWS = new Set(["deleted", "reset"]);

/** Login screen shared by the customer and seller sites; each passes its own words. */
export function LoginScreen({ title, subtitle, footer, searchParams, withGoogle, brand }: ScreenProps) {
  return (
    <AuthShell title={title} subtitle={subtitle} footer={footer} brand={brand}>
      {/* ?next= and ?error= are request data, so they stream in; the plain form is the static shell. */}
      <Suspense fallback={<LoginForm />}>
        <LoginWithParams searchParams={searchParams} withGoogle={withGoogle} />
      </Suspense>
    </AuthShell>
  );
}

type ParamsProps = { searchParams: SearchParams; withGoogle?: boolean };

/**
 * Seller site only: an owner who is already signed in skips the form and goes to the
 * dashboard. Returns whether this is the seller site, so the form can also check on Back.
 * The shop's login and sign-up pages behave like ordinary pages.
 */
async function skipIfSignedIn(next: string | undefined) {
  if ((await currentSite()) !== "seller") return false;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    const home = await sellerHome(supabase);
    if (home) redirect(next ?? home);
  }
  return true;
}

async function readParams(searchParams: SearchParams) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const next = safeNext(params.next) ?? undefined;
  const leaveIfSignedIn = await skipIfSignedIn(next);
  return { next, notice: error ? NOTICES[error] : undefined, noticeTone: error && GOOD_NEWS.has(error) ? ("success" as const) : ("danger" as const), leaveIfSignedIn };
}

async function LoginWithParams({ searchParams, withGoogle }: ParamsProps) {
  const [params, google] = await Promise.all([readParams(searchParams), withGoogle ? googleSignInEnabled() : false]);
  return <LoginForm {...params} withGoogle={google} />;
}

/** Sign-up screen shared by the customer and seller sites. */
export function SignupScreen({ title, subtitle, footer, searchParams, withGoogle, brand }: ScreenProps) {
  return (
    <AuthShell title={title} subtitle={subtitle} footer={footer} brand={brand}>
      <Suspense fallback={<SignupForm />}>
        <SignupWithParams searchParams={searchParams} withGoogle={withGoogle} />
      </Suspense>
    </AuthShell>
  );
}

async function SignupWithParams({ searchParams, withGoogle }: ParamsProps) {
  const [params, google] = await Promise.all([readParams(searchParams), withGoogle ? googleSignInEnabled() : false]);
  return <SignupForm {...params} withGoogle={google} />;
}

/** "Forgot password?" on either site. */
export function ForgotPasswordScreen({ brand }: { brand?: React.ReactNode }) {
  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we'll send you a link to set a new one."
      footer={<>Remembered it? <AuthLink href="/login">Log in</AuthLink></>}
      brand={brand}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}

/** "Set a new password", opened from the reset email (which signs the person in for this). */
export function ResetPasswordScreen({ brand }: { brand?: React.ReactNode }) {
  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose a new password for your account."
      footer={<>Changed your mind? <AuthLink href="/login">Back to log in</AuthLink></>}
      brand={brand}
    >
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ResetPasswordBody />
      </Suspense>
    </AuthShell>
  );
}

async function ResetPasswordBody() {
  // The token (verified here, no round trip) is enough to show the form; saving checks with Supabase.
  const { data } = await (await createClient()).auth.getClaims();
  const user = data?.claims ? { id: data.claims.sub, email: typeof data.claims.email === "string" ? data.claims.email : "" } : null;
  // Only right after opening the email's link: a device that is merely signed in can't change it.
  if (!user || !(await resetAllowedFor(user.id))) {
    return (
      <FormAlert title="That link has expired or was already used">
        Reset links work once and for a short time. <AuthLink href="/forgot-password">Ask for a new link</AuthLink>.
      </FormAlert>
    );
  }
  return (
    <>
      <p className="text-sm text-muted">For {user.email}</p>
      <NewPasswordForm />
    </>
  );
}
