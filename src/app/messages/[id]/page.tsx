import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { usesSupabase } from "@/lib/db/runtime";
import { backendText } from "@/i18n/backend";
import { MessageComposer } from "@/components/MessageComposer";
import { LiveRefresh } from "@/components/LiveRefresh";
import { markThreadRead } from "../actions";
export default async function ThreadPage({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;const me=await requireUser(`/messages/${id}`);const t=backendText(me.locale);
 if(!usesSupabase())return <p>{t.offline}</p>;
 if(!z.uuid().safeParse(id).success)notFound();
 const client=await supabaseServer();const {data:thread,error}=await client.from("conversations").select("id,listing_id").eq("id",id).maybeSingle();
 if(error)throw new Error("Conversation unavailable.");if(!thread)notFound();
 const {data:messages,error:messageError}=await client.from("messages").select("id,sender_id,body_original,lang_original,created_at").eq("conversation_id",id).order("created_at",{ascending:false}).order("id").limit(100);
 if(messageError)throw new Error("Messages unavailable.");
 return <section dir={me.locale==="ar"?"rtl":undefined} className="mx-auto grid max-w-3xl gap-4"><Link href="/messages" className="underline">{t.back}</Link><h1 className="text-3xl font-bold">{t.messages}</h1><Link href={`/listing/${thread.listing_id}`} className="underline">{t.listing}</Link>
 <LiveRefresh table="messages" filter={`conversation_id=eq.${id}`} locale={me.locale}/>
 <p className="text-sm text-deep">{t.recent}</p><ol className="grid gap-3">{messages?.toReversed().map(m=><li key={m.id} className={`panel max-w-[90%] whitespace-pre-wrap break-words p-4 ${m.sender_id===me.id?"ms-auto bg-ice":"me-auto"}`}><p lang={m.lang_original??undefined} dir="auto">{m.body_original}</p><p className="mt-2 text-xs text-deep">{t.original} · {new Date(m.created_at).toLocaleString(me.locale??"en")}</p></li>)}</ol>
 <form action={markThreadRead}><input type="hidden" name="conversationId" value={id}/><button className="btn btn-secondary">{t.read}</button></form>
 <MessageComposer id={id} requestId={randomUUID()} locale={me.locale}/></section>;
}
