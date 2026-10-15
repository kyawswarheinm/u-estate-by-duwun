// Read-only hosted checks. Never prints configuration, users, tokens or error bodies.
// Run: node --env-file=.env.local scripts/db/preflight.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
let failed = 0;
function report(label, ok, code) {
  if (!ok) failed++;
  const safeCode = typeof code === "string" && /^[A-Za-z0-9_]+$/.test(code) ? ` (${code})` : "";
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${safeCode}`);
}
try {
  if (!url || !publicKey || !secret) throw new Error("configuration");
  const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } };
  const admin = createClient(url, secret, options);
  const guest = createClient(url, publicKey, options);
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  report("Admin Auth connection", !users.error && Array.isArray(users.data?.users), users.error?.code);
  for (const table of ["profiles", "profile_settings", "listings", "offer_rounds", "offers", "cobuy_groups", "cobuy_participants", "wallet_transactions", "messages", "notifications", "ledger_entries", "ledger_anchors"]) {
    const result = await admin.from(table).select("*").limit(1);
    report(`Schema table: ${table}`, !result.error && Array.isArray(result.data), result.error?.code);
  }
  const listings = await guest.from("listings").select("id").limit(1);
  report("Public listings API", !listings.error && Array.isArray(listings.data), listings.error?.code);
  for (const table of ["offers", "wallet_transactions", "profile_settings", "messages"]) {
    const result = await guest.from(table).select("*").limit(1);
    report(`Guest sees no private rows: ${table}`, !result.error && Array.isArray(result.data) && result.data.length === 0, result.error?.code);
  }
  const buckets = await admin.storage.listBuckets();
  report("Public photos bucket", !buckets.error && buckets.data?.some((b) => b.id === "listing-photos" && b.public === true));
  report("Private deeds bucket", !buckets.error && buckets.data?.some((b) => b.id === "deeds" && b.public === false));
} catch {
  report("Configuration or connection (details suppressed)", false);
}
console.log(failed ? `${failed} checks failed; do not seed until schema checks pass.` : "Preflight passed. This does not certify application wiring or realtime delivery.");
process.exitCode = failed ? 1 : 0;
