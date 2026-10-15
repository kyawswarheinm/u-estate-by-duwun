// Business rules (decision register D-09..D-19). Enforced in code, never by AI.
import type { Building, CobuyGroup, CobuyLane, CobuyParticipant, Offer, OfferCriterion, Profile, Property } from "./types";

// ---- R1 Fees (D-12, D-19) ----
export const FEES = {
  saleStandard: 0.015,
  saleMember: 0.0075,
  rentStandard: 0.5, // share of one month's rent
  rentMember: 0.25,
  agentSaleTypical: 0.03, // typical market practice, not a guarantee
  agentRentTypicalMonths: 1,
} as const;

export function sellerFee(priceThb: number, member: boolean) {
  return Math.round(priceThb * (member ? FEES.saleMember : FEES.saleStandard));
}
export function rentalPlacementFee(monthlyRentThb: number, member: boolean) {
  return Math.round(monthlyRentThb * (member ? FEES.rentMember : FEES.rentStandard));
}
export function agentSaleFee(priceThb: number) {
  return Math.round(priceThb * FEES.agentSaleTypical);
}

// ---- Co-buy rules (D-08, D-09, D-14, D-15, D-15a, D-19) ----
export const COBUY = {
  minParticipants: 2,
  maxParticipants: 10,
  foreignQuotaPct: 49,
  maxInterestPct: 15,
  defaultInterestPct: 7,
  loanTermYears: 5,
} as const;

export interface JoinInput {
  profile: Profile;
  property: Property;
  building?: Building;
  group: CobuyGroup;
  participants: CobuyParticipant[]; // existing participants of this group
  lane: CobuyLane;
  amountThb: number;
  interestRatePct?: number;
}

export interface JoinResult {
  ok: boolean;
  errors: string[];
  derived: { areaSqmAttributed?: number; fetRequired: boolean };
}

export function committedThb(participants: CobuyParticipant[]) {
  return participants.reduce((s, p) => s + p.amountThb, 0);
}

export function foreignAreaInGroup(participants: CobuyParticipant[]) {
  return participants.reduce((s, p) => s + (p.areaSqmAttributed ?? 0), 0);
}

export function validateJoin(i: JoinInput): JoinResult {
  const errors: string[] = [];
  const isCondo = i.property.type === "condo";
  let areaSqmAttributed: number | undefined;
  const fetRequired = isCondo && !i.profile.isThai && i.lane === "co_owner";

  // R2: co-buy is for U-topia community members only (D-09)
  if (!i.profile.utopiaMember) errors.push("Co-buy groups are open to U-topia community members only.");
  if (i.group.status !== "forming") errors.push("This group is no longer accepting participants.");
  // R3: group size
  if (i.participants.some((p) => p.userId === i.profile.id)) errors.push("You have already joined this group.");
  if (i.participants.length >= COBUY.maxParticipants) errors.push(`Groups are limited to ${COBUY.maxParticipants} people.`);

  // Amount
  const remaining = i.group.targetThb - committedThb(i.participants);
  if (!Number.isFinite(i.amountThb) || i.amountThb <= 0) errors.push("Enter an amount greater than ฿0.");
  else if (i.amountThb > remaining) errors.push(`Only ฿${remaining.toLocaleString("en-US")} is still needed.`);

  // R4: land rule (D-14, D-15)
  if (!isCondo && i.lane === "co_owner" && !i.profile.isThai) {
    errors.push("Foreign nationals cannot own or co-own Thai land. You can fund this property as a registered lender at a fixed interest rate.");
  }
  if (isCondo && i.lane === "lender") {
    errors.push("For condos, everyone joins as a co-owner. The lender option is for houses and land.");
  }

  // R7: lender terms (D-15a) – fixed rate, max 15%, no share of the property or its price rise
  if (i.lane === "lender") {
    const r = i.interestRatePct;
    if (r === undefined || !Number.isFinite(r) || r <= 0) errors.push("Enter a fixed yearly interest rate.");
    else if (r > COBUY.maxInterestPct) errors.push(`Interest above ${COBUY.maxInterestPct}% a year is not allowed for private loans in Thailand.`);
  }

  // R5: condo foreign quota by floor area (D-15)
  if (isCondo && !i.profile.isThai && i.lane === "co_owner" && i.amountThb > 0) {
    areaSqmAttributed = round2(i.property.areaSqm * (i.amountThb / i.group.targetThb));
    if (i.building) {
      const limit = (COBUY.foreignQuotaPct / 100) * i.building.totalFloorAreaSqm;
      const used = i.building.foreignAreaUsedSqm + foreignAreaInGroup(i.participants);
      if (used + areaSqmAttributed > limit) {
        errors.push(`This building's foreign ownership quota (${COBUY.foreignQuotaPct}% of floor area) would be exceeded. Remaining: ${round2(Math.max(0, limit - used))} m².`);
      }
    }
  }

  return { ok: errors.length === 0, errors, derived: { areaSqmAttributed, fetRequired } };
}

