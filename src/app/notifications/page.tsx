import Link from "next/link";
import { requireUser } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { usesSupabase } from "@/lib/db/runtime";
import { backendText } from "@/i18n/backend";
import { markNotificationsRead } from "@/app/messages/actions";
import { LiveRefresh } from "@/components/LiveRefresh";
export default async function NotificationsPage() {
 const me=await requireUser("/notifications");const t=backendText(me.locale);
 if(!usesSupabase())return <p>{t.offline}</p>;
 const {data,error}=await (await supabaseServer()).from("notifications").select("id,title,body,link,read_at").order("created_at",{ascending:false}).limit(100);
 if(error)throw new Error("Notifications unavailable.");
 return <section dir={me.locale==="ar"?"rtl":undefined} className="grid gap-4"><h1 className="page-title">{t.notifications}</h1><LiveRefresh table="notifications" filter={`user_id=eq.${me.id}`} locale={me.locale}/><form action={markNotificationsRead}><button className="btn btn-secondary">{t.markAll}</button></form>
 {!data?.length&&<p>{t.noNotifications}</p>}<ul className="grid gap-3">{data?.map(n=><li className="panel p-4" key={n.id}><p className="font-bold">{n.title} {!n.read_at&&<span className="pill">{t.unread}</span>}</p><p>{n.body}</p>{n.link?.startsWith("/")&&!n.link.startsWith("//")&&<Link className="underline" href={n.link}>{t.read}</Link>}</li>)}</ul></section>;
}
