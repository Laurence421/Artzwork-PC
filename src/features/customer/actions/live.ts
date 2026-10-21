"use server";

import { createClient } from "@/lib/supabase/server";

// Tiny "has it changed?" checks for open pages (see LiveUpdates): one indexed lookup each,
// so a page can stay up to date without re-rendering itself every few seconds.

/** When this order's status last changed; null if the link is wrong. */
export async function orderVersion(token: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await (await createClient()).rpc("order_version", { p_token: token });
  return typeof data === "string" ? data : null;
}

/** The latest change across the signed-in customer's own orders. */
export async function myOrdersVersion(): Promise<string | null> {
  const { data } = await (await createClient()).rpc("my_orders_version");
  return typeof data === "string" ? data : null;
}
