import "server-only";
import { cacheLife } from "next/cache";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Whether Google sign-in is switched on in Supabase (Authentication → Sign In / Providers → Google).
 * "Continue with Google" shows only then, so customers never reach Supabase's
 * "provider is not enabled" error. Rechecked every few minutes.
 */
export async function googleSignInEnabled(): Promise<boolean> {
  "use cache";
  cacheLife("minutes");
  try {
    const { url, key } = supabaseEnv();
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    if (!res.ok) return false;
    const settings = (await res.json()) as { external?: { google?: boolean } };
    return settings.external?.google === true;
  } catch {
    return false;
  }
}
