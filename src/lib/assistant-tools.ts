import "server-only";
// Read-only tools shared by the live voice agent (ElevenLabs client tools → /api/agent-tools)
// and the typed assistant (Claude tool runner → /api/assistant). Code computes every number (D-32).
// None of these tools can move money, change ownership or write to the ledger.
import { z } from "zod";
import { readDb } from "./store";
import { pricePanel } from "./price";
import { agentSaleFee, COBUY, committedThb, foreignAreaInGroup, GOVERNANCE, rentalPlacementFee, sellerFee } from "./rules";
import { parseQueryFallback, searchListings, SearchFiltersSchema } from "./search";
import { assessTokenFunding, TOKEN_ADVICE } from "./token-risk";
import { lookupToken } from "./tokenomist";

export const ToolInputs = {
  search_listings: SearchFiltersSchema.partial().extend({
    query: z.string().max(300).optional().describe("The user's own words, used if no filters are given"),
  }),
  get_listing_facts: z.object({ listing_id: z.string().max(40) }),
  compute_fees: z.object({ price_thb: z.number().positive(), kind: z.enum(["sale", "rent"]), is_member: z.boolean() }),
  check_token_unlocks: z.object({
    token: z.string().min(1).max(60).describe("Token name, symbol or Tokenomist ID, e.g. 'arbitrum' or 'sample-cliff'"),
    deposit_thb: z.number().positive().describe("The THB amount the user needs from selling this token"),
    pay_within_days: z.number().int().min(0).max(365).describe("Days until the user must pay"),
  }),
  get_cobuy_rules: z.object({}),
} as const;
export type ToolName = keyof typeof ToolInputs;
export const TOOL_NAMES = Object.keys(ToolInputs) as ToolName[];

export const TOOL_DESCRIPTIONS: Record<ToolName, string> = {
  search_listings: "Search active U-Estate listings in Thailand by type, sale/rent, budget in THB, minimum size, district, or co-buy availability. Returns at most 5 listings with their IDs.",
  get_listing_facts: "Get the facts for one listing: asking price, official appraisal with source and date, index-adjusted estimate range, risks, fees, document check, co-buy group status and the condo foreign-quota status.",
  compute_fees: "Compute U-Estate's fee for a sale or rental versus a typical agent. Buyers and tenants always pay 0.",
  check_token_unlocks: "Check whether paying a property deposit by selling a crypto token is risky because of upcoming token unlocks (Tokenomist data). Returns a risk level and a safety buffer. U-Estate never accepts crypto.",
  get_cobuy_rules: "Get the co-buy rules: who can join, the legal lanes for foreigners (condo co-ownership within the 49% quota, or lender at a fixed rate up to 15%), and the governance rules.",
};

async function searchTool(i: z.infer<(typeof ToolInputs)["search_listings"]>) {
  const db = await readDb();
  const districts = [...new Set(db.properties.map((p) => p.district))];
  const hasFilters = ["type", "kind", "maxPriceThb", "minSizeSqm", "district", "cobuy"].some((k) => i[k as keyof typeof i] != null);
  const f = hasFilters || !i.query
    ? { type: i.type ?? null, kind: i.kind ?? null, maxPriceThb: i.maxPriceThb ?? null, minSizeSqm: i.minSizeSqm ?? null, district: i.district ?? null, cobuy: i.cobuy ?? null }
    : parseQueryFallback(i.query, districts);
  return { filters_used: f, results: searchListings(db, f) };
}

