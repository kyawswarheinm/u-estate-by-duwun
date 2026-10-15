// B02 account lifecycle + B03 authorization, against the dedicated hosted demo project.
// Run: node --env-file=.env.local scripts/db/verify-auth-hosted.mjs --allow-demo-writes
// Passwords are random, held in memory only, never printed. Fixtures are labelled QA and retained.
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { admin, guest, check, must, person, listing, randomUUID, tag, finish, sessions } from "./hosted-harness.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const device = () => { const c = createClient(url, key, options); sessions.push(c); return c; };
const secret = () => randomBytes(18).toString("base64url");
const fails = (r) => Boolean(r.error);
const noRows = (r) => !r.error && Array.isArray(r.data) && r.data.length === 0;
const deniedOrNoRows = (r) => fails(r) || noRows(r);

try {
  // ---------- B02: account lifecycle ----------
  const email = `${tag}-life-${randomUUID().slice(0, 8)}@example.com`;
  const first = secret();
  const created = must(await admin.auth.admin.createUser({ email, password: first, email_confirm: true, user_metadata: { name: `QA ${tag} lifecycle`, nationality: "Thai", locale: "th" } }), "lifecycle user").user;
  const profile = must(await admin.from("profiles").select("display_name,locale,is_reviewer,utopia_member").eq("id", created.id).single(), "profile");
  check("sign-up trigger creates the profile (name, language, no privileges)", profile.display_name.startsWith("QA") && profile.locale === "th" && !profile.is_reviewer && !profile.utopia_member);
  const grant = must(await admin.from("wallet_transactions").select("amount_thb").eq("user_id", created.id), "grant");
  check("sign-up grants exactly 5,000,000 test money", grant.length === 1 && Number(grant[0].amount_thb) === 5000000);

  const deviceA = device(), deviceB = device();
  check("sign in on device A", !fails(await deviceA.auth.signInWithPassword({ email, password: first })));
  check("sign in on device B (second device)", !fails(await deviceB.auth.signInWithPassword({ email, password: first })));
  const who = await deviceA.auth.getUser();
  check("session identifies the right account", who.data.user?.id === created.id);
  const refreshed = await deviceA.auth.refreshSession();
  check("refresh keeps the same identity", !refreshed.error && refreshed.data.user?.id === created.id);
  const forged = await guest.auth.getUser("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAifQ.bad-signature");
  check("forged or expired token is rejected (treated as guest)", fails(forged) && !forged.data.user);
  const forgedRead = await createClient(url, key, { ...options, global: { headers: { Authorization: "Bearer not-a-real-token" } } }).from("wallet_transactions").select("id");
  check("forged bearer token reads no private rows", deniedOrNoRows(forgedRead));

  const second = secret();
  check("password change succeeds on device A", !fails(await deviceA.auth.updateUser({ password: second })));
  check("app signs other sessions out after a password change", !fails(await deviceA.auth.signOut({ scope: "others" })));
  check("device B can no longer refresh its session", fails(await deviceB.auth.refreshSession()));
  check("old password is rejected", fails(await device().auth.signInWithPassword({ email, password: first })));
  const fresh = device();
  check("new password signs in", !fails(await fresh.auth.signInWithPassword({ email, password: second })));
  check("wrong password gives the generic auth error", (await device().auth.signInWithPassword({ email, password: secret() })).error?.message === "Invalid login credentials");
  check("unknown email gives the same generic error", (await device().auth.signInWithPassword({ email: `${tag}-nobody@example.com`, password: secret() })).error?.message === "Invalid login credentials");
  must(await fresh.auth.signOut({ scope: "local" }), "local sign-out");
  check("signed-out session cannot refresh", fails(await fresh.auth.refreshSession()));

  // ---------- B03: authorization (attacker = an ordinary signed-in member) ----------
  const owner = await person(), attacker = await person();
  const id = await listing(owner, 2500000);
  const prop = must(await admin.from("listings").select("property_id").eq("id", id).single(), "property").property_id;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=", "base64");
  const photo = `${owner.id}/${id}/${randomUUID()}.png`, deed = `${owner.id}/${id}/${randomUUID()}.png`;
  must(await owner.client.storage.from("listing-photos").upload(photo, png, { contentType: "image/png" }), "owner photo");
  must(await owner.client.from("listing_photos").insert({ listing_id: id, storage_path: photo }), "photo row");
  must(await owner.client.storage.from("deeds").upload(deed, png, { contentType: "image/png" }), "owner deed");
  const doc = must(await admin.rpc("save_document_check", { p_owner: owner.id, p_listing: id, p_path: deed, p_extraction: { fixture: true }, p_flags: [{ severity: "warning", message: "QA fixture" }], p_outcome: "needs_review" }), "document fixture");
  const round = must(await owner.client.rpc("offer_open_round", { p_listing: id }), "owner round");
  const a = attacker.client;

  check("cannot change another user's listing price", deniedOrNoRows(await a.from("listings").update({ asking_price_thb: 1 }).eq("id", id).select("id")));
  check("cannot hand-set a verification badge (even on own listing)", fails(await owner.client.from("listings").update({ verification_status: "verified_sample" }).eq("id", id)));
  check("cannot insert a listing in someone else's name", fails(await a.from("listings").insert({ property_id: prop, seller_id: owner.id, kind: "sale", asking_price_thb: 1 })));
  check("cannot edit another owner's property", deniedOrNoRows(await a.from("properties").update({ title: "hijacked title" }).eq("id", prop).select("id")));
  check("cannot rename another user", deniedOrNoRows(await a.from("profiles").update({ display_name: "hijacked" }).eq("id", owner.id).select("id")));
  check("cannot grant self reviewer rights", fails(await a.from("profiles").update({ is_reviewer: true }).eq("id", attacker.id)));
  check("cannot grant self demo-persona status", fails(await a.from("profiles").update({ is_demo_persona: true }).eq("id", attacker.id)));
  check("cannot change another user's wallet settings", deniedOrNoRows(await a.from("profile_settings").update({ max_commit_thb: 10000 }).eq("user_id", owner.id).select("user_id")));
  check("cannot read another user's wallet settings", noRows(await a.from("profile_settings").select("user_id").eq("user_id", owner.id)));
  check("cannot mint test money directly", fails(await a.from("wallet_transactions").insert({ user_id: attacker.id, kind: "top_up", amount_thb: 1000000 })));
  check("cannot read another user's wallet", noRows(await a.from("wallet_transactions").select("id").eq("user_id", owner.id)));
  check("cannot write the public ledger directly", fails(await a.from("ledger_entries").insert({ entry_type: "loan", details: "forged" })));
  check("cannot forge a deed-check record", fails(await a.from("documents").insert({ owner_id: attacker.id, listing_id: id, storage_path: `${attacker.id}/x.png` })));
  check("cannot read another user's deed record", noRows(await a.from("documents").select("id").eq("id", doc)));
  check("cannot download another user's private deed", fails(await a.storage.from("deeds").download(deed)));
  await a.storage.from("listing-photos").remove([photo]);
  const stillThere = must(await admin.storage.from("listing-photos").list(`${owner.id}/${id}`), "photo list");
  check("cannot delete another user's photo file", stillThere.some((f) => photo.endsWith(f.name)));
  check("cannot delete another user's photo record", deniedOrNoRows(await a.from("listing_photos").delete().eq("listing_id", id).select("id")));
  check("cannot open an offer room on someone else's listing", (await a.rpc("offer_open_round", { p_listing: id })).error?.message === "NOT_OWNER");
  check("cannot close someone else's offer round", fails(await a.rpc("offer_close_round", { p_round: round })));
  check("cannot insert sealed offers or co-buy rows directly", fails(await a.from("offers").insert({ round_id: round, buyer_id: attacker.id, price_thb: 1, funding: "cash", closing_days: 30 })) && fails(await a.from("cobuy_participants").insert({ group_id: randomUUID(), user_id: attacker.id, lane: "co_owner", amount_thb: 1 })));
  check("cannot create notifications for others", fails(await a.from("notifications").insert({ user_id: owner.id, kind: "system", title: "phish" })));
  check("cannot read another user's notifications", noRows(await a.from("notifications").select("id").eq("user_id", owner.id)));
  check("cannot call internal receipt functions or read receipts", fails(await a.rpc("begin_mutation", { p_request: randomUUID(), p_operation: "x", p_payload: {} })) && fails(await a.from("mutation_receipts").select("request_id")));
  check("cannot write privileged deed results", fails(await a.rpc("save_document_check", { p_owner: attacker.id, p_listing: id, p_path: deed, p_extraction: {}, p_flags: [], p_outcome: "verified_sample" })));
  check("cannot switch off demo mode or change app settings", fails(await a.from("app_settings").update({ value: false }).eq("key", "demo_mode")));
  check("ordinary member cannot run the demo reset", (await a.rpc("demo_reset", { p_request: randomUUID() })).error?.message === "NOT_ALLOWED");
  const after = must(await admin.from("listings").select("asking_price_thb,verification_status").eq("id", id).single(), "listing after");
  const ownerAfter = must(await admin.from("profiles").select("display_name").eq("id", owner.id).single(), "owner after");
  check("stored records unchanged after every attack", Number(after.asking_price_thb) === 2500000 && after.verification_status === "needs_review" && ownerAfter.display_name.startsWith("QA"));
  await admin.storage.from("listing-photos").remove([photo]);
  await admin.storage.from("deeds").remove([deed]);
} catch (error) {
  check(`Hosted auth/authorization completed (${error.message})`, false);
} finally {
  await finish();
}
