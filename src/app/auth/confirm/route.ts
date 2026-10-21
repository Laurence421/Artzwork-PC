import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { sellerHome } from "@/features/shared/auth/destination";
import { ownerSellerLogin } from "@/features/shared/auth/owner-redirect";
import { safeNext } from "@/features/shared/auth/next-path";
import { RESET_COOKIE, RESET_PATH } from "@/features/shared/auth/password-reset";
import { siteForHost } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

/**
 * Target of the sign-up confirmation email, on whichever site the person signed up.
 * Handles both link styles Supabase sends: ?code= (default template) and
 * ?token_hash=&type= (custom template).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing token") };

  if (error) {
    // Google (or another provider) sent them back with an error instead of a code.
    if (searchParams.has("error")) return NextResponse.redirect(new URL("/login?error=google", origin));
    // Expired or already-used link: they can still log in if the email was confirmed.
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  const next = safeNext(searchParams.get("next"));

  // A password reset link: open "Set a new password" on this site, and remember (briefly, in a
  // private cookie) that this session came from the link, so only it can change the password.
  if (next === RESET_PATH) {
    const { data } = await supabase.auth.getUser();
    const response = NextResponse.redirect(new URL(RESET_PATH, origin));
    if (data.user) {
      response.cookies.set(RESET_COOKIE, data.user.id, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), path: "/", maxAge: 15 * 60 });
    }
    return response;
  }

  if (siteForHost(request.headers.get("host")) === "seller") {
    const home = await sellerHome(supabase);
    if (!home) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=not-owner", origin));
    }
    return NextResponse.redirect(new URL(next ?? home, origin));
  }

  // The owner confirmed on the shop (e.g. Supabase fell back to the Site URL): send them to the seller site.
  const ownerLogin = await ownerSellerLogin(supabase);
  if (ownerLogin) return NextResponse.redirect(ownerLogin);

  await supabase.rpc("claim_customer_records");
  return NextResponse.redirect(new URL(next ?? "/", origin));
}
