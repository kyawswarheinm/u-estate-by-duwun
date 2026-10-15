// Supabase is configured when the public URL and publishable/anon key are set.
// NEXT_PUBLIC_* values are visible in the browser by design; RLS (supabase/migrations) protects the data.
// The service-role key is server-only and is never prefixed with NEXT_PUBLIC_.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export function supabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
