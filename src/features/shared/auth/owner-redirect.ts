import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect, RedirectType } from "next/navigation";

/**
 * On the shop: if this signed-in account is the owner and the seller site is configured,
 * sign them out here and return the seller login to send them to. Null = treat as a customer.
 * The two sites keep separate logins (cookies are per address), so the shop can't sign
 * the owner in on the seller site itself.
 */
export async function ownerSellerLogin(supabase: SupabaseClient): Promise<string | null> {
  if (!process.env.SELLER_URL) return null;
  const { data: isSeller } = await supabase.rpc("is_seller");
  if (!isSeller) return null;
  await supabase.auth.signOut();
  return `${process.env.SELLER_URL}/login?error=owner-here`;
}

/** Server actions: move the owner to the seller site (see ownerSellerLogin). */
export async function sendOwnerToSellerSite(supabase: SupabaseClient) {
  const target = await ownerSellerLogin(supabase);
  if (target) redirect(target, RedirectType.replace);
}
