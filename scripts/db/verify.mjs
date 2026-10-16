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
check("seed demo data (8 personas, demo listings, 1 offer round, 2 offers)", (await db.query("select count(*)::int c from public.profiles")).rows[0].c === 8);

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
  check("guest can read listings", (await q("select id from listings")).length === LISTINGS.length);
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
  check("cannot make self a U-topia member", await fails(() => q("update profiles set utopia_member = true where id = $1", [P.narin]), "permission denied"));
  check("cannot make self a reviewer", await fails(() => q("update profiles set is_reviewer = true where id = $1", [P.narin]), "permission denied"));
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
check("owner cannot self-verify the deed badge", await fails(() => as(newUser, () => q("update listings set verification_status = 'verified_sample' where id = $1", [myListing])), "permission denied"));
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

// ---------- Person 1: rejection paths and transaction rollback ----------
check("guest cannot call co-buy RPC", await fails(() => as(null, () => q("select cobuy_commit($1, 'co_owner', 10000)", [houseGroup]))));
check("funded group rejects further commitments", await fails(() => as(P.layla, () => q("select cobuy_commit($1, 'co_owner', 10000)", [condoGroup])), "GROUP_CLOSED"));
check("zero lender interest rejected", await fails(() => as(P.aiko, () => q("select cobuy_commit($1, 'lender', 10000, 0)", [houseGroup])), "RATE_INVALID"));
check("negative commitment rejected", await fails(() => as(P.aiko, () => q("select cobuy_commit($1, 'lender', -1, 7)", [houseGroup])), "AMOUNT_INVALID"));
check("exactly 15 percent lender interest accepted", (await as(P.aiko, () => one("select cobuy_commit($1, 'lender', 10000, 15) as r", [houseGroup]))).r.ok === true);
check("closed offer round rejects submissions", await fails(() => as(P.narin, () => q("select offer_submit($1, 4000000, 'cash', 30, '')", [ROUND])), "ROUND_CLOSED"));
check("unrelated user cannot accept an offer", await fails(() => as(P.narin, () => q("select offer_accept($1)", [id(602)])), "NOT_OWNER"));

// Force a ledger uniqueness failure after participant insertion; the whole RPC must roll back.
const usedRequest = id(950);
await as(P.layla, () => q("select cobuy_commit($1, 'lender', 10000, 7, $2)", [houseGroup, usedRequest]));
const snapshot = async () => one(`select
  (select count(*)::int from cobuy_participants) participants,
  (select count(*)::int from ledger_entries) ledger,
  (select count(*)::int from notifications) notifications`);
const beforeRollback = await snapshot();
check("reused request id rejects different actor", await fails(() => as(P.somchai, () => q("select cobuy_commit($1, 'co_owner', 10000, null, $2)", [houseGroup, usedRequest]))));
check("failed commit leaves no partial rows or notifications", JSON.stringify(await snapshot()) === JSON.stringify(beforeRollback));

await as(newUser, async () => {
  for (let i = 0; i < 14; i++) await q("select wallet_top_up()");
  check("wallet reaches exactly 20M cap", Number((await one("select funded_thb from wallet_balances")).funded_thb) === 20000000);
  check("wallet rejects top-up above cap", await fails(() => q("select wallet_top_up()"), "WALLET_CAP"));
});
await as(P.somchai, async () => {
  check("cannot modify another user's wallet settings", (await q("update profile_settings set max_commit_thb = 10000 where user_id = $1 returning user_id", [newUser])).length === 0);
  check("cannot mark another user's notifications read", (await q("update notifications set read_at = now() where user_id = $1 returning id", [P.malee])).length === 0);
});