export async function listingFacts(listingId: string) {
  const db = await readDb();
  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing) return { error: `No listing with id ${listingId}` };
  const property = db.properties.find((p) => p.id === listing.propertyId)!;
  const comparables = db.listings
    .filter((l) => l.id !== listing.id)
    .map((l) => ({ l, p: db.properties.find((x) => x.id === l.propertyId)! }))
    .filter(({ p }) => p.type === property.type)
    .map(({ l, p }) => ({ pricePerSqm: l.askingPriceThb / p.areaSqm }));
  const panel = pricePanel(listing, property, comparables);
  const group = db.cobuyGroups.find((g) => g.listingId === listing.id && g.status !== "cancelled");
  const participants = group ? db.cobuyParticipants.filter((p) => p.groupId === group.id) : [];
  const building = property.buildingId ? db.buildings.find((b) => b.id === property.buildingId) : undefined;
  return {
    listing_id: listing.id,
    url: `/listing/${listing.id}`,
    title: property.title,
    type: property.type,
    location: `${property.district}, ${property.province}`,
    area_sqm: property.areaSqm,
    deed_type: property.deedType,
    asking_price_thb: panel.askingThb,
    official_appraisal: panel.appraisal.thb > 0
      ? { thb: panel.appraisal.thb, source: panel.appraisal.source, date: panel.appraisal.date, note: /sample/i.test(panel.appraisal.source) ? "SAMPLE value in this demo" : "Entered by the seller, not yet checked" }
      : { thb: null, note: "Not provided yet" },
    estimate: panel.estimate.thb === null
      ? { available: false, reason: panel.estimate.reason }
      : { available: true, likely_thb: panel.estimate.thb, low_thb: panel.estimate.lowThb, high_thb: panel.estimate.highThb, method: panel.estimate.method, basis: panel.estimate.basis, index_source: panel.index.source, index_is_sample: panel.index.isSample },
    asking_vs_estimate_pct: panel.askingVsEstimatePct,
    document_check: { status: listing.verificationStatus, reasons: listing.verificationReasons, note: "Ownership must be confirmed at the Land Office." },
    risks: panel.risks.map((r) => ({ level: r.level, label: r.label, detail: r.detail })),
    fees: {
      seller_fee_thb: sellerFee(listing.askingPriceThb, false),
      seller_fee_member_thb: sellerFee(listing.askingPriceThb, true),
      typical_agent_fee_thb: agentSaleFee(listing.askingPriceThb),
      buyer_pays_thb: 0,
    },
    cobuy: listing.cobuyEnabled
      ? {
          available: true,
          members_only: true,
          group: group ? { id: group.id, url: `/cobuy/${group.id}`, status: group.status, target_thb: group.targetThb, committed_thb: committedThb(participants), participants: participants.length } : null,
          foreign_quota: property.type === "condo" && building
            ? { limit_sqm: Math.round((COBUY.foreignQuotaPct / 100) * building.totalFloorAreaSqm), used_sqm: Math.round(building.foreignAreaUsedSqm + foreignAreaInGroup(participants)) }
            : null,
        }
      : { available: false },
    test_money: true,
  };
}

async function tokenTool(i: z.infer<(typeof ToolInputs)["check_token_unlocks"]>) {
  const now = new Date();
  const payBy = new Date(now.getTime() + i.pay_within_days * 86_400_000);
  const until = new Date(payBy.getTime() + 60 * 86_400_000);
  const found = await lookupToken(i.token, now, until);
  if (!found.found) {
    const result = assessTokenFunding({ token: null, events: [], now, payBy, depositThb: i.deposit_thb });
    if (found.reason === "not_configured") result.reasons = ["Tokenomist is not connected on this server, so this token's unlock schedule is unknown."];
    return {
      token: i.token,
      result,
      note: found.reason === "not_configured" ? `Tokenomist is not connected. Sample tokens available: ${found.suggestions.join(", ")}` : `Not tracked by Tokenomist. Similar: ${found.suggestions.join(", ") || "none"}`,
      advice: TOKEN_ADVICE,
    };
  }
  return {
    token: { id: found.token.id, name: found.token.name, symbol: found.token.symbol, source: found.token.source, is_sample: found.token.isSample },
    result: assessTokenFunding({ token: found.token, events: found.events, now, payBy, depositThb: i.deposit_thb }),
    advice: TOKEN_ADVICE,
  };
}

/** Runs a tool by name with untrusted input. Validates with zod first. Returns JSON-serialisable data. */
export async function runTool(name: string, rawInput: unknown): Promise<unknown> {
  if (!(name in ToolInputs)) return { error: `Unknown tool ${name}` };
  const parsed = ToolInputs[name as ToolName].safeParse(rawInput ?? {});
  if (!parsed.success) return { error: "Invalid input", issues: parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`) };
  const input = parsed.data as never;
  switch (name as ToolName) {
    case "search_listings": return searchTool(input);
    case "get_listing_facts": return listingFacts((input as { listing_id: string }).listing_id);
    case "compute_fees": {
      const f = input as z.infer<(typeof ToolInputs)["compute_fees"]>;
      return f.kind === "sale"
        ? { u_estate_fee_thb: sellerFee(f.price_thb, f.is_member), typical_agent_fee_thb: agentSaleFee(f.price_thb), buyer_pays_thb: 0, rule: "1.5% (0.75% for U-topia members) vs a typical 3% agent fee" }
        : { u_estate_fee_thb: rentalPlacementFee(f.price_thb, f.is_member), typical_agent_fee_thb: Math.round(f.price_thb), tenant_pays_thb: 0, rule: "50% of one month's rent (25% for members) vs a typical one month" };
    }
    case "check_token_unlocks": return tokenTool(input);
    case "get_cobuy_rules":
      return {
        who: "U-topia community members only; groups of 2–10.",
        lanes: [
          "Condo: Thai and foreign members co-own; foreign ownership stays within 49% of the building's floor area; foreign members send funds from abroad (FET form).",
          "House or land: Thai members co-own; foreign members can only lend through a registered mortgage at a fixed rate above 0% and at most 15% a year, with no share of the property or its price rise.",
          "No nominee arrangements. The ledger records only registered rights.",
        ],
        governance: GOVERNANCE,
        demo: "Co-buy uses test money in this demo.",
      };
  }
}
