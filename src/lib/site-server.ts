import "server-only";
import { headers } from "next/headers";
import { redirect, RedirectType } from "next/navigation";
import { SELLER_PREFIX, siteForHost, type Site } from "./site";

/** Which site the current request is on (server components, actions, route handlers). */
export async function currentSite(): Promise<Site> {
  return siteForHost((await headers()).get("host"));
}

/**
 * redirect() for server actions. After an action, Next.js renders the redirect target
 * in the same response without going through the proxy, so on the seller site "/"
 * would render the shop. Point at the seller folder instead; the proxy turns
 * /seller/... back into a clean address on the next real request.
 * type: "replace" for redirects away from a form the user shouldn't go Back to (login, logout).
 */
export async function redirectOnSite(
  path: string,
  type: (typeof RedirectType)[keyof typeof RedirectType] = RedirectType.push,
): Promise<never> {
  if ((await currentSite()) === "seller" && path.startsWith("/") && !path.startsWith("/auth/")) {
    redirect(`${SELLER_PREFIX}${path === "/" ? "" : path}`, type);
  }
  redirect(path, type);
}