// ---------- Exact retries and boundary regressions ----------
const receiptBefore = await snapshot();
const replay = await as(P.layla, () => one("select cobuy_commit($1,'lender',10000,7,$2) r", [houseGroup,usedRequest]));
check("exact co-buy retry returns original success without writes", replay.r.ok && JSON.stringify(await snapshot()) === JSON.stringify(receiptBefore));
check("same actor cannot reuse request with changed amount", await fails(() => as(P.layla, () => q("select cobuy_commit($1,'lender',11000,7,$2)", [houseGroup,usedRequest])), "REQUEST_MISMATCH"));
check("receipts cannot expose sealed payloads", await fails(() => as(P.layla, () => q("select * from mutation_receipts")), "permission denied"));
check("private receipt helper cannot be called directly", await fails(() => as(P.layla, () => q("select begin_mutation(gen_random_uuid(),'x','{}')")), "permission denied"));
check("users cannot grant themselves roles", await fails(() => as(newUser, () => q("update profiles set roles=ARRAY['reviewer'] where id=$1",[newUser])), "permission denied"));
check("clients cannot insert a forged verified listing", await fails(() => as(newUser, () => q("insert into listings(property_id,seller_id,kind,asking_price_thb,verification_status) select property_id,$1,'sale',100000,'verified_sample' from listings where id=$2",[newUser,myListing])), "permission denied"));
check("clients cannot forge deed extraction results", await fails(() => as(newUser, () => q("insert into documents(owner_id,storage_path,outcome) values($1,$2,'verified_sample')",[newUser,`${newUser}/fake.png`])), "permission denied"));
const retryUser=id(960);
await q("insert into auth.users(id,email) values($1,'retries@example.com')",[retryUser]);
await q("update profiles set utopia_member=true where id=$1",[retryUser]);
const topupRequest=id(961);
await as(retryUser,()=>q("select wallet_top_up($1)",[topupRequest]));
await as(retryUser,()=>q("select wallet_top_up($1)",[topupRequest]));
check("top-up retry gives test money only once", Number((await as(retryUser,()=>one("select funded_thb from wallet_balances"))).funded_thb)===6000000);
const boundaryListing=(await as(newUser,()=>one("select listing_create('sale','house','Boundary house','Bang Yai','Nonthaburi',100,100000,null,null,null,true) l"))).l;
const boundaryGroup=(await as(retryUser,()=>one("select cobuy_create_group($1) g",[boundaryListing]))).g;
check("one participant cannot fill entire group", await fails(()=>as(retryUser,()=>q("select cobuy_commit($1,'co_owner',100000)",[boundaryGroup])),"MIN_PARTICIPANTS"));
const boundaryRound=(await as(newUser,()=>one("select offer_open_round($1) r",[boundaryListing]))).r;
const offerRequest=id(962);
const offerArgs=[boundaryRound,offerRequest];
const offerId=(await as(retryUser,()=>one("select offer_submit($1,90000,'cash',30,'',$2) o",offerArgs))).o;
const offerSnapshot=await snapshot();
await as(retryUser,()=>q("select offer_submit($1,90000,'cash',30,'',$2)",offerArgs));
check("offer retry creates no extra ledger or notification",JSON.stringify(await snapshot())===JSON.stringify(offerSnapshot));
check("changed offer payload cannot reuse request",await fails(()=>as(retryUser,()=>q("select offer_submit($1,90001,'cash',30,'',$2)",offerArgs)),"REQUEST_MISMATCH"));
await as(newUser,()=>q("select offer_close_round($1)",[boundaryRound]));
const acceptRequest=id(963);
await as(newUser,()=>q("select offer_accept($1,$2)",[offerId,acceptRequest]));
const acceptedSnapshot=await snapshot();
await as(newUser,()=>q("select offer_accept($1,$2)",[offerId,acceptRequest]));
check("accept retry creates no extra ledger or notification",JSON.stringify(await snapshot())===JSON.stringify(acceptedSnapshot));
await q("update cobuy_groups set deadline=now()-interval '1 second' where id=$1",[boundaryGroup]);
check("expired group rejects commitments",await fails(()=>as(retryUser,()=>q("select cobuy_commit($1,'co_owner',10000)",[boundaryGroup])),"GROUP_CLOSED"));

