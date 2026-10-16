import Link from "next/link";
import { requireUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { usesSupabase } from "@/lib/db/runtime";
import { backendText } from "@/i18n/backend";
import { LiveRefresh } from "@/components/LiveRefresh";
export default async function MessagesPage() {
 const me=await requireUser("/messages");const t=backendText(me.locale);
 if(!usesSupabase())return <p>{t.offline}</p>;
 const client=await supabaseServer();
 const [{data:threads,error},{data:members}]=await Promise.all([
  client.from("conversations").select("id,listing_id,last_message_at").order("last_message_at",{ascending:false}).limit(100),
  client.from("conversation_members").select("conversation_id,last_read_at").eq("user_id",me.id)]);
 if(error)throw new Error("Conversations unavailable.");
 return <section dir={me.locale==="ar"?"rtl":undefined} className="grid gap-4"><h1 className="page-title">{t.messages}</h1>
 <LiveRefresh table="conversations" locale={me.locale}/>
 {!threads?.length&&<p>{t.empty}</p>}
 <ul className="grid gap-3">{threads?.map(c=>{const read=members?.find(m=>m.conversation_id===c.id)?.last_read_at;return <li key={c.id} className="panel p-4"><Link href={`/messages/${c.id}`} className="underline">{t.message} · {c.listing_id.slice(0,8)}</Link>{(!read||read<c.last_message_at)&&<span className="pill ms-3">{t.unread}</span>}</li>;})}</ul></section>;
}
