"use client";

import { useEffect } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabaseBrowser } from "./browser";
import { supabaseConfigured } from "./env";

type Change = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: Record<string, unknown>; old: Record<string, unknown> };

/**
 * Live updates for one table (RLS applies: users only receive rows they may read).
 * Example: useRealtime("messages", `conversation_id=eq.${id}`, (c) => setMessages((m) => [...m, c.new]));
 * Published tables: see supabase/migrations/*_realtime_storage.sql.
 */
export function useRealtime(table: string, filter: string | undefined, onChange: (change: Change) => void) {
  useEffect(() => {
    if (!supabaseConfigured()) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`rt:${table}:${filter ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) =>
        onChange({ eventType: payload.eventType, new: payload.new as Record<string, unknown>, old: payload.old as Record<string, unknown> }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // onChange is intentionally excluded: pass a stable callback (useCallback) to avoid resubscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter]);
}
