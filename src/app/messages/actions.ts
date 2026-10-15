"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { usesSupabase } from "@/lib/db/runtime";
import { backendText } from "@/i18n/backend";

export async function startConversation(form: FormData) {
  await requireUser("/messages");
  if (!usesSupabase()) redirect("/messages");
  const id = z.uuid().parse(form.get("listingId"));
  const { data, error } = await (await supabaseServer()).rpc("conversation_start", { p_listing: id, p_body: "" });
  if (error) throw new Error("Conversation unavailable.");
  redirect(`/messages/${data}`);
}
export async function sendMessage(_previous: {ok: boolean; message: string} | null, form: FormData) {
  const me = await requireUser("/messages");
  const t = backendText(me.locale);
  const parsed = z.object({ id: z.uuid(), body: z.string().trim().min(1).max(2000), request: z.uuid() }).safeParse({id: form.get("conversationId"), body: form.get("body"), request: form.get("requestId")});
  if (!parsed.success || !usesSupabase()) return {ok: false, message: t.failed};
  const client = await supabaseServer();
  // A stable message UUID makes transport retries safe without duplicating notifications.
  const { error } = await client.from("messages").insert({id: parsed.data.request, conversation_id: parsed.data.id, sender_id: me.id, body_original: parsed.data.body, lang_original: me.locale ?? "en"});
  if (error) {
    const {data: old} = await client.from("messages").select("sender_id,conversation_id,body_original").eq("id",parsed.data.request).maybeSingle();
    if (!old || old.sender_id !== me.id || old.conversation_id !== parsed.data.id || old.body_original !== parsed.data.body) return {ok:false,message:t.failed};
  }
  revalidatePath(`/messages/${parsed.data.id}`);
  revalidatePath("/messages");
  return {ok:true,message:t.sent};
}
export async function markThreadRead(form: FormData) {
  await requireUser("/messages");
  const id=z.uuid().parse(form.get("conversationId"));
  const {error}=await (await supabaseServer()).rpc("conversation_mark_read",{p_conversation:id});
  if(error)throw new Error("Could not mark conversation read.");
  revalidatePath(`/messages/${id}`);revalidatePath("/messages");
}
export async function markNotificationsRead() {
  await requireUser("/notifications");
  const {error}=await (await supabaseServer()).rpc("notifications_mark_read");
  if(error)throw new Error("Could not mark notifications read.");
  revalidatePath("/notifications");
}
