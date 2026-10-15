"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser, requireUser } from "@/lib/session";
import { newId, nextLedgerId, resetDb, updateDb } from "@/lib/store";
import { COBUY, coOwnerShares, committedThb, scoreOffers, thb, validateJoin } from "@/lib/rules";
import { aiConfigured, summariseOffers } from "@/lib/ai";
import { checkCommitment, walletSummary } from "@/lib/wallet";
import type { CobuyLane, FundingReadiness } from "@/lib/types";
import { usesSupabase } from "@/lib/db/runtime";
import { rpc, listingUuid, mutationRequest } from "@/lib/db/rpc";
import { readDb } from "@/lib/store";
import { demoMode } from "@/lib/session";
import { z } from "zod";

export type FormState = { ok: boolean; message: string; errors?: string[] } | null;

export async function resetDemo(formData: FormData) {
  if (usesSupabase()) {
    const user = await requireUser("/");
    if (!demoMode() || !user.isReviewer) throw new Error("Demo reset requires a reviewer.");
    await rpc("demo_reset", { p_request: mutationRequest(formData) });
    revalidatePath("/", "layout");
    redirect("/");
  }
  if (!demoMode()) throw new Error("Demo reset is disabled.");
  await resetDb();
  revalidatePath("/", "layout");
  redirect("/");
}

// ---- Co-buy ----
export async function createCobuyGroup(formData: FormData) {
  const listingId = String(formData.get("listingId"));
  const user = await requireUser(`/listing/${listingId}`);
  if (!user.utopiaMember) redirect(`/listing/${listingId}?cobuyError=members-only`);
  if (usesSupabase()) {
    const groupId = await rpc("cobuy_create_group", { p_listing: await listingUuid(listingId) });
    revalidatePath("/", "layout");
    redirect(`/cobuy/${groupId}`);
  }
  const groupId = await updateDb((db) => {
    const listing = db.listings.find((l) => l.id === listingId);
    if (!listing || !listing.cobuyEnabled) throw new Error("Listing not available for co-buy");
    const existing = db.cobuyGroups.find((g) => g.listingId === listingId && g.status !== "cancelled");
    if (existing) return existing.id;
    const id = newId("g");
    db.cobuyGroups.push({
      id,
      listingId,
      targetThb: listing.askingPriceThb,
      deadline: new Date(Date.now() + 14 * 86400_000).toISOString(),
      status: "forming",
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    });
    return id;
  });
  redirect(`/cobuy/${groupId}`);
}

