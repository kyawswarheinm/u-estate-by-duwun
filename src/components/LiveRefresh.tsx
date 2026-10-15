"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/lib/supabase/use-realtime";
import { backendText } from "@/i18n/backend";
import type { Profile } from "@/lib/types";
export function LiveRefresh({table,filter,locale}:{table:string;filter?:string;locale:Profile["locale"]}) {
 const router=useRouter();const refresh=useCallback(()=>router.refresh(),[router]);
 const status=useRealtime(table,filter,refresh,refresh);const t=backendText(locale);
 return <p role="status" className="text-sm text-deep">{status==="live"?t.live:status==="connecting"?t.connecting:t.reconnecting}</p>;
}
