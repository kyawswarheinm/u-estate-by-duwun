import Image from "next/image";
import { supabaseServer } from "@/lib/supabase/server";
import { usesSupabase } from "@/lib/db/runtime";
import { backendText } from "@/i18n/backend";
import type { Profile } from "@/lib/types";
export async function ListingPhotos({id,locale}:{id:string;locale:Profile["locale"]}) {
 if(!usesSupabase())return null;
 const client=await supabaseServer();const {data,error}=await client.from("listing_photos").select("id,storage_path").eq("listing_id",id).order("position").order("created_at").limit(24);
 if(error)throw new Error("Photos unavailable.");if(!data?.length)return null;const t=backendText(locale);
 return <section aria-label={t.photos} className="grid gap-3 sm:grid-cols-3">{data.map(p=><Image key={p.id} src={client.storage.from("listing-photos").getPublicUrl(p.storage_path).data.publicUrl} alt={t.photoAlt} width={600} height={400} unoptimized className="h-56 w-full rounded-xl object-cover"/>)}</section>;
}