// ---------- Atomic deed write-back and archive-preserving reset ----------
const deedPath=`${newUser}/${myListing}/deed.png`;
check("ordinary users cannot call privileged deed write-back",await fails(()=>as(newUser,()=>q("select save_document_check($1,$2,$3,'{}','[]','verified_sample')",[newUser,myListing,deedPath])),"permission denied"));
const beforeDeed=await snapshot();
check("failed deed write-back rolls back completely",await fails(()=>q("select save_document_check($1,$2,$3,'{}','[]','invalid')",[newUser,myListing,deedPath]),"VALIDATION")&&JSON.stringify(await snapshot())===JSON.stringify(beforeDeed));
await q("select save_document_check($1,$2,$3,'{}','[]','needs_review')",[newUser,myListing,deedPath]);
check("deed result, listing badge and ledger saved together",(await one("select count(*)::int n from documents where listing_id=$1",[myListing])).n===1&&(await one("select verification_status s from listings where id=$1",[myListing])).s==='needs_review');
const history=JSON.stringify(await q("select * from ledger_entries order by id"));
const ownListing=JSON.stringify(await q("select * from listings where id=$1",[myListing]));
const accountsBefore=(await one("select count(*)::int n from auth.users")).n;
check("ordinary users cannot reset hosted demo",await fails(()=>as(newUser,()=>q("select demo_reset(gen_random_uuid())")),"NOT_ALLOWED"));
check("reviewer can inspect reset scope without mutation",(await as(P.reviewer,()=>one("select demo_reset(gen_random_uuid(),true) r"))).r.eligible===true);
const resetRequest=id(970);
const reset=(await as(P.reviewer,()=>one("select demo_reset($1) r",[resetRequest]))).r;
check("reset replaces exactly three designated demo listings",reset.reset_listings===3&&(await one("select count(*)::int n from listings where archived_at is not null")).n===3);
check("reset preserves signed-up accounts and listings",(await one("select count(*)::int n from auth.users")).n===accountsBefore&&JSON.stringify(await q("select * from listings where id=$1",[myListing]))===ownListing);
check("reset preserves every ledger entry byte-for-byte",JSON.stringify(await q("select * from ledger_entries order by id"))===history);
check("reset releases old demo commitments",(await one("select count(*)::int n from cobuy_groups where listing_id in ($1,$2) and status<>'cancelled'",[CONDO,HOUSE])).n===0);
const freshCondo=(await one("select id from listings where code='l-condo'")).id;
const freshRound=(await one("select id from offer_rounds where listing_id=$1",[freshCondo])).id;
check("reset restores open demo round with two offers",(await one("select status from offer_rounds where id=$1",[freshRound])).status==='open'&&(await one("select offer_count($1) n",[freshRound])).n===2);
check("reset offer amounts stay sealed from seller",(await as(P.malee,()=>q("select id from offers where round_id=$1",[freshRound]))).length===0);
await as(P.reviewer,()=>q("select demo_reset($1)",[resetRequest]));
check("reset retry cannot create another demo generation",(await one("select id from listings where code='l-condo'")).id===freshCondo);
check("archived listings cannot open co-buy",await fails(()=>as(P.somchai,()=>q("select cobuy_create_group($1)",[CONDO])),"NOT_ENABLED"));

