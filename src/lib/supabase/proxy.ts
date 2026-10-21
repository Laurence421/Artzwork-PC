import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SELLER_PREFIX, siteForHost } from "@/lib/site";
import { supabaseEnv } from "./env";

/** Seller-site pages a signed-out visitor may open. */
const SELLER_PUBLIC = ["/login", "/forgot-password", "/reset-password", "/auth/confirm", "/auth/signout"];

/**
 * Runs on every page request:
 * - seller host: serves /x from /seller/x and sends signed-out visitors to /login;
 * - seller host: /seller/x (where action redirects land) redirects to the clean /x;
 * - customer host: the /seller folder does not exist (404);
 * - both: refreshes the Supabase session cookie.
 * Access checks here are optimistic; pages and the database (RLS) enforce them.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const site = siteForHost(request.headers.get("host"));
  const isSellerFolder = pathname === SELLER_PREFIX || pathname.startsWith(`${SELLER_PREFIX}/`);

  if (isSellerFolder) {
    // Seller host: server-action redirects land on /seller/... (see redirectOnSite); show the clean address.
    if (site === "seller") {
      const clean = request.nextUrl.clone();
      clean.pathname = pathname.slice(SELLER_PREFIX.length) || "/";
      return NextResponse.redirect(clean);
    }
    // Shop host: the seller folder doesn't exist. Rewriting to a missing path renders the app's 404.
    return NextResponse.rewrite(new URL("/not-found", request.url));
  }

  // /auth/confirm is shared; everything else on the seller host lives under /seller.
  const rewriteTo =
    site === "seller" && !pathname.startsWith("/auth/")
      ? new URL(`${SELLER_PREFIX}${pathname === "/" ? "" : pathname}${search}`, request.url)
      : null;
  const pass = () => (rewriteTo ? NextResponse.rewrite(rewriteTo, { request }) : NextResponse.next({ request }));

  let response = pass();
  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = pass();
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // Must run straight after creating the client: it refreshes an expired session.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (site === "seller" && !signedIn && !SELLER_PUBLIC.includes(pathname)) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(login);
  }

  return response;
}