export async function joinCobuy(_prev: FormState, formData: FormData): Promise<FormState> {
  const groupId = String(formData.get("groupId"));
  const lane = String(formData.get("lane")) as CobuyLane;
  const amountThb = Number(String(formData.get("amountThb") ?? "").replace(/[,฿\s]/g, ""));
  const rateRaw = formData.get("interestRatePct");
  const interestRatePct = rateRaw === null || rateRaw === "" ? undefined : Number(rateRaw);
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in to join a co-buy group.", errors: [] };
  if (usesSupabase()) {
    const parsed = z.object({ groupId: z.uuid(), lane: z.enum(["co_owner", "lender"]), amountThb: z.number().positive(), interestRatePct: z.number().positive().max(15).optional() })
      .safeParse({ groupId, lane, amountThb, interestRatePct });
    if (!parsed.success) return { ok: false, message: "Check the amount and lending rate.", errors: parsed.error.issues.map((e) => e.message) };
    try {
      await rpc("cobuy_commit", { p_group: groupId, p_lane: lane, p_amount: amountThb, p_rate: interestRatePct ?? null, p_request: mutationRequest(formData) });
    } catch (error) { return { ok: false, message: (error as Error).message }; }
    revalidatePath("/", "layout");
    return { ok: true, message: `Committed ${thb(amountThb)} in test money.` };
  }

  const result = await updateDb((db) => {
    const group = db.cobuyGroups.find((g) => g.id === groupId);
    if (!group) return { ok: false, message: "Group not found.", errors: [] as string[] };
    const listing = db.listings.find((l) => l.id === group.listingId)!;
    const property = db.properties.find((p) => p.id === listing.propertyId)!;
    const building = property.buildingId ? db.buildings.find((b) => b.id === property.buildingId) : undefined;
    const participants = db.cobuyParticipants.filter((p) => p.groupId === groupId);

    const v = validateJoin({ profile: user, property, building, group, participants, lane, amountThb, interestRatePct });
    if (!v.ok) return { ok: false, message: "Could not join the group.", errors: v.errors };
    const me = db.profiles.find((p) => p.id === user.id);
    const walletErrors = checkCommitment(walletSummary(db, user.id).availableThb, amountThb, me?.maxCommitThb);
    if (walletErrors.length) return { ok: false, message: "Could not join the group.", errors: walletErrors };

    db.cobuyParticipants.push({
      id: newId("cp"),
      groupId,
      userId: user.id,
      lane,
      amountThb,
      interestRatePct: lane === "lender" ? interestRatePct : undefined,
      areaSqmAttributed: v.derived.areaSqmAttributed,
      fetRequired: v.derived.fetRequired,
      joinedAt: new Date().toISOString(),
    });
    db.ledger.push({
      id: nextLedgerId(db),
      createdAt: new Date().toISOString(),
      userId: user.id,
      entryType: "commit_test_funds",
      amountThb,
      listingId: listing.id,
      groupId,
      details: `${user.name} committed ${thb(amountThb)} as ${lane === "lender" ? `lender at ${interestRatePct}% fixed` : "co-owner"} (test money)`,
      isSimulated: true,
    });

    const all = db.cobuyParticipants.filter((p) => p.groupId === groupId);
    if (committedThb(all) >= group.targetThb && all.length >= COBUY.minParticipants) {
      group.status = "funded";
      for (const s of coOwnerShares(all)) {
        db.ledger.push({
          id: nextLedgerId(db), createdAt: new Date().toISOString(), userId: s.userId, entryType: "co_owner_share",
          listingId: listing.id, groupId, details: `Registered co-owner share ${s.sharePct}% (pending Land Office registration — simulated)`, isSimulated: true,
        });
      }
      for (const p of all.filter((x) => x.lane === "lender")) {
        db.ledger.push({
          id: nextLedgerId(db), createdAt: new Date().toISOString(), userId: p.userId, entryType: "loan", amountThb: p.amountThb,
          listingId: listing.id, groupId, details: `Registered mortgage loan at ${p.interestRatePct}% fixed, ${COBUY.loanTermYears} years (simulated)`, isSimulated: true,
        });
      }
    }
    return { ok: true, message: `Committed ${thb(amountThb)} in test money.` };
  });

  revalidatePath(`/cobuy/${groupId}`);
  revalidatePath("/ledger");
  return result;
}

// ---- FairOffer ----
export async function submitOffer(_prev: FormState, formData: FormData): Promise<FormState> {
  const roundId = String(formData.get("roundId"));
  const priceThb = Number(String(formData.get("priceThb") ?? "").replace(/[,฿\s]/g, ""));
  const funding = String(formData.get("funding")) as FundingReadiness;
  const closingDays = Number(formData.get("closingDays"));
  const conditions = String(formData.get("conditions") ?? "").trim();
  const user = await currentUser();
  if (!user) return { ok: false, message: "Sign in to make an offer." };

  const errors: string[] = [];
  if (!Number.isFinite(priceThb) || priceThb <= 0) errors.push("Enter your offer price.");
  if (!["pre_approved", "proof_uploaded", "declared"].includes(funding)) errors.push("Choose your funding readiness.");
  if (!Number.isFinite(closingDays) || closingDays < 7 || closingDays > 180) errors.push("Closing time must be 7–180 days.");
  if (errors.length) return { ok: false, message: "Please fix the highlighted fields.", errors };
  if (usesSupabase()) {
    if (!z.uuid().safeParse(roundId).success || !Number.isInteger(closingDays) || conditions.length > 500) return { ok: false, message: "Invalid offer details." };
    try { await rpc("offer_submit", { p_round: roundId, p_price_thb: priceThb, p_funding: funding, p_closing_days: closingDays, p_conditions: conditions, p_request: mutationRequest(formData) }); }
    catch (error) { return { ok: false, message: (error as Error).message }; }
    revalidatePath("/", "layout");
    return { ok: true, message: "Your sealed offer was saved." };
  }

  const res = await updateDb((db) => {
    const round = db.offerRounds.find((r) => r.id === roundId);
    if (!round || round.status !== "open") return { ok: false, message: "This offer round is closed." };
    const listing = db.listings.find((l) => l.id === round.listingId)!;
    if (listing.sellerId === user.id) return { ok: false, message: "Sellers cannot bid on their own listing." };
    const existing = db.offers.find((o) => o.roundId === roundId && o.buyerId === user.id);
    if (existing) {
      Object.assign(existing, { priceThb, funding, closingDays, conditions, submittedAt: new Date().toISOString() });
    } else {
      db.offers.push({ id: newId("o"), roundId, buyerId: user.id, priceThb, funding, closingDays, conditions, submittedAt: new Date().toISOString(), status: "submitted" });
    }
    db.ledger.push({
      // No amount here: the ledger is public and the offer is sealed until the round closes.
      id: nextLedgerId(db), createdAt: new Date().toISOString(), userId: user.id, entryType: "offer_submitted",
      listingId: listing.id, details: `Sealed offer submitted (amount hidden from other buyers until the round closes)`, isSimulated: true,
    });
    return { ok: true, message: existing ? "Your sealed offer was updated." : "Your sealed offer was submitted." };
  });
  revalidatePath(`/listing/${formData.get("listingId")}/offers`);
  return res;
}

