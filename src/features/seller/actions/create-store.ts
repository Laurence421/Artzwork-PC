"use server";

import { z } from "zod";
import { RedirectType } from "next/navigation";
import { redirectOnSite } from "@/lib/site-server";
import { createClient } from "@/lib/supabase/server";

export type CreateStoreState = {
  error?: string;
  fieldErrors?: { name?: string };
  values?: { name: string };
};

const schema = z.object({
  name: z.string().trim().min(1, { error: "Enter your store name" }).max(80, { error: "Keep it under 80 characters" }),
});

// Mirrors the stores.slug check in supabase/migrations/20261020000100_schema.sql.
const SLUG = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])$/;

/**
 * Single-client mode: the shop lives at "/", so the slug is only an internal id
 * (used by checkout). It is made from the name; "shop" if the name gives nothing usable.
 */
function slugFrom(name: string) {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return SLUG.test(slug) ? slug : "shop";
}

export async function createStore(_prev: CreateStoreState, formData: FormData): Promise<CreateStoreState> {
  const values = { name: String(formData.get("name") ?? "") };
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: { name: z.flattenError(parsed.error).fieldErrors.name?.[0] }, values };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims?.sub) return redirectOnSite("/login?next=/onboarding");

  const create = (slug: string) =>
    supabase.rpc("create_store", { p_name: parsed.data.name, p_slug: slug }).single<{ slug: string }>();

  let { error } = await create(slugFrom(parsed.data.name));
  // A reserved word (database check 23514): fall back to the plain id.
  if (error?.code === "23514") ({ error } = await create("shop"));

  if (error) {
    if (error.message === "STORE_EXISTS") return redirectOnSite("/");
    if (error.message === "NOT_SELLER") return { error: "Only the shop owner's account can create the store.", values };
    return { error: "We couldn't create your store. Try again.", values };
  }

  // "/" on the seller site is the dashboard; replace so Back doesn't reopen setup.
  return redirectOnSite("/", RedirectType.replace);
}
