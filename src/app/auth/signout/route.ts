import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out, then shows the login page with a notice. Pages can't change cookies while
 * rendering, so a seller page that turns an account away redirects here.
 * A link or image on another website could otherwise log a visitor out, so requests the
 * browser marks as coming from another site (Sec-Fetch-Site: cross-site) don't sign out.
 */
export async function GET(request: NextRequest) {
  const fetchSite = request.headers.get("sec-fetch-site");
  const fromThisSite = !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
  if (fromThisSite) await (await createClient()).auth.signOut();

  const notice = request.nextUrl.searchParams.get("error") === "not-owner" ? "?error=not-owner" : "";
  return NextResponse.redirect(new URL(`/login${notice}`, request.nextUrl.origin));
}
