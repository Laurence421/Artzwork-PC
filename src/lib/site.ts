/**
 * Two sites, one app. Requests to SELLER_HOST are the seller site and are served
 * from src/app/(seller)/seller/*; every other host is the customer site.
 * The host comes from the request, never from the client's form data.
 */
export type Site = "seller" | "customer";

/** Internal folder the seller site is served from. Never linked to directly. */
export const SELLER_PREFIX = "/seller";

export function siteForHost(host: string | null): Site {
  const sellerHost = process.env.SELLER_HOST?.toLowerCase();
  return sellerHost && host?.toLowerCase() === sellerHost ? "seller" : "customer";
}