/** Registered co-owner shares (percent of the property) — lenders hold loans, not shares. */
export function coOwnerShares(participants: CobuyParticipant[]) {
  const owners = participants.filter((p) => p.lane === "co_owner");
  const equity = committedThb(owners);
  return owners.map((p) => ({ userId: p.userId, sharePct: equity ? round2((p.amountThb / equity) * 100) : 0 }));
}

export function loanSchedule(principalThb: number, ratePct: number, years: number = COBUY.loanTermYears) {
  const yearlyInterest = Math.round(principalThb * (ratePct / 100));
  return Array.from({ length: years }, (_, k) => ({
    year: k + 1,
    interestThb: yearlyInterest,
    principalRepaidThb: k === years - 1 ? principalThb : 0,
  }));
}

// ---- R9 governance text (D-10, D-11, D-19) ----
export const GOVERNANCE = [
  "A vetted property manager runs day-to-day matters (tenants, rent, routine repairs).",
  "The manager may approve repairs up to ฿20,000 without a vote.",
  "Bigger decisions need co-owners holding more than 50% of the value.",
  "Selling the whole property needs co-owners holding at least 75% of the value; those who disagree get the right to buy the others out first.",
  "To leave, a co-owner first offers their share to the group for 30 days at an independent valuation; after that they may sell to another verified member.",
  "Lenders receive fixed interest only. They hold a registered mortgage, not a share of the property or its price rise.",
];

// ---- R10 FairOffer scoring (rules published before offers open) ----
const FUNDING_SCORE = { cash: 1, pre_approved: 1, proof_uploaded: 0.8, declared: 0.4 } as const;

export function scoreOffers(offers: Offer[], criteria: OfferCriterion[]) {
  if (offers.length === 0) return [];
  const maxPrice = Math.max(...offers.map((o) => o.priceThb));
  const minPrice = Math.min(...offers.map((o) => o.priceThb));
  const maxDays = Math.max(...offers.map((o) => o.closingDays));
  const minDays = Math.min(...offers.map((o) => o.closingDays));
  const condCount = (o: Offer) => o.conditions.split(";").map((s) => s.trim()).filter(Boolean).length;
  const maxCond = Math.max(...offers.map(condCount));
  const norm = (v: number, lo: number, hi: number) => (hi === lo ? 1 : (v - lo) / (hi - lo));

  return offers
    .map((o) => {
      const parts: Record<string, number> = {
        price: norm(o.priceThb, minPrice, maxPrice),
        funding: FUNDING_SCORE[o.funding],
        closing: 1 - norm(o.closingDays, minDays, maxDays),
        conditions: maxCond === 0 ? 1 : 1 - condCount(o) / maxCond,
      };
      const total = criteria.reduce((s, c) => s + (parts[c.key] ?? 0) * c.weight, 0);
      return { offer: o, parts, score: round2(total) };
    })
    .sort((a, b) => b.score - a.score);
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function thb(n: number) {
  return `฿${Math.round(n).toLocaleString("en-US")}`;
}
