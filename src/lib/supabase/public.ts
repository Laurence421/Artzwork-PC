import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env";

/**
 * Cookieless anonymous client for public storefront reads. It never touches the
 * request, so results can be cached and invalidated with the store's cache tag.
 */
export function createPublicClient() {
  const { url, key } = supabaseEnv();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
