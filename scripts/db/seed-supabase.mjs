// Seeds a real Supabase project with the demo personas, properties, listings and the FairOffer round.
//   1. Apply the migrations first (Supabase dashboard SQL editor, or `npx supabase db push`).
//   2. Put NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local (never commit it).
//   3. npm run db:seed        (safe to re-run: everything is upserted by fixed id)
// Personas get a random password that is never printed or stored: the app signs them in with the
// server-only admin API (one-click demo personas), so no demo password exists anywhere.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { BUILDINGS, LISTINGS, OFFERS, OFFER_ROUNDS, PERSONAS, PROPERTIES } from "./demo-data.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const must = (label) => ({ error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

// 1. Persona accounts (fixed ids; made-up example.com emails)
const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw listError;
for (const p of PERSONAS) {
  if (existing.users.some((u) => u.id === p.id)) continue;
  const { error } = await admin.auth.admin.createUser({
    id: p.id,
    email: p.email,
    email_confirm: true,
    password: randomBytes(24).toString("base64url"), // unusable by people; personas sign in via the server
    user_metadata: { name: p.name, nationality: p.nationality, locale: p.locale },
  });
  if (error) throw new Error(`create ${p.email}: ${error.message}`);
}
for (const p of PERSONAS) {
  must(`profile ${p.key}`)(await admin.from("profiles").update({ utopia_member: p.member, is_reviewer: Boolean(p.reviewer), is_demo_persona: true }).eq("id", p.id));
}

// 2. Property data (owner ids point at Khun Malee)
must("buildings")(await admin.from("buildings").upsert(BUILDINGS));
must("properties")(await admin.from("properties").upsert(PROPERTIES));
must("listings")(await admin.from("listings").upsert(LISTINGS));
must("offer_rounds")(await admin.from("offer_rounds").upsert(OFFER_ROUNDS.map(({ hoursOpen, ...r }) => ({ ...r, closes_at: new Date(Date.now() + hoursOpen * 3600_000).toISOString() })), { onConflict: "id", ignoreDuplicates: true }));
must("offers")(await admin.from("offers").upsert(OFFERS, { onConflict: "id", ignoreDuplicates: true }));

console.log(`Seeded ${PERSONAS.length} personas, ${PROPERTIES.length} properties, ${LISTINGS.length} listings, ${OFFERS.length} sealed offers.`);
