import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./env";

/**
 * Service-role client: BYPASSES RLS. Server-only, for the few trusted jobs that need it:
 * seeding, AI write-backs (translations, deed-check results, valuations), the Avalanche anchor job,
 * and one-click demo persona sign-in. Never import this from a client component.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!SUPABASE_URL || !key) throw new Error("Supabase service role is not configured");
  return createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
