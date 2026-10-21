import { supabaseEnv } from "@/lib/supabase/env";

/** Bucket for logos, banners and product photos; object paths start with the store id. */
export const ASSETS_BUCKET = "store-assets";

export function publicImageUrl(path: string) {
  return `${supabaseEnv().url}/storage/v1/object/public/${ASSETS_BUCKET}/${path}`;
}