export async function closeRound(formData: FormData) {
  const roundId = String(formData.get("roundId"));
  const user = await requireUser(`/listing/${String(formData.get("listingId"))}/offers`);
  if (usesSupabase()) {
    await rpc("offer_close_round", { p_round: z.uuid().parse(roundId) });
    const db = await readDb();
    const round = db.offerRounds.find((r) => r.id === roundId)!;
    const ranked = scoreOffers(db.offers.filter((o) => o.roundId === roundId), round.criteria);
    if (aiConfigured()) {
      try {
        const facts = JSON.stringify({ criteria: round.criteria, ranked });
        const summary = await summariseOffers(facts);
        if (summary) await rpc("offer_set_summary", { p_round: roundId, p_locale: "en", p_text: summary });
      } catch { /* Ranking is deterministic; summary is optional. */ }
    }
    revalidatePath("/", "layout");
    return;
  }
  const facts = await updateDb((db) => {
    const round = db.offerRounds.find((r) => r.id === roundId)!;
    const listing = db.listings.find((l) => l.id === round.listingId)!;
    if (listing.sellerId !== user.id || round.status !== "open") return null;
    round.status = "closed";
    const offers = db.offers.filter((o) => o.roundId === roundId);
    const ranked = scoreOffers(offers, round.criteria);
    return [
      `Published criteria: ${round.criteria.map((c) => `${c.label} ${c.weight}%`).join(", ")}.`,
      ...ranked.map((r, i) => `#${i + 1} Offer ${r.offer.id}: price ${thb(r.offer.priceThb)}, funding ${r.offer.funding}, closing in ${r.offer.closingDays} days, conditions "${r.offer.conditions || "none"}", score ${r.score}/100.`),
    ].join("\n");
  });
  if (facts && aiConfigured()) {
    try {
      const summary = await summariseOffers(facts);
      if (summary) await updateDb((db) => { db.offerRounds.find((r) => r.id === roundId)!.aiSummary = summary; });
    } catch {
      // AI summary is optional; ranking is already computed by code.
    }
  }
  const listingId = String(formData.get("listingId"));
  revalidatePath(`/listing/${listingId}/offers`);
}

export async function acceptOffer(formData: FormData) {
  const offerId = String(formData.get("offerId"));
  const listingId = String(formData.get("listingId"));
  const user = await requireUser(`/listing/${listingId}/offers`);
  if (usesSupabase()) {
    await rpc("offer_accept", { p_offer: z.uuid().parse(offerId), p_request: mutationRequest(formData) });
    revalidatePath("/", "layout");
    return;
  }
  await updateDb((db) => {
    const offer = db.offers.find((o) => o.id === offerId);
    if (!offer) return;
    const round = db.offerRounds.find((r) => r.id === offer.roundId)!;
    const listing = db.listings.find((l) => l.id === round.listingId)!;
    if (listing.sellerId !== user.id || round.status !== "closed") return;
    round.status = "decided";
    round.acceptedOfferId = offer.id;
    for (const o of db.offers.filter((x) => x.roundId === round.id)) o.status = o.id === offer.id ? "accepted" : "declined";
    listing.status = "under_offer";
    db.ledger.push({
      id: nextLedgerId(db), createdAt: new Date().toISOString(), userId: offer.buyerId, entryType: "offer_accepted", amountThb: offer.priceThb,
      listingId: listing.id, details: `Seller accepted offer ${offer.id} at ${thb(offer.priceThb)}; other buyers notified with the published criteria`, isSimulated: true,
    });
  });
  revalidatePath(`/listing/${listingId}/offers`);
  revalidatePath("/ledger");
}
