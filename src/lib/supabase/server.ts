import "server-only";
import { createServerClient } from "@supabase/ssr";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env";

/**
 * Per-request client acting as the signed-in user (RLS applies).
 * Use in server components, server actions and route handlers.
 */
export async function createClient() {
  // Always per request: Supabase reads the clock (Date.now) to check the session's
  // expiry, which Cache Components only allows once the render is marked dynamic.
  await connection();
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a server component, where cookies are read-only.
          // The proxy refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
