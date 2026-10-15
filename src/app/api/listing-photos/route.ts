import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/session";
import { usesSupabase } from "@/lib/db/runtime";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { imageExtension, MAX_IMAGE_BYTES } from "@/lib/upload";
import { rateLimit } from "@/lib/ratelimit";
export async function POST(req: Request) {
 const me=await currentUser();if(!me)return Response.json({ok:false},{status:401});
 if(!usesSupabase())return Response.json({ok:false},{status:503});
 const limited=rateLimit(req,"listing-photos",10);if(limited)return limited;
 if(Number(req.headers.get("content-length"))>MAX_IMAGE_BYTES+100000)return Response.json({ok:false},{status:413});
 let form:FormData;try{form=await req.formData();}catch{return Response.json({ok:false},{status:400});}
 const id=z.uuid().safeParse(form.get("listingId"));const file=form.get("photo");
 if(!id.success||!(file instanceof File)||file.size===0||file.size>MAX_IMAGE_BYTES)return Response.json({ok:false},{status:400});
 const client=await supabaseServer();
 const owned=await client.from("listings").select("id").eq("id",id.data).eq("seller_id",me.id).maybeSingle();
 if(owned.error||!owned.data)return Response.json({ok:false},{status:403});
 const bytes=new Uint8Array(await file.arrayBuffer());const ext=imageExtension(bytes,file.type);
 if(!ext)return Response.json({ok:false},{status:400});
 const path=`${me.id}/${id.data}/${randomUUID()}.${ext}`;
 const upload=await client.storage.from("listing-photos").upload(path,bytes,{contentType:file.type});
 if(upload.error)return Response.json({ok:false},{status:502});
 const saved=await client.from("listing_photos").insert({listing_id:id.data,storage_path:path,sha256:createHash("sha256").update(bytes).digest("hex")});
 if(saved.error){await supabaseAdmin().storage.from("listing-photos").remove([path]);return Response.json({ok:false},{status:502});}
 revalidatePath(`/listing/${id.data}`);revalidatePath("/sell");
 return Response.json({ok:true});
}
