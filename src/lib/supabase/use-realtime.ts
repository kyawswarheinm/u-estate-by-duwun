"use client";
import { useEffect, useState } from "react";
import type { AuthChangeEvent, RealtimeChannel, RealtimePostgresChangesPayload, Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "./browser";
import { supabaseConfigured } from "./env";
type Change = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown>; old: Record<string, unknown> };
/**
 * Live updates for one table (RLS applies: users only receive rows they may read).
 * The user's access token is loaded and handed to Realtime BEFORE subscribing. Without this the channel
 * can join as the anonymous role (session not yet read from the cookie) and members-only rows such as
 * messages and notifications are silently filtered out. After subscribing, persisted state is reloaded
 * to cover reconnect gaps.
 */
export function useRealtime(table: string, filter: string | undefined, onChange: (change: Change) => void, onReady?: () => void) {
 const [status,setStatus]=useState<"connecting"|"live"|"retrying">("connecting");
 useEffect(()=>{
  if(!supabaseConfigured())return;
  const client=supabaseBrowser();let active=true;let channel:RealtimeChannel|null=null;
  void (async()=>{
   const {data:{session}}=await client.auth.getSession();
   if(!active)return;
   if(session?.access_token)await client.realtime.setAuth(session.access_token);
   if(!active)return;
   channel=client.channel(`rt:${table}:${crypto.randomUUID()}`,{config:{postgres_changes_options:{wait:true}}})
    .on("postgres_changes",{event:"*",schema:"public",table,...(filter?{filter}:{})},(payload:RealtimePostgresChangesPayload<Record<string,unknown>>)=>{
     if(active)onChange({eventType:payload.eventType,new:payload.new as Record<string,unknown>,old:payload.old as Record<string,unknown>});
    }).subscribe((state: string)=>{
     if(!active)return;
     setStatus(state==="SUBSCRIBED"?"live":"retrying");
     if(state==="SUBSCRIBED")onReady?.();
    });
  })();
  // Keep the token current when Supabase refreshes the session.
  const {data:{subscription}}=client.auth.onAuthStateChange((event:AuthChangeEvent,session:Session|null)=>{
   if(session?.access_token&&(event==="TOKEN_REFRESHED"||event==="SIGNED_IN"))void client.realtime.setAuth(session.access_token);
  });
  const refresh=()=>onReady?.();window.addEventListener("focus",refresh);
  // Reconcile persisted data even after a missed websocket event or a suspended tab.
  const timer=window.setInterval(refresh,30000);
  return ()=>{active=false;subscription.unsubscribe();clearInterval(timer);window.removeEventListener("focus",refresh);if(channel)void client.removeChannel(channel);};
 },[table,filter,onChange,onReady]);
 return status;
}
