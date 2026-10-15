// B06 boundary cases for co-buy and wallet, against the dedicated hosted demo project.
// Run: node --env-file=.env.local scripts/db/verify-boundaries-hosted.mjs --allow-demo-writes
// (Quota exactly at / above 49% and retries are in verify-transactions-hosted.mjs.)
import { admin, check, must, person, listing, group, randomUUID, finish } from "./hosted-harness.mjs";

const join = (user, g, lane, amount, rate = null) =>
  user.client.rpc("cobuy_commit", { p_group: g, p_lane: lane, p_amount: amount, p_rate: rate, p_request: randomUUID() });
const code = (r) => r.error?.message;

try {
  const seller = await person();
  const house = await listing(seller, 1000000, "house");
  const g = await group(await person(), house);
  const m = await person();

  // Interest: 0 < rate <= 15
  check("interest 0% rejected", code(await join(m, g, "lender", 10000, 0)) === "RATE_INVALID");
  check("interest above 15% (15.01%) rejected", code(await join(m, g, "lender", 10000, 15.01)) === "RATE_INVALID");
  check("missing interest for a lender rejected", code(await join(m, g, "lender", 10000, null)) === "RATE_INVALID");
  check("interest exactly 15% accepted", !(await join(m, g, "lender", 10000, 15)).error);
  check("same member cannot join twice", code(await join(m, g, "co_owner", 10000)) === "ALREADY_JOINED");

  // Amounts
  const n = await person();
  check("zero amount rejected", code(await join(n, g, "co_owner", 0)) === "AMOUNT_INVALID");
  check("negative amount rejected", code(await join(n, g, "co_owner", -1)) === "AMOUNT_INVALID");
  check("more than the remaining target rejected", code(await join(n, g, "co_owner", 990001)) === "AMOUNT_INVALID");

  // Legal lanes
  const foreigner = await person("Australian");
  check("foreigner cannot co-own a house (land)", code(await join(foreigner, g, "co_owner", 10000)) === "FOREIGN_LAND");
  const condo = await listing(seller, 1000000, "condo");
  const cg = await group(await person(), condo);
  check("condo has no lender lane", code(await join(n, cg, "lender", 10000, 7)) === "CONDO_NO_LENDER");

  // Membership, own listing
  const outsider = await person();
  must(await admin.from("profiles").update({ utopia_member: false }).eq("id", outsider.id), "non-member fixture");
  check("non-member cannot join", code(await join(outsider, g, "co_owner", 10000)) === "MEMBERS_ONLY");
  check("non-member cannot start a group", code(await outsider.client.rpc("cobuy_create_group", { p_listing: condo })) === "MEMBERS_ONLY");
  check("seller cannot co-buy own listing", code(await join(seller, g, "co_owner", 10000)) === "OWN_LISTING");

  // Wallet limit (own setting) and balance
  const limited = await person();
  must(await limited.client.from("profile_settings").update({ max_commit_thb: 50000 }).eq("user_id", limited.id), "set own limit");
  check("per-commitment wallet limit enforced (50,000 limit, 60,000 commit)", code(await join(limited, g, "co_owner", 60000)) === "WALLET_LIMIT");
  check("commit at exactly the limit accepted", !(await join(limited, g, "co_owner", 50000)).error);
  check("wallet limit below 10,000 refused", Boolean((await limited.client.from("profile_settings").update({ max_commit_thb: 9999 }).eq("user_id", limited.id)).error));

  // Participants: at least 2, at most 10 (the 10th must complete the target)
  const small = await listing(seller, 200000, "house");
  const solo = await person();
  const sg = await group(solo, small);
  check("one person cannot fund a whole group alone", code(await join(solo, sg, "co_owner", 200000)) === "MIN_PARTICIPANTS");
  const lenderA = await person(), lenderB = await person();
  check("first lender accepted", !(await join(lenderA, sg, "lender", 100000, 7)).error);
  check("group cannot be completed by lenders only (co-owner required)", code(await join(lenderB, sg, "lender", 100000, 7)) === "OWNER_REQUIRED");

  const ten = await listing(seller, 1000000, "house");
  const people = [];
  for (let i = 0; i < 11; i++) people.push(await person());
  const tg = await group(people[0], ten);
  for (let i = 0; i < 9; i++) must(await join(people[i], tg, "co_owner", 10000), `participant ${i + 1}`);
  check("10th participant must complete the target", code(await join(people[9], tg, "co_owner", 10000)) === "LAST_SLOT");
  const last = must(await join(people[9], tg, "co_owner", 910000), "tenth completes");
  check("10th participant completing the target funds the group", last.funded === true);
  check("no 11th participant (group closed once funded)", code(await join(people[10], tg, "co_owner", 10000)) === "GROUP_CLOSED");
  const count = must(await admin.from("cobuy_participants").select("id").eq("group_id", tg), "participants");
  check("funded group holds exactly 10 participants", count.length === 10);
  const shares = must(await admin.from("ledger_entries").select("id").eq("group_id", tg).eq("entry_type", "co_owner_share"), "shares");
  check("funding writes one registered share per co-owner", shares.length === 10);

  // Closed / expired groups
  const exp = await listing(seller, 500000, "house");
  const eg = await group(await person(), exp);
  must(await admin.from("cobuy_groups").update({ deadline: new Date(Date.now() - 60000).toISOString() }).eq("id", eg), "expire fixture");
  check("expired group rejects commitments", code(await join(n, eg, "co_owner", 10000)) === "GROUP_CLOSED");
} catch (error) {
  check(`Hosted boundaries completed (${error.message})`, false);
} finally {
  await finish();
}
