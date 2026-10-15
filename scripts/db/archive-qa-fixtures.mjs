// Hides QA test listings (title starting "QA ", created by QA test accounts, never by demo personas)
// from the public site by archiving them. Nothing is deleted: offers, co-buy groups and ledger history
// stay queryable for audit, and archiving is reversible (set archived_at back to null).
//   node --env-file=.env.local scripts/db/archive-qa-fixtures.mjs            (dry run: counts only)
//   node --env-file=.env.local scripts/db/archive-qa-fixtures.mjs --apply
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return fail("Missing Supabase configuration in .env.local");
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin
    .from("listings")
    .select("id,properties!inner(title),profiles!listings_seller_id_fkey!inner(is_demo_persona)")
    .like("properties.title", "QA %")
    .eq("profiles.is_demo_persona", false)
    .is("archived_at", null)
    .limit(5000);
  if (error) return fail("Could not read listings.");
  console.log(`${data.length} visible QA listing(s).`);
  if (!process.argv.includes("--apply") || data.length === 0) return;
  const r = await admin.from("listings").update({ archived_at: new Date().toISOString() }).in("id", data.map((l) => l.id));
  if (r.error) return fail("Archive failed.");
  console.log(`Archived ${data.length} QA listing(s). The three demo listings and real users' listings are untouched.`);
}
function fail(message) {
  console.error(message);
  process.exitCode = 1;
}
await main();
