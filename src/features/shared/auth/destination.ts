import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Seller site only: where the signed-in owner lands. "/" is the dashboard,
 * "/onboarding" before the store exists; null when this account is not the seller.
 */
export async function sellerHome(supabase: SupabaseClient): Promise<"/" | "/onboarding" | null> {
  const { data: membership } = await supabase.from("store_members").select("store_id").limit(1).maybeSingle();
  if (membership) return "/";

  const { data: isSeller } = await supabase.rpc("is_seller");
  return isSeller ? "/onboarding" : null;
}
