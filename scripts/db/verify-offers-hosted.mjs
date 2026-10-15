// B04 FairOffer privacy and lifecycle, against the dedicated hosted demo project.
// Run: node --env-file=.env.local scripts/db/verify-offers-hosted.mjs --allow-demo-writes
import { admin, guest, check, must, person, listing, randomUUID, finish } from "./hosted-harness.mjs";
import { scoreOffers } from "../../src/lib/rules.ts";

const noRows = (r) => !r.error && Array.isArray(r.data) && r.data.length === 0;
const submit = (user, round, price, funding, days, request = randomUUID()) =>
  user.client.rpc("offer_submit", { p_round: round, p_price_thb: price, p_funding: funding, p_closing_days: days, p_conditions: "", p_request: request });

try {
  const seller = await person(), b1 = await person(), b2 = await person(), outsider = await person();
  const id = await listing(seller, 4000000);
  const round = must(await seller.client.rpc("offer_open_round", { p_listing: id }), "open round");
  check("second open on the same listing returns the same room", must(await seller.client.rpc("offer_open_round", { p_listing: id }), "reopen") === round);
  check("seller cannot bid on own listing", (await submit(seller, round, 4500000, "cash", 30)).error?.message === "OWN_LISTING");

  const r1 = randomUUID();
  const o1 = must(await submit(b1, round, 4100000, "declared", 60, r1), "offer 1");
  const o2 = must(await submit(b2, round, 3950000, "pre_approved", 21), "offer 2");
  check("exact retry returns the same offer", must(await submit(b1, round, 4100000, "declared", 60, r1), "retry") === o1);
  check("changed retry with a used request is rejected", (await submit(b1, round, 4999999, "declared", 60, r1)).error?.message === "REQUEST_MISMATCH");

  // While open: nobody but the buyer sees an amount.
  check("seller sees no amounts while the round is open", noRows(await seller.client.from("offers").select("price_thb").eq("round_id", round)));
  const own = must(await b1.client.from("offers").select("id,buyer_id").eq("round_id", round), "own offer");
  check("buyer sees only their own offer", own.length === 1 && own[0].id === o1);
  check("other buyer cannot see it", !must(await b2.client.from("offers").select("id").eq("round_id", round), "b2 view").some((o) => o.id === o1));
  check("outsider and guest see no offers", noRows(await outsider.client.from("offers").select("id").eq("round_id", round)) && noRows(await guest.from("offers").select("id").eq("round_id", round)));
  check("anyone can see the offer COUNT, never amounts", must(await guest.rpc("offer_count", { p_round: round }), "count") === 2);
  const submitted = must(await guest.from("ledger_entries").select("amount_thb,details").eq("listing_id", id).eq("entry_type", "offer_submitted"), "ledger");
  check("public ledger logs each submission once, with no amount", submitted.length === 2 && submitted.every((e) => e.amount_thb === null && !/\d{3},\d{3}/.test(e.details)));
  const notes = must(await seller.client.from("notifications").select("title,body").eq("kind", "offer_received"), "seller notes");
  check("seller's new-offer notifications carry no amount", notes.length >= 2 && notes.every((n) => !/4,?100,?000|3,?950,?000/.test(n.title + n.body)));

  // Close: only the owner, then amounts open to the seller only.
  check("buyer cannot close the round", Boolean((await b1.client.rpc("offer_close_round", { p_round: round })).error));
  check("outsider cannot close the round", Boolean((await outsider.client.rpc("offer_close_round", { p_round: round })).error));
  check("cannot accept before the round is closed", (await seller.client.rpc("offer_accept", { p_offer: o1, p_request: randomUUID() })).error?.message === "ROUND_NOT_CLOSED");
  must(await seller.client.rpc("offer_close_round", { p_round: round }), "close");
  check("closed round rejects late or edited offers", (await submit(b2, round, 4600000, "cash", 7)).error?.message === "ROUND_CLOSED");
  const visible = must(await seller.client.from("offers").select("id,price_thb,funding,closing_days,conditions,buyer_id,round_id,status,submitted_at").eq("round_id", round), "seller after close");
  check("seller sees all amounts after closing", visible.length === 2);
  check("buyers still cannot see each other's amounts after close", !must(await b2.client.from("offers").select("id").eq("round_id", round), "b2 after").some((o) => o.id === o1));

  // Rank with the same code the app uses (weights published before offers opened).
  const criteria = must(await guest.from("offer_rounds").select("criteria").eq("id", round).single(), "criteria").criteria;
  const ranked = scoreOffers(visible.map((o) => ({ id: o.id, roundId: o.round_id, buyerId: o.buyer_id, priceThb: Number(o.price_thb), funding: o.funding, closingDays: o.closing_days, conditions: o.conditions, submittedAt: o.submitted_at, status: o.status })), criteria);
  // Hand calculation (weights 50/25/15/10): o1 = 50 price + 10 funding (declared 0.4) + 0 closing + 10 conditions = 70;
  // o2 = 0 price + 25 funding (pre-approved) + 15 closing + 10 conditions = 50.
  check("ranking matches the hand calculation from the published weights (70 vs 50)", ranked[0].offer.id === o1 && ranked[0].score === 70 && ranked[1].score === 50);

  // Decide: only the owner, once.
  check("buyer cannot accept", (await b1.client.rpc("offer_accept", { p_offer: o1, p_request: randomUUID() })).error?.message === "NOT_OWNER");
  check("outsider cannot accept", (await outsider.client.rpc("offer_accept", { p_offer: o2, p_request: randomUUID() })).error?.message === "NOT_OWNER");
  const accept = randomUUID();
  check("seller decides: accepts an offer (any offer, ranking is advisory)", !(await seller.client.rpc("offer_accept", { p_offer: o2, p_request: accept })).error);
  check("exact retry of the accept is harmless", !(await seller.client.rpc("offer_accept", { p_offer: o2, p_request: accept })).error);
  check("a second, different decision is refused", (await seller.client.rpc("offer_accept", { p_offer: o1, p_request: randomUUID() })).error?.message === "ROUND_NOT_CLOSED");
  const accepted = must(await guest.from("ledger_entries").select("amount_thb").eq("listing_id", id).eq("entry_type", "offer_accepted"), "accepted ledger");
  check("ledger records exactly one acceptance, with the accepted amount", accepted.length === 1 && Number(accepted[0].amount_thb) === 3950000);
  check("listing moves to under offer", must(await guest.from("listings").select("status").eq("id", id).single(), "status").status === "under_offer");
  const roundAfter = must(await guest.from("offer_rounds").select("status,accepted_offer_id").eq("id", round).single(), "round after");
  check("round is decided with the accepted offer", roundAfter.status === "decided" && roundAfter.accepted_offer_id === o2);
  check("winning buyer is told", must(await b2.client.from("notifications").select("kind").eq("kind", "offer_accepted"), "b2 notes").length === 1);
  check("other buyer is told another offer was chosen", must(await b1.client.from("notifications").select("kind").eq("kind", "offer_declined"), "b1 notes").length === 1);
  check("criteria cannot be rewritten after publication", Boolean((await admin.from("offer_rounds").update({ criteria: [] }).eq("id", round)).error));
} catch (error) {
  check(`Hosted FairOffer completed (${error.message})`, false);
} finally {
  await finish();
}