// ---------- Premium and Co-Invest (migration 0700, D-44) ----------
// A building with little foreign quota left (49% of 1,000 m² = 490 m², 470 m² used), a condo and a house offering.
const CI_B = id(980), CI_CONDO = id(981), CI_HOUSE = id(982), CI_BIG = id(983), CI_CONDO2 = id(984), CI_L2 = id(985);
const OFF_C = id(986), OFF_H = id(987), OFF_BIG = id(988);
await insert("buildings", { id: CI_B, owner_id: P.malee, name: "Co-Invest test tower", district: "Sathorn", province: "Bangkok", total_floor_area_sqm: 1000, foreign_area_used_sqm: 470, build_year: 2020 });
await insert("properties", { id: CI_CONDO, owner_id: P.malee, type: "condo", building_id: CI_B, title: "Co-Invest test condo", district: "Sathorn", province: "Bangkok", area_sqm: 100, index_series: "condo_bkk" });
await insert("properties", { id: CI_HOUSE, owner_id: P.malee, type: "house", title: "Co-Invest test house", district: "Bang Yai", province: "Nonthaburi", area_sqm: 150, index_series: "house_bkk" });
await insert("properties", { id: CI_BIG, owner_id: P.malee, type: "house", title: "Co-Invest test villa", district: "Bang Yai", province: "Nonthaburi", area_sqm: 400, index_series: "house_bkk" });
await insert("properties", { id: CI_CONDO2, owner_id: P.malee, type: "condo", building_id: CI_B, title: "Co-buy test condo (same tower)", district: "Sathorn", province: "Bangkok", area_sqm: 50, index_series: "condo_bkk" });
await insert("listings", { id: CI_L2, property_id: CI_CONDO2, seller_id: P.malee, kind: "sale", asking_price_thb: 1000000, cobuy_enabled: true });
const offering = (oid, prop, units, par) => insert("coinvest_offerings", { id: oid, code: `t-${oid.slice(-4)}`, property_id: prop, total_units: units, unit_par_thb: par, target_thb: units * par, base_value_thb: units * par, base_month: "2026-08", current_value_thb: units * par, valued_month: "2026-08" });
await offering(OFF_C, CI_CONDO, 100, 10000);
await offering(OFF_H, CI_HOUSE, 100, 20000);
await offering(OFF_BIG, CI_BIG, 100, 100000);
const thai = id(990), thai2 = id(991);
await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [thai, "premium.test@example.com", JSON.stringify({ name: "Premium Test", nationality: "Thai" })]);
await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [thai2, "premium.test2@example.com", JSON.stringify({ name: "Premium Test 2", nationality: "Thai" })]);
const avail = async (uid) => Number((await as(uid, () => one("select available_thb from wallet_balances"))).available_thb);
const outstanding = async (oid) => (await one("select units_outstanding from coinvest_offerings where id = $1", [oid])).units_outstanding;

await as(null, async () => {
  check("guest sees Co-Invest offerings and their funding progress", (await q("select id, units_outstanding from coinvest_offerings")).length === 3);
  check("guest cannot read holdings or trades", (await fails(() => q("select * from coinvest_holdings"))) && (await fails(() => q("select * from coinvest_trades"))));
  check("guest cannot upgrade or trade", (await fails(() => q("select premium_upgrade()"))) && (await fails(() => q("select coinvest_buy($1, 1)", [OFF_C]))));
});
check("standard member cannot buy units", await fails(() => as(thai, () => q("select coinvest_buy($1, 1)", [OFF_C])), "PREMIUM_ONLY"));
check("member cannot make self premium", await fails(() => as(thai, () => q("update profiles set premium = true where id = $1", [thai])), "permission denied"));
const upReq = id(992);
await as(thai, () => q("select premium_upgrade($1)", [upReq]));
check("premium upgrade pays 9,900 THB test money once", (await avail(thai)) === 5000000 - 9900 && (await one("select premium from profiles where id = $1", [thai])).premium === true);
await as(thai, () => q("select premium_upgrade($1)", [upReq]));
check("upgrade retry with the same request charges nothing more", (await avail(thai)) === 5000000 - 9900);
check("second upgrade is refused", await fails(() => as(thai, () => q("select premium_upgrade()")), "ALREADY_PREMIUM"));

