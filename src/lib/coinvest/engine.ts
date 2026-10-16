// Co-Invest and premium money rules (D-44). Pure functions over the data snapshot, used by the offline store, the
// demo seed and the unit tests. The hosted database runs the same rules in SQL (migration 0700: premium_upgrade,
// coinvest_buy, coinvest_sell); scripts/db/verify.mjs checks that both agree on the important cases.
// Test money only. Units are simulated registered co-ownership, never securities or tokens.
import type { Building, CobuyGroup, CobuyParticipant, CoinvestHolding, CoinvestOffering, CoinvestTrade, DB, LedgerEntry, Property, WalletTxn } from "../types";

export const COINVEST = {
  premiumFeeThb: 9_900, // one-time demo upgrade fee, paid in test money
  maxHolders: 20, // registered co-owners per property
  foreignQuotaPct: 49, // condo floor area (D-15)
  maxUnitsPerTrade: 1_000,
} as const;

export type TradeCode =
  | "NOT_SIGNED_IN" | "PREMIUM_ONLY" | "ALREADY_PREMIUM" | "OFFERING_CLOSED" | "UNITS_INVALID" | "NOT_ENOUGH_UNITS"
  | "POOL_EMPTY" | "HOLDERS_FULL" | "FOREIGN_LAND" | "FOREIGN_QUOTA" | "BUILDING_MISSING" | "WALLET_BALANCE"
  | "REQUEST_MISMATCH";

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Price of one unit now: the funding price while funding, then the index-tracked value split over all units. */
export function unitPrice(o: Pick<CoinvestOffering, "status" | "unitParThb" | "currentValueThb" | "totalUnits">) {
  return o.status === "funding" ? o.unitParThb : round2(o.currentValueThb / o.totalUnits);
}

export function poolUnits(o: Pick<CoinvestOffering, "totalUnits" | "unitsOutstanding">) {
  return o.totalUnits - o.unitsOutstanding;
}

type WalletView = Pick<DB, "walletTxns" | "cobuyParticipants" | "cobuyGroups">;

/** Test money that can be spent: every wallet movement (signed) minus co-buy money held for open groups. */
export function availableThb(db: WalletView, userId: string) {
  const moved = db.walletTxns.filter((t) => t.userId === userId).reduce((s, t) => s + t.amountThb, 0);
  const active = new Set(db.cobuyGroups.filter((g) => g.status !== "cancelled").map((g) => g.id));
  const held = db.cobuyParticipants.filter((p) => p.userId === userId && active.has(p.groupId)).reduce((s, p) => s + p.amountThb, 0);
  return round2(moved - held);
}

/** Floor area already counted against a building's foreign quota: recorded use + co-buy groups + Co-Invest holdings. */
export function foreignAreaUsed(
  db: { buildings: Building[]; properties: Property[]; listings: { id: string; propertyId: string }[]; cobuyGroups: CobuyGroup[]; cobuyParticipants: CobuyParticipant[]; coinvestOfferings: CoinvestOffering[]; coinvestHoldings: CoinvestHolding[] },
  buildingId: string,
  except?: { offeringId: string; userId: string },
) {
  const building = db.buildings.find((b) => b.id === buildingId);
  if (!building) return 0;
  const inBuilding = new Set(db.properties.filter((p) => p.buildingId === buildingId).map((p) => p.id));
  const listingIds = new Set(db.listings.filter((l) => inBuilding.has(l.propertyId)).map((l) => l.id));
  const groups = new Set(db.cobuyGroups.filter((g) => g.status !== "cancelled" && listingIds.has(g.listingId)).map((g) => g.id));
  const cobuy = db.cobuyParticipants.filter((p) => groups.has(p.groupId)).reduce((s, p) => s + (p.areaSqmAttributed ?? 0), 0);
  const offerings = new Set(db.coinvestOfferings.filter((o) => inBuilding.has(o.propertyId)).map((o) => o.id));
  const coinvest = db.coinvestHoldings
    .filter((h) => offerings.has(h.offeringId) && !(except && h.offeringId === except.offeringId && h.userId === except.userId))
    .reduce((s, h) => s + h.areaSqmAttributed, 0);
  return round2(building.foreignAreaUsedSqm + cobuy + coinvest);
}

export type TradeInput = {
  userId: string;
  offeringId: string;
  side: "buy" | "sell";
  units: number;
  requestId?: string;
  at?: string; // ISO time (seed history); defaults to now
  /** Only the demo seed may skip the premium check (it builds the members' history). */
  seeding?: boolean;
};
export type TradeResult =
  | { ok: true; trade: CoinvestTrade; replayed: boolean; funded: boolean }
  | { ok: false; code: TradeCode };

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const nextLedgerId = (db: DB) => db.ledger.reduce((m, e) => Math.max(m, e.id), 0) + 1;

