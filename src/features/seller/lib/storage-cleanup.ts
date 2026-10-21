import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSETS_BUCKET } from "@/features/shared/lib/storage";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Deletes images in {storeId}/{folder}/ that nothing uses any more: uploaded but never saved (a
 * form left halfway), or left over from before. Files younger than a day are kept, so an upload
 * still being filled in another tab is never touched. Runs after a save, with the seller's own
 * access; a failure here never affects the save.
 */
export async function removeUnusedImages(supabase: SupabaseClient, storeId: string, folder: "products" | "branding" | "payments", inUse: Iterable<string>) {
  try {
    const keep = new Set(inUse);
    const { data } = await supabase.storage.from(ASSETS_BUCKET).list(`${storeId}/${folder}`, { limit: 1000 });
    const old = (data ?? [])
      .filter((f) => f.id && f.created_at && Date.now() - new Date(f.created_at).getTime() > DAY)
      .map((f) => `${storeId}/${folder}/${f.name}`)
      .filter((path) => !keep.has(path));
    if (old.length) await supabase.storage.from(ASSETS_BUCKET).remove(old);
    return old.length;
  } catch {
    return 0;
  }
}
