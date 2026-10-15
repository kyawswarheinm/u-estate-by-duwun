// Hosted read-only authorization checks against seeded demo personas.
// Generates sign-in links without sending email, uses isolated sessions, then signs them out.
// Does not reset data, close rounds, submit offers or modify user profiles.
import { createClient } from "@supabase/supabase-js";
import { PERSONAS } from "./demo-data.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const sessions = [];
let passed = 0;
let failed = 0;
const check = (name, ok) => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
};
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(15000) }) } };
try {
  if (!url || !key || !secret) throw new Error("configuration");
  const admin = createClient(url, secret, options);
  const guest = createClient(url, key, options);
  const activeCondo = await admin.from("listings").select("id").eq("code", "l-condo").single();
  if(activeCondo.error)throw new Error("Missing demo alias");
  const activeRound = await admin.from("offer_rounds").select("id").eq("listing_id", activeCondo.data.id).single();
  if(activeRound.error)throw new Error("Missing demo round");
  const roundId = activeRound.data.id;
  const round = await admin.from("offer_rounds").select("status").eq("id", roundId).single();
  if (round.error || round.data.status !== "open") throw new Error("Expected open seeded round; do not reset shared data automatically");
  const profiles = await admin.from("profiles").select("id,is_demo_persona").in("id", PERSONAS.map((p) => p.id));
  check("Eight seeded personas exist", !profiles.error && profiles.data?.length === 8 && profiles.data.every((p) => p.is_demo_persona));
  const listings = await guest.from("listings").select("id").in("code", ["l-condo", "l-house", "l-condo2"]);
  check("Guest reads three seeded listings", !listings.error && listings.data?.length === 3);
  const sealed = await guest.from("offers").select("id").eq("round_id", roundId);
  check("Guest cannot read sealed offers", !sealed.error && sealed.data?.length === 0);
  const ledger = await guest.from("ledger_entries").select("amount_thb").eq("entry_type", "offer_submitted");
  check("Public submitted-offer ledger rows contain no amounts (may be empty)", !ledger.error && ledger.data?.every((r) => r.amount_thb === null));
  for (const name of ["malee", "ploy", "narin", "somchai"]) {
    const persona = PERSONAS.find((p) => p.key === name);
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email: persona.email });
    if (link.error || !link.data?.properties?.hashed_token) throw new Error("Persona link failed");
    const client = createClient(url, key, options);
    sessions.push(client);
    const login = await client.auth.verifyOtp({ type: "email", token_hash: link.data.properties.hashed_token });
    check(`${name}: authenticated persona identity`, !login.error && login.data.user?.id === persona.id);
    if (login.error) continue;
    const offers = await client.from("offers").select("buyer_id").eq("round_id", roundId);
    const expected = ["ploy", "narin"].includes(name) ? 1 : 0;
    check(`${name}: sealed-offer isolation`, !offers.error && offers.data?.length === expected && offers.data.every((o) => o.buyer_id === persona.id));
    const wallet = await client.from("wallet_transactions").select("user_id");
    check(`${name}: reads own wallet only`, !wallet.error && wallet.data?.length > 0 && wallet.data.every((w) => w.user_id === persona.id));
    const settings = await client.from("profile_settings").select("user_id");
    check(`${name}: reads own settings only`, !settings.error && settings.data?.length === 1 && settings.data[0].user_id === persona.id);
    const refreshed = await client.auth.refreshSession();
    check(`${name}: refresh session preserves identity`, !refreshed.error && refreshed.data.user?.id === persona.id);
  }
} catch {
  check("Hosted checks completed (check config, seed and open-round prerequisites; details suppressed)", false);
} finally {
  for (const client of sessions) {
    try {
      const result = await client.auth.signOut({ scope: "local" });
      check("Test session signed out", !result.error);
    } catch { check("Test session signed out", false); }
  }
}
console.log(`${passed} passed; ${failed} failed. Concurrency, Storage writes, realtime and app wiring require separate tests.`);
process.exitCode = failed ? 1 : 0;