/**
 * Buy units from the U-Estate pool or sell them back, atomically on the snapshot (the caller persists it).
 * Funding: buy at the funding price; selling withdraws units for a full refund at that price.
 * Active: buy and sell at the index-tracked unit value. Total units never change: members + pool = total.
 */
export function trade(db: DB, input: TradeInput): TradeResult {
  const at = input.at ?? new Date().toISOString();
  if (input.requestId) {
    const prior = db.coinvestTrades.find((t) => t.requestId === input.requestId);
    if (prior) {
      const same = prior.userId === input.userId && prior.offeringId === input.offeringId && prior.side === input.side && prior.units === input.units;
      return same ? { ok: true, trade: prior, replayed: true, funded: false } : { ok: false, code: "REQUEST_MISMATCH" };
    }
  }
  const user = db.profiles.find((p) => p.id === input.userId);
  if (!user) return { ok: false, code: "NOT_SIGNED_IN" };
  if (!input.seeding && !user.premium) return { ok: false, code: "PREMIUM_ONLY" };
  const o = db.coinvestOfferings.find((x) => x.id === input.offeringId);
  if (!o || o.status === "closed") return { ok: false, code: "OFFERING_CLOSED" };
  if (!Number.isInteger(input.units) || input.units <= 0 || input.units > COINVEST.maxUnitsPerTrade) return { ok: false, code: "UNITS_INVALID" };
  const property = db.properties.find((p) => p.id === o.propertyId);
  if (!property) return { ok: false, code: "OFFERING_CLOSED" };

  const holding = db.coinvestHoldings.find((h) => h.offeringId === o.id && h.userId === user.id);
  const held = holding?.units ?? 0;
  const price = unitPrice(o);
  const amount = round2(price * input.units);
  const phase: CoinvestTrade["phase"] = o.status === "funding" ? "funding" : "active";

  let newUnits: number;
  if (input.side === "buy") {
    if (input.units > poolUnits(o)) return { ok: false, code: poolUnits(o) === 0 ? "POOL_EMPTY" : "NOT_ENOUGH_UNITS" };
    if (held === 0) {
      const holders = db.coinvestHoldings.filter((h) => h.offeringId === o.id && h.units > 0).length;
      if (holders >= o.maxHolders) return { ok: false, code: "HOLDERS_FULL" };
    }
    newUnits = held + input.units;
  } else {
    if (input.units > held) return { ok: false, code: "NOT_ENOUGH_UNITS" };
    newUnits = held - input.units;
  }

  // Legal lanes (D-14, D-15): foreigners hold units only in condos, within the building's 49% floor-area quota.
  let area = 0;
  let fet = false;
  if (!user.isThai) {
    if (property.type !== "condo") return { ok: false, code: "FOREIGN_LAND" };
    if (!property.buildingId) return { ok: false, code: "BUILDING_MISSING" };
    const building = db.buildings.find((b) => b.id === property.buildingId);
    if (!building) return { ok: false, code: "BUILDING_MISSING" };
    area = round2(Math.ceil(((property.areaSqm * newUnits) / o.totalUnits) * 100) / 100);
    fet = newUnits > 0;
    if (input.side === "buy") {
      const used = foreignAreaUsed(db, building.id, { offeringId: o.id, userId: user.id });
      if (used + area > (COINVEST.foreignQuotaPct / 100) * building.totalFloorAreaSqm) return { ok: false, code: "FOREIGN_QUOTA" };
    }
  }

  if (input.side === "buy" && amount > availableThb(db, user.id)) return { ok: false, code: "WALLET_BALANCE" };

  // ---- apply (all or nothing: every check above has passed) ----
  const t: CoinvestTrade = { id: newId("cit"), offeringId: o.id, userId: user.id, side: input.side, phase, units: input.units, unitPriceThb: price, amountThb: amount, requestId: input.requestId, createdAt: at };
  db.coinvestTrades.push(t);
  if (holding) {
    holding.costThb = input.side === "buy" ? round2(holding.costThb + amount) : newUnits === 0 ? 0 : round2(holding.costThb - (holding.costThb * input.units) / held);
    holding.units = newUnits;
    holding.areaSqmAttributed = area;
    holding.fetRequired = fet;
    holding.updatedAt = at;
  } else {
    db.coinvestHoldings.push({ offeringId: o.id, userId: user.id, units: newUnits, costThb: amount, areaSqmAttributed: area, fetRequired: fet, updatedAt: at });
  }
  o.unitsOutstanding += input.side === "buy" ? input.units : -input.units;
  const kind: WalletTxn["kind"] = input.side === "buy" ? "share_purchase" : phase === "funding" ? "refund" : "share_sale";
  const title = property.title;
  db.walletTxns.push({
    id: newId("w"), userId: user.id, kind, amountThb: input.side === "buy" ? -amount : amount, createdAt: at, offeringId: o.id, tradeId: t.id,
    note: input.side === "buy" ? `Bought ${input.units} Co-Invest units: ${title} (test money)` : kind === "refund" ? `Withdrew ${input.units} units during funding, refunded: ${title} (test money)` : `Sold ${input.units} Co-Invest units to the U-Estate pool: ${title} (test money)`,
  });
  const pct = round2((newUnits / o.totalUnits) * 100);
  const entry: LedgerEntry = {
    id: nextLedgerId(db), createdAt: at, userId: user.id, entryType: "share_transfer", amountThb: amount, isSimulated: true,
    details: input.side === "buy"
      ? `${user.name} bought ${input.units} of ${o.totalUnits} units of ${title}; now holds ${pct}% (simulated co-ownership, test money)`
      : `${user.name} ${phase === "funding" ? "withdrew" : "sold"} ${input.units} of ${o.totalUnits} units of ${title} to the U-Estate pool; now holds ${pct}% (simulated, test money)`,
  };
  db.ledger.push(entry);
  let funded = false;
  if (o.status === "funding" && o.unitsOutstanding === o.totalUnits) {
    o.status = "active";
    o.fundedAt = at;
    funded = true;
  }
  return { ok: true, trade: t, replayed: false, funded };
}

