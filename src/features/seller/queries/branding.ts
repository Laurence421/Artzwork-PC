import "server-only";
import { resolveBranding, type Branding, type StoredBranding } from "@/features/shared/lib/branding";
import { publicImageUrl } from "@/features/shared/lib/storage";
import { getSellerStore } from "./store";

export type BrandingForEdit = {
  branding: Branding;
  paths: { logo: string | null; favicon: string | null; banner: string | null };
};

export async function getBrandingForEdit(): Promise<BrandingForEdit> {
  const { supabase, store } = await getSellerStore();
  const { data } = await supabase.from("stores").select("name, tagline, branding, theme").eq("id", store.id).single();
  const stored = (data?.branding ?? {}) as StoredBranding;
  return {
    branding: resolveBranding(data ?? { name: store.name, tagline: null, branding: {}, theme: {} }, publicImageUrl),
    paths: { logo: stored.logo_path ?? null, favicon: stored.favicon_path ?? null, banner: stored.banner_path ?? null },
  };
}
