// Applies the demo population (population.ts) to a data snapshot through the real rules: members pay the premium
// fee from their wallet, every unit is bought or sold with trade(), and offerings are revalued from the BOT index at
// each trade's month. Used by the offline seed; the hosted seed replays the same plan through the SQL functions.
import type { DB } from "../types";
import { checkInvariants, trade, upgradePremium } from "./engine";
import { currentValuation, valueAt } from "./valuation";
import { populationPlan } from "./population";

export type PopulationIds = {
  user: (key: string) => string;
  building: (key: string) => string;
  property: (key: string) => string;
  offering: (key: string) => string;
  sellerId: string; // owner of the sample properties
};

export const WELCOME_GRANT_THB = 5_000_000;
export const TOP_UP_THB = 1_000_000;

export function applyPopulation(db: DB, ids: PopulationIds) {
  const plan = populationPlan();
  for (const u of plan.users) {
    if (db.profiles.some((p) => p.id === ids.user(u.key))) continue;
    const joined = new Date(Date.UTC(2023, 6, 1) + u.n * 6 * 86_400_000).toISOString();
    db.profiles.push({ id: ids.user(u.key), name: u.name, nationality: u.nationality, isThai: u.isThai, utopiaMember: u.tier === "premium", roles: ["buyer"], locale: u.locale, createdAt: joined, email: `member.${String(u.n).padStart(3, "0")}@example.com` });
    db.walletTxns.push({ id: `w-${u.key}-grant`, userId: ids.user(u.key), kind: "demo_grant", amountThb: WELCOME_GRANT_THB, note: "Welcome test money (demo)", createdAt: joined });
    for (let k = 1; k <= u.topUps; k++) {
      db.walletTxns.push({ id: `w-${u.key}-top${k}`, userId: ids.user(u.key), kind: "top_up", amountThb: TOP_UP_THB, note: "Test money added (demo)", createdAt: new Date(new Date(joined).getTime() + k * 20 * 86_400_000).toISOString() });
    }
  }
  for (const b of plan.buildings) {
    if (!db.buildings.some((x) => x.id === ids.building(b.key))) db.buildings.push({ id: ids.building(b.key), name: b.name, totalFloorAreaSqm: b.totalFloorAreaSqm, foreignAreaUsedSqm: b.foreignAreaUsedSqm });
  }
  for (const p of plan.properties) {
    if (db.properties.some((x) => x.id === ids.property(p.key))) continue;
    db.properties.push({
      id: ids.property(p.key), type: p.type, title: p.title, province: p.province, district: p.district, areaSqm: p.areaSqm,
      buildingId: p.buildingKey ? ids.building(p.buildingKey) : undefined, buildYear: p.buildYear, deedType: p.deedType,
      officialAppraisalThb: p.appraisalThb, appraisalSource: "Treasury Department appraisal (sample value)", appraisalDate: "2025-01", indexSeries: p.indexSeries,
    });
  }
  const typeOf = (offeringKey: string) => plan.properties.find((p) => p.key === plan.offerings.find((o) => o.key === offeringKey)!.propertyKey)!.type;
  for (const o of plan.offerings) {
    if (db.coinvestOfferings.some((x) => x.id === ids.offering(o.key))) continue;
    const target = o.totalUnits * o.unitParThb;
    db.coinvestOfferings.push({
      id: ids.offering(o.key), code: o.code, propertyId: ids.property(o.propertyKey), totalUnits: o.totalUnits, unitParThb: o.unitParThb, targetThb: target,
      unitsOutstanding: 0, status: "funding", baseValueThb: target, baseMonth: o.baseMonth, currentValueThb: target, valuedMonth: o.baseMonth,
      grossYieldPct: o.grossYieldPct, maxHolders: 20, opensAt: o.opensAt, createdAt: o.opensAt,
    });
  }

  // Premium upgrades and trades, in time order, through the same rules members use.
  const events = [
    ...plan.users.filter((u) => u.tier === "premium").map((u) => ({ at: u.premiumAt!, kind: "premium" as const, user: u.key })),
    ...plan.trades.map((t) => ({ at: t.at, kind: "trade" as const, t })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of events) {
    if (e.kind === "premium") {
      const userId = ids.user(e.user);
      if (db.profiles.find((p) => p.id === userId)?.premium) continue;
      const r = upgradePremium(db, userId, undefined, e.at);
      if (!r.ok) throw new Error(`population: premium ${e.user}: ${r.code}`);
      continue;
    }
    const o = db.coinvestOfferings.find((x) => x.id === ids.offering(e.t.offeringKey))!;
    if (db.coinvestTrades.some((x) => x.requestId === `pop-${e.t.seq}`)) continue;
    if (o.status === "active") o.currentValueThb = valueAt(o, typeOf(e.t.offeringKey), e.at.slice(0, 7));
    const r = trade(db, { userId: ids.user(e.t.userKey), offeringId: o.id, side: e.t.side, units: e.t.units, requestId: `pop-${e.t.seq}`, at: e.at });
    if (!r.ok) throw new Error(`population: trade ${e.t.seq} (${e.t.side} ${e.t.units} ${e.t.offeringKey} by ${e.t.userKey}): ${r.code}`);
  }
  for (const o of plan.offerings) {
    const offering = db.coinvestOfferings.find((x) => x.id === ids.offering(o.key))!;
    const v = currentValuation(offering, typeOf(o.key));
    if (offering.status === "active") {
      offering.currentValueThb = v.valueThb;
      offering.valuedMonth = v.month;
    }
  }
  const problems = checkInvariants(db);
  if (problems.length) throw new Error(`population invariants: ${problems.join("; ")}`);
  return plan;
}
