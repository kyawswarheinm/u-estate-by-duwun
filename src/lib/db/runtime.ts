import "server-only";
import { supabaseConfigured } from "@/lib/supabase/env";

export function usesSupabase() {
  return process.env.DEMO_OFFLINE !== "true" && supabaseConfigured();
}