export type UpgradeResult = { ok: true; replayed: boolean } | { ok: false; code: TradeCode };

/** Standard → Premium: pays the one-time demo fee from the test-money wallet. */
export function upgradePremium(db: DB, userId: string, requestId?: string, at = new Date().toISOString()): UpgradeResult {
  const user = db.profiles.find((p) => p.id === userId);
  if (!user) return { ok: false, code: "NOT_SIGNED_IN" };
  if (requestId && db.walletTxns.some((t) => t.requestId === requestId)) {
    return db.walletTxns.some((t) => t.requestId === requestId && t.userId === userId && t.kind === "premium_fee") ? { ok: true, replayed: true } : { ok: false, code: "REQUEST_MISMATCH" };
  }
  if (user.premium) return { ok: false, code: "ALREADY_PREMIUM" };
  if (COINVEST.premiumFeeThb > availableThb(db, userId)) return { ok: false, code: "WALLET_BALANCE" };
  db.walletTxns.push({ id: newId("w"), userId, kind: "premium_fee", amountThb: -COINVEST.premiumFeeThb, note: "Premium upgrade, one-time demo fee (test money)", createdAt: at, requestId });
  user.premium = true;
  user.premiumSince = at;
  return { ok: true, replayed: false };
}

/** A member's position in one offering, valued at today's unit price. */
export function position(o: CoinvestOffering, h: CoinvestHolding | undefined) {
  const units = h?.units ?? 0;
  const value = round2(units * unitPrice(o));
  const cost = h?.costThb ?? 0;
  return { units, sharePct: round2((units / o.totalUnits) * 100), valueThb: value, costThb: cost, gainThb: round2(value - cost) };
}

/** Simulated rental income for a holding (not paid out): gross yield on the current value, per month. */
export function simulatedMonthlyIncome(o: CoinvestOffering, units: number) {
  return round2((o.currentValueThb * (o.grossYieldPct / 100) * (units / o.totalUnits)) / 12);
}

/** Invariants checked by tests and the seed: units balance, no negative holdings, no overselling. */
export function checkInvariants(db: Pick<DB, "coinvestOfferings" | "coinvestHoldings" | "profiles" | "walletTxns" | "cobuyParticipants" | "cobuyGroups">) {
  const problems: string[] = [];
  for (const o of db.coinvestOfferings) {
    const held = db.coinvestHoldings.filter((h) => h.offeringId === o.id).reduce((s, h) => s + h.units, 0);
    if (held !== o.unitsOutstanding) problems.push(`${o.code}: holdings ${held} ≠ outstanding ${o.unitsOutstanding}`);
    if (o.unitsOutstanding > o.totalUnits || o.unitsOutstanding < 0) problems.push(`${o.code}: outstanding out of range`);
    const holders = db.coinvestHoldings.filter((h) => h.offeringId === o.id && h.units > 0).length;
    if (holders > o.maxHolders) problems.push(`${o.code}: ${holders} holders > ${o.maxHolders}`);
  }
  for (const h of db.coinvestHoldings) if (h.units < 0 || h.costThb < 0) problems.push(`negative holding ${h.offeringId}/${h.userId}`);
  for (const p of db.profiles) if (availableThb(db, p.id) < 0) problems.push(`negative balance ${p.id}`);
  return problems;
}


