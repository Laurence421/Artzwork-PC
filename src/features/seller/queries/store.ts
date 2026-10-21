import "server-only";
import { cache } from "react";
import { sellerHome } from "@/features/shared/auth/destination";
import { redirectOnSite } from "@/lib/site-server";
import { createClient } from "@/lib/supabase/server";

export type SellerStore = { id: string; name: string; slug: string; tagline: string | null };

/**
 * The signed-in owner's store, once per request. Anyone else is sent away:
 * the owner before the store exists to /onboarding, other accounts are signed out.
 */
export const getSellerStore = cache(async () => {
  const supabase = await createClient();
  // store_members RLS only returns the signed-in user's own membership.
  const { data } = await supabase
    .from("stores")
    .select("id, name, slug, tagline, store_members!inner(user_id)")
    .limit(1)
    .maybeSingle<SellerStore>();

  if (!data) {
    const home = await sellerHome(supabase);
    // Never back to "/": that could loop if the two queries ever disagree.
    return redirectOnSite(home === "/onboarding" ? home : "/auth/signout?error=not-owner");
  }

  const store: SellerStore = { id: data.id, name: data.name, slug: data.slug, tagline: data.tagline };
  return { supabase, store };
});
