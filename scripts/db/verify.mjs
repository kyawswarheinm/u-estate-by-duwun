// Verifies the Supabase migrations WITHOUT a Supabase project or Docker: runs them in PGlite (Postgres in WebAssembly)
// with small stand-ins for Supabase's auth/storage schemas, seeds the demo data, then tests RLS and the business rules
// as real database roles (anon / authenticated). Run: npm run db:verify
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { BUILDINGS, LISTINGS, OFFERS, OFFER_ROUNDS, PERSONAS, PROPERTIES, id } from "./demo-data.mjs";

const db = new PGlite();
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail });

// ---------- Supabase stand-ins (on a real project these already exist) ----------
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, metadata jsonb, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select on storage.buckets to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.objects to anon;
  grant execute on function storage.foldername(text) to anon, authenticated;
  create publication supabase_realtime;
`);

// ---------- migrations ----------
const dir = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const f of files) {
  try {
    await db.exec(readFileSync(new URL(f, dir), "utf8"));
    check(`migration ${f}`, true);
  } catch (e) {
    check(`migration ${f}`, false, e.message);
    report();
  }
}

// ---------- seed (as the database owner, like seed-supabase.mjs does with the service role) ----------
const P = Object.fromEntries(PERSONAS.map((p) => [p.key, p.id]));
for (const p of PERSONAS) {
  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [p.id, p.email, JSON.stringify({ name: p.name, nationality: p.nationality, locale: p.locale })]);
  await db.query("update public.profiles set utopia_member = $2, is_reviewer = $3, is_demo_persona = true where id = $1", [p.id, p.member, Boolean(p.reviewer)]);
}
const insert = async (table, row) => {
  const cols = Object.keys(row);
  await db.query(`insert into public.${table} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, cols.map((c) => (typeof row[c] === "object" && row[c] !== null ? JSON.stringify(row[c]) : row[c])));
};
for (const b of BUILDINGS) await insert("buildings", b);
for (const p of PROPERTIES) await insert("properties", p);
for (const l of LISTINGS) await insert("listings", l);
for (const { hoursOpen, ...r } of OFFER_ROUNDS) await insert("offer_rounds", { ...r, closes_at: new Date(Date.now() + hoursOpen * 3600_000).toISOString() });
for (const o of OFFERS) await insert("offers", o);
check("seed demo data (8 personas, 3 listings, 1 offer round, 2 offers)", (await db.query("select count(*)::int c from public.profiles")).rows[0].c === 8);

// ---------- role helpers ----------
const as = async (uid, fn) => {
  await db.exec(uid ? "set role authenticated" : "set role anon");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const fails = async (fn, code) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return code ? e.message.includes(code) : true;
  }
};
const CONDO = id(401), HOUSE = id(402), ROUND = id(501);

// ---------- public data and private data ----------
await as(null, async () => {
  check("guest can read listings", (await q("select id from listings")).length === 3);
  check("guest cannot read wallets", (await q("select id from wallet_transactions")).length === 0);
  check("guest cannot read private settings", (await q("select user_id from profile_settings")).length === 0);
  check("guest cannot read sealed offers", (await q("select id from offers")).length === 0);
  check("guest sees the number of sealed offers", (await one("select offer_count($1) as n", [ROUND])).n === 2);
});
await as(P.somchai, async () => {
  check("member sees only own wallet rows", (await q("select user_id from wallet_transactions")).every((r) => r.user_id === P.somchai));
  check("wallet balance view = 5,000,000 test money", Number((await one("select available_thb from wallet_balances")).available_thb) === 5000000);

  check("can edit own display name", (await q("update profiles set display_name = 'Somchai T.' where id = $1 returning id", [P.somchai])).length === 1);
  check("cannot write the ledger directly", await fails(() => q("insert into ledger_entries (entry_type, details) values ('loan', 'fake')")));
  check("cannot read another user's private settings", (await q("select user_id from profile_settings where user_id = $1", [P.malee])).length === 0);
});

await as(P.narin, async () => {
  check("cannot make self a U-topia member", await fails(() => q("update profiles set utopia_member = true where id = $1", [P.narin]), "PROTECTED_FIELD"));
  check("cannot make self a reviewer", await fails(() => q("update profiles set is_reviewer = true where id = $1", [P.narin]), "PROTECTED_FIELD"));
});
check("demo personas keep their nationality", await fails(() => as(P.daniel, () => q("update profiles set nationality = 'Thai' where id = $1", [P.daniel])), "PERSONA_FIXED"));

