"use client";
import Link from "next/link";
import { useCallback, useState } from "react";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { backendText } from "@/i18n/backend";
import type { Profile } from "@/lib/types";
export function NotificationBell({userId,locale}:{userId:string;locale:Profile["locale"]}) {
 const [count,setCount]=useState<number|null>(null);const t=backendText(locale);
 const refresh=useCallback(async()=>{const {count,error}=await supabaseBrowser().from("notifications").select("id",{count:"exact",head:true}).eq("user_id",userId).is("read_at",null);if(!error)setCount(count??0);},[userId]);
 useRealtime("notifications",`user_id=eq.${userId}`,refresh,refresh);
 return <Link href="/notifications" className="btn btn-secondary" aria-label={`${t.notifications}${count===null?"":` (${count})`}`}><span aria-hidden="true">♧</span><span>{count??"…"}</span></Link>;
}