const buyReq = id(993);
const bought = (await as(thai, () => one("select coinvest_buy($1, 30, $2) r", [OFF_C, buyReq]))).r;
check("premium member buys 30 units at the funding price", bought.ok === true && Number(bought.amount_thb) === 300000 && (await avail(thai)) === 5000000 - 9900 - 300000);
check("purchase writes trade, holding, wallet debit and ledger entry together",
  (await one("select count(*)::int n from coinvest_trades where request_id = $1", [buyReq])).n === 1 &&
  (await one("select units from coinvest_holdings where offering_id = $1 and user_id = $2", [OFF_C, thai])).units === 30 &&
  Number((await one("select amount_thb from wallet_transactions where user_id = $1 and kind = 'share_purchase'", [thai])).amount_thb) === -300000 &&
  (await one("select count(*)::int n from ledger_entries where entry_type = 'share_transfer' and user_id = $1", [thai])).n === 1 &&
  (await outstanding(OFF_C)) === 30);
await as(thai, () => q("select coinvest_buy($1, 30, $2)", [OFF_C, buyReq]));
check("buy retry with the same request creates no second trade", (await one("select count(*)::int n from coinvest_trades where user_id = $1", [thai])).n === 1 && (await outstanding(OFF_C)) === 30);
check("same request with different units is refused", await fails(() => as(thai, () => q("select coinvest_buy($1, 31, $2)", [OFF_C, buyReq])), "REQUEST_MISMATCH"));
check("cannot sell more units than held", await fails(() => as(thai, () => q("select coinvest_sell($1, 31)", [OFF_C])), "NOT_ENOUGH_UNITS"));
check("cannot buy more units than the pool holds", await fails(() => as(thai, () => q("select coinvest_buy($1, 71)", [OFF_C])), "NOT_ENOUGH_UNITS"));
const tradesBefore = (await one("select count(*)::int n from coinvest_trades")).n;
check("wallet balance enforced for units", await fails(() => as(thai, () => q("select coinvest_buy($1, 60)", [OFF_BIG])), "WALLET_BALANCE"));
check("a refused purchase writes nothing", (await one("select count(*)::int n from coinvest_trades")).n === tradesBefore && (await outstanding(OFF_BIG)) === 0);

await q("select demo_seed_premium($1, now())", [P.daniel]);
check("foreign member cannot hold house units", await fails(() => as(P.daniel, () => q("select coinvest_buy($1, 5)", [OFF_H])), "FOREIGN_LAND"));
await as(P.daniel, () => q("select coinvest_buy($1, 10)", [OFF_C]));
check("foreign member holds condo units within the quota, FET flagged", (await one("select fet_required from coinvest_holdings where offering_id = $1 and user_id = $2", [OFF_C, P.daniel])).fet_required === true);
check("condo foreign quota counts Co-Invest units", await fails(() => as(P.daniel, () => q("select coinvest_buy($1, 15)", [OFF_C])), "FOREIGN_QUOTA"));
const quotaGroup = (await as(P.daniel, () => one("select cobuy_create_group($1) as g", [CI_L2]))).g;
check("co-buy foreign quota also counts Co-Invest units", await fails(() => as(P.daniel, () => q("select cobuy_commit($1, 'co_owner', 300000)", [quotaGroup])), "FOREIGN_QUOTA"));