// ---------- co-buy rules (condo: mixed Thai + foreign co-owners) ----------
check("non-member cannot start a co-buy group", await fails(() => as(P.narin, () => q("select cobuy_create_group($1)", [CONDO])), "MEMBERS_ONLY"));
const condoGroup = (await as(P.somchai, () => one("select cobuy_create_group($1) as g", [CONDO]))).g;
check("member starts a condo co-buy group", Boolean(condoGroup));
await as(P.somchai, () => q("select cobuy_commit($1, 'co_owner', 1000000)", [condoGroup]));
const daniel = await as(P.daniel, () => one("select cobuy_commit($1, 'co_owner', 1000000) as r", [condoGroup]));
check("foreign member co-owns a condo within quota, FET flagged", daniel.r.fet_required === true);
check("condo has no lender lane", await fails(() => as(P.layla, () => q("select cobuy_commit($1, 'lender', 500000, 7)", [condoGroup])), "CONDO_NO_LENDER"));
check("cannot join the same group twice", await fails(() => as(P.somchai, () => q("select cobuy_commit($1, 'co_owner', 100000)", [condoGroup])), "ALREADY_JOINED"));
await as(P.ploy, () => q("select cobuy_commit($1, 'co_owner', 1000000)", [condoGroup]));
const last = await as(P.aiko, () => one("select cobuy_commit($1, 'co_owner', 1000000) as r", [condoGroup]));
check("group becomes funded at the target", last.r.funded === true);
check("funded → 4 registered co-owner shares on the ledger", (await q("select id from ledger_entries where entry_type = 'co_owner_share' and group_id = $1", [condoGroup])).length === 4);
check("participants are notified live", (await as(P.somchai, () => q("select id from notifications where kind = 'cobuy_funded'"))).length === 1);

// ---------- co-buy rules (house: Thai owners, foreign lenders only) ----------
const houseGroup = (await as(P.somchai, () => one("select cobuy_create_group($1) as g", [HOUSE]))).g;
check("foreigner cannot co-own land", await fails(() => as(P.daniel, () => q("select cobuy_commit($1, 'co_owner', 1000000)", [houseGroup])), "FOREIGN_LAND"));
check("lender rate above 15% blocked", await fails(() => as(P.daniel, () => q("select cobuy_commit($1, 'lender', 1000000, 16)", [houseGroup])), "RATE_INVALID"));
check("foreign lender at 7% fixed allowed", (await as(P.daniel, () => one("select cobuy_commit($1, 'lender', 1000000, 7) as r", [houseGroup]))).r.ok === true);
await as(P.layla, () => q("update profile_settings set max_commit_thb = 500000 where user_id = $1", [P.layla]));
check("wallet per-commitment limit enforced", await fails(() => as(P.layla, () => q("select cobuy_commit($1, 'lender', 1000000, 7)", [houseGroup])), "WALLET_LIMIT"));
check("wallet balance enforced", await fails(() => as(P.ploy, () => q("select cobuy_commit($1, 'co_owner', 4500000)", [houseGroup])), "WALLET_BALANCE"));
check("ledger is append-only (even for the owner)", await fails(() => q("update ledger_entries set details = 'edited'"), "APPEND_ONLY"));

// ---------- FairOffer: sealed bids ----------
await as(P.ploy, async () => check("buyer sees only their own offer", (await q("select buyer_id from offers")).every((r) => r.buyer_id === P.ploy)));
await as(P.malee, async () => {
  check("seller cannot see amounts while the round is open", (await q("select id from offers")).length === 0);
  check("seller cannot bid on own listing", await fails(() => q("select offer_submit($1, 4100000, 'cash', 30, '')", [ROUND]), "OWN_LISTING"));
});
await as(P.somchai, () => q("select offer_submit($1, 3950000, 'proof_uploaded', 45, '', gen_random_uuid())", [ROUND]));
check("sealed offer leaves no amount on the public ledger", (await q("select amount_thb from ledger_entries where entry_type = 'offer_submitted'")).every((r) => r.amount_thb === null));
check("only the seller can close the round", await fails(() => as(P.narin, () => q("select offer_close_round($1)", [ROUND])), "NOT_OWNER"));
await as(P.malee, async () => {
  await q("select offer_close_round($1)", [ROUND]);
  check("seller sees all offers after closing", (await q("select id from offers")).length === 3);
  await q("select offer_accept($1)", [id(602)]);
});
check("accepting sets the listing under offer", (await one("select status from listings where id = $1", [CONDO])).status === "under_offer");
check("accepted amount recorded on the ledger", Number((await one("select amount_thb from ledger_entries where entry_type = 'offer_accepted'")).amount_thb) === 4050000);
check("criteria are locked after publication", await fails(() => q("update offer_rounds set criteria = '[]'::jsonb"), "CRITERIA_LOCKED"));

