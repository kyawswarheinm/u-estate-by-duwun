import "server-only";
import { usesSupabase } from "@/lib/db/runtime";
import { supabaseServer } from "@/lib/supabase/server";

/** First seller-uploaded photo per U-Estate listing (public bucket). Empty on the local store, or if photos can't load. */
export async function coverPhotos(listingIds: string[]): Promise<Record<string, string>> {
  if (!usesSupabase() || listingIds.length === 0) return {};
  try {
    const client = await supabaseServer();
    const { data, error } = await client.from("listing_photos").select("listing_id,storage_path").in("listing_id", listingIds).order("position").order("created_at");
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const p of data) out[p.listing_id] ??= client.storage.from("listing-photos").getPublicUrl(p.storage_path).data.publicUrl;
    return out;
  } catch {
    return {}; // cards fall back to illustrations; the rest of the page still works
  }
}