await q("select demo_seed_premium($1, now())", [thai2]);
const funded = (await as(thai2, () => one("select coinvest_buy($1, 60) r", [OFF_C]))).r;
check("last units fund the offering: status active", funded.funded === true && (await one("select status from coinvest_offerings where id = $1", [OFF_C])).status === "active");
check("no units left in the pool after funding", await fails(() => as(thai2, () => q("select coinvest_buy($1, 1)", [OFF_C])), "POOL_EMPTY"));
await q("select coinvest_revalue($1, 1200000, '2026-09')", [OFF_C]);
const before = await avail(thai);
await as(thai, () => q("select coinvest_sell($1, 10)", [OFF_C]));
const holdingAfter = await one("select units, cost_thb from coinvest_holdings where offering_id = $1 and user_id = $2", [OFF_C, thai]);
check("sale at the index-tracked unit value credits the wallet", (await avail(thai)) === before + 120000 && Number((await one("select amount_thb from wallet_transactions where user_id = $1 and kind = 'share_sale'", [thai])).amount_thb) === 120000);
check("sale reduces units and cost basis proportionally", holdingAfter.units === 20 && Number(holdingAfter.cost_thb) === 200000 && (await outstanding(OFF_C)) === 90);
await as(thai2, () => q("select coinvest_buy($1, 5)", [OFF_H]));
await as(thai2, () => q("select coinvest_sell($1, 2)", [OFF_H]));
check("withdrawing during funding is a refund at the funding price", Number((await one("select amount_thb from wallet_transactions where user_id = $1 and kind = 'refund'", [thai2])).amount_thb) === 40000);

await as(P.narin, async () => check("standard member sees no one else's holdings", (await q("select user_id from coinvest_holdings")).length === 0));
await as(thai, async () => check("premium member sees co-owners for the ownership graph", (await q("select user_id from coinvest_holdings where offering_id = $1", [OFF_C])).length === 3));
check("units cannot be written directly", await fails(() => as(thai, () => q("insert into coinvest_holdings (offering_id, user_id, units) values ($1, $2, 100)", [OFF_BIG, thai]))));
check("unit trades are append-only", await fails(() => q("update coinvest_trades set units = 1"), "APPEND_ONLY"));
check("members cannot call the seed functions", await fails(() => as(thai, () => q("select demo_seed_trade($1, $2, 'buy', 1, gen_random_uuid(), now(), null)", [thai, OFF_H]))));
const seedReq = id(994);
await q("select demo_seed_trade($1, $2, 'buy', 3, $3, now(), null)", [thai, OFF_H, seedReq]);
await q("select demo_seed_trade($1, $2, 'buy', 3, $3, now(), null)", [thai, OFF_H, seedReq]);
check("seed replay is idempotent", (await one("select count(*)::int n from coinvest_trades where request_id = $1", [seedReq])).n === 1);
check("holder units always add up to units outstanding", (await q("select o.id from coinvest_offerings o where o.units_outstanding <> coalesce((select sum(units) from coinvest_holdings h where h.offering_id = o.id), 0)")).length === 0);
check("no member has a negative test-money balance", (await q("select user_id from wallet_balances where available_thb < 0")).length === 0);
check("signed wallet kinds are enforced", await fails(() => q("insert into wallet_transactions (user_id, kind, amount_thb) values ($1, 'share_purchase', 100)", [thai])));
await as(thai, () => q("select wallet_top_up()"));
check("top-up still works after spending (cap counts grants and top-ups only)", (await one("select count(*)::int n from wallet_transactions where user_id = $1 and kind = 'top_up'", [thai])).n === 1);
check("nationality cannot change while holding units", await fails(() => as(thai2, () => q("update profiles set nationality = 'Japanese' where id = $1", [thai2])), "HOLDINGS_LOCK_NATIONALITY"));


// ---------- realtime ----------
const pub = (await q("select tablename from pg_publication_tables where pubname = 'supabase_realtime'")).map((r) => r.tablename);
check("realtime streams messages, notifications, listings, co-buy, Co-Invest funding and ledger", ["messages", "notifications", "listings", "cobuy_participants", "coinvest_offerings", "ledger_entries"].every((t) => pub.includes(t)));
check("realtime never streams sealed offers", !pub.includes("offers"));
check("RLS is on for every public table", (await q("select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")).length === 0);

report();

function report() {
  const bad = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${r.name}${r.ok ? "" : `  →  ${r.detail || "failed"}`}`);
  console.log(`\n${results.length - bad.length}/${results.length} database checks passed.`);
  process.exit(bad.length ? 1 : 0);
}