// ---------- communication ----------
const conv = (await as(P.narin, () => one("select conversation_start($1, 'สวัสดีครับ ขอนัดดูห้องได้ไหมครับ') as c", [CONDO]))).c;
check("buyer starts a conversation with the seller", Boolean(conv));
await as(P.malee, async () => {
  check("seller receives the message", (await q("select id from messages where conversation_id = $1", [conv])).length === 1);
  check("seller gets a live notification", (await q("select id from notifications where kind = 'message'")).length === 1);
  await q("insert into messages (conversation_id, body_original) values ($1, 'ได้ค่ะ พรุ่งนี้บ่ายสองโมง')", [conv]);
});
await as(P.somchai, async () => {
  check("outsiders cannot read the conversation", (await q("select id from messages where conversation_id = $1", [conv])).length === 0);
  check("outsiders cannot post into the conversation", await fails(() => q("insert into messages (conversation_id, body_original) values ($1, 'hi')", [conv])));
});
check("clients cannot forge translations", await fails(() => as(P.narin, () => q("insert into messages (conversation_id, body_original, translations) values ($1, 'x', '{\"en\":\"y\"}')", [conv]))));

// ---------- accounts and seller uploads ----------
const newUser = id(900);
await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'anythings@example.com', $2)", [newUser, JSON.stringify({ name: "Any Things", nationality: "Thai" })]);
check("sign-up creates a profile with ฿5,000,000 test money", Number((await as(newUser, () => one("select available_thb from wallet_balances"))).available_thb) === 5000000);
const myListing = (await as(newUser, () => one("select listing_create('sale', 'townhouse', '3-bed townhouse near MRT, Huai Khwang', 'Huai Khwang', 'Bangkok', 120, 4250000) as l"))).l;
check("owner lists a property", Boolean(myListing));
await as(null, async () => check("new listing is public", (await q("select id from listings where id = $1", [myListing])).length === 1));
await as(P.somchai, async () => check("others cannot edit it", (await q("update listings set asking_price_thb = 1 where id = $1 returning id", [myListing])).length === 0));
check("owner cannot self-verify the deed badge", await fails(() => as(newUser, () => q("update listings set verification_status = 'verified_sample' where id = $1", [myListing])), "PROTECTED_FIELD"));
await as(newUser, async () => {
  await q("insert into storage.objects (bucket_id, name, owner) values ('listing-photos', $1, $2)", [`${newUser}/${myListing}/front.jpg`, newUser]);
  await q("insert into listing_photos (listing_id, storage_path) values ($1, $2)", [myListing, `${newUser}/${myListing}/front.jpg`]);
  check("seller uploads a photo to their own folder", true);
  check("seller cannot upload into someone else's folder", await fails(() => q("insert into storage.objects (bucket_id, name) values ('listing-photos', $1)", [`${P.malee}/${myListing}/x.jpg`])));
  await q("insert into storage.objects (bucket_id, name, owner) values ('deeds', $1, $2)", [`${newUser}/${myListing}/deed.png`, newUser]);
});
await as(P.somchai, async () => check("deeds are private", (await q("select id from storage.objects where bucket_id = 'deeds'")).length === 0));
await as(null, async () => check("listing photos are public", (await q("select id from storage.objects where bucket_id = 'listing-photos'")).length === 1));
check("demo membership link works for new accounts", (await as(newUser, () => one("select demo_toggle_membership() as m"))).m === true);
check("demo personas keep fixed membership", await fails(() => as(P.somchai, () => q("select demo_toggle_membership()")), "NOT_ALLOWED"));
await as(newUser, () => q("select wallet_top_up()"));
check("test-money top-up", Number((await as(newUser, () => one("select funded_thb from wallet_balances"))).funded_thb) === 6000000);

// ---------- realtime ----------
const pub = (await q("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")).map((r) => r.tablename);
check("realtime streams messages, notifications, listings, co-buy and ledger", ["messages", "notifications", "listings", "cobuy_participants", "ledger_entries"].every((t) => pub.includes(t)));
check("realtime never streams sealed offers", !pub.includes("offers"));
check("RLS is on for every public table", (await q("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")).length === 0);

report();

function report() {
  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `  →  ${r.detail || "failed"}`}`);
  console.log(`\n${results.length - bad.length}/${results.length} database checks passed.`);
  process.exit(bad.length ? 1 : 0);
}
