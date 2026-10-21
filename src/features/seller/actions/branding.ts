"use server";

import { removeUnusedImages } from "../lib/storage-cleanup";
import { refresh, updateTag } from "next/cache";
import { z } from "zod";
import { isReadableAccent, safeUrl, SOCIALS, type StoredBranding } from "@/features/shared/lib/branding";
import { CATALOG_TAG } from "@/features/shared/lib/cache-tags";
import { ASSETS_BUCKET } from "@/features/shared/lib/storage";
import { getSellerStore } from "../queries/store";

export type BrandingFormState = { error?: string; message?: string; fieldErrors?: Record<string, string | undefined> };

const text = (max: number, msg: string) => z.string().trim().max(max, { error: msg });

/** "facebook.com/x" -> "https://facebook.com/x"; anything that isn't an https link -> null. */
function normaliseLink(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "";
  return safeUrl(/^https?:\/\//i.test(v) ? v.replace(/^http:/i, "https:") : `https://${v}`) || null;
}

const schema = z.object({
  name: z.string().trim().min(1, { error: "Enter your store name" }).max(80, { error: "Keep it under 80 characters" }),
  tagline: text(160, "Keep it under 160 characters"),
  announcement: text(160, "Keep it under 160 characters"),
  instalment: text(160, "Keep it under 160 characters"),
  about: text(4000, "Keep it under 4,000 characters"),
  phone: z
    .string()
    .trim()
    .regex(/^$|^[0-9+()\-\s]{7,30}$/, { error: "Enter a phone number, like 0917 123 4567" }),
  email: z.email({ error: "Enter a valid email" }).or(z.literal("")),
  address: text(300, "Keep it under 300 characters"),
  accent: z.string().refine(isReadableAccent, { error: "That colour is hard to read on the dark background. Pick a lighter one." }),
});

export async function saveBranding(_prev: BrandingFormState, formData: FormData): Promise<BrandingFormState> {
  const { supabase, store } = await getSellerStore();
  const str = (k: string) => String(formData.get(k) ?? "");

  const parsed = schema.safeParse({
    name: str("name"),
    tagline: str("tagline"),
    announcement: str("announcement"),
    instalment: str("instalment"),
    about: str("about"),
    phone: str("phone"),
    email: str("email"),
    address: str("address"),
    accent: str("accent"),
  });
  const fieldErrors: Record<string, string | undefined> = {};
  if (!parsed.success) {
    for (const [k, v] of Object.entries(z.flattenError(parsed.error).fieldErrors)) fieldErrors[k] = (v as string[] | undefined)?.[0];
  }

  const socials: StoredBranding["socials"] = {};
  for (const s of SOCIALS) {
    const link = normaliseLink(str(`social.${s.key}`));
    if (link === null) fieldErrors[`social.${s.key}`] = `Enter a full link, like ${s.placeholder}`;
    else if (link) socials[s.key] = link;
  }

  const images = { logo: str("logoPath") || null, favicon: str("faviconPath") || null, banner: str("bannerPath") || null };
  for (const [k, p] of Object.entries(images)) {
    if (p && !p.startsWith(`${store.id}/`)) fieldErrors[k] = "Upload this image again";
  }

  if (!parsed.success || Object.values(fieldErrors).some(Boolean)) {
    return { error: "Fix the fields marked in red.", fieldErrors };
  }
  const v = parsed.data;

  const { data: before } = await supabase.from("stores").select("branding").eq("id", store.id).single();
  const old = (before?.branding ?? {}) as StoredBranding;

  const branding: StoredBranding = {
    ...(images.logo && { logo_path: images.logo }),
    ...(images.favicon && { favicon_path: images.favicon }),
    ...(images.banner && { banner_path: images.banner }),
    ...(v.announcement && { announcement: v.announcement }),
    ...(v.instalment && { instalment: v.instalment }),
    ...(v.about && { about: v.about }),
    contact: { phone: v.phone || undefined, email: v.email || undefined, address: v.address || undefined },
    socials,
  };

  const { error } = await supabase
    .from("stores")
    .update({ name: v.name, tagline: v.tagline || null, branding, theme: { accent: v.accent } })
    .eq("id", store.id);
  if (error) return { error: "We couldn't save your branding. Try again." };

  // Images that were replaced or removed are deleted from storage.
  const replaced = [old.logo_path, old.favicon_path, old.banner_path].filter(
    (p): p is string => !!p && p !== images.logo && p !== images.favicon && p !== images.banner,
  );
  if (replaced.length) await supabase.storage.from(ASSETS_BUCKET).remove(replaced);
  // Images uploaded here but never saved (or older leftovers) are removed too.
  await removeUnusedImages(supabase, store.id, "branding", [images.logo, images.favicon, images.banner].filter((p): p is string => !!p));

  updateTag(CATALOG_TAG);
  refresh();
  return { message: "Branding saved. Your shop shows it now." };
}
