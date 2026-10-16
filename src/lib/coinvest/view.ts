// What the Co-Invest pages show, computed from the data snapshot by code (D-32). Pure, unit-tested.
import type { CoinvestOffering, CoinvestTrade, DB, Property } from "../types";
import { poolUnits, position, round2, simulatedMonthlyIncome, unitPrice } from "./engine";
import { latestMonth, seriesFor, valuationSeries, valueAt } from "./valuation";

export type OfferingView = {
  offering: CoinvestOffering;
  property: Property;
  unitPriceThb: number;
  poolUnits: number;
  soldPct: number;
  holders: number | null; // null when the viewer may not see who holds units
  changePct: number; // value change since funding (index-tracked estimate)
};

export function offeringViews(db: Pick<DB, "coinvestOfferings" | "coinvestHoldings" | "properties">, canSeeHolders: boolean): OfferingView[] {
  return db.coinvestOfferings
    .filter((o) => o.status !== "closed")
    .map((o) => {
      const property = db.properties.find((p) => p.id === o.propertyId)!;
      return {
        offering: o,
        property,
        unitPriceThb: unitPrice(o),
        poolUnits: poolUnits(o),
        soldPct: round2((o.unitsOutstanding / o.totalUnits) * 100),
        holders: canSeeHolders ? db.coinvestHoldings.filter((h) => h.offeringId === o.id && h.units > 0).length : null,
        changePct: round2(((o.currentValueThb - o.baseValueThb) / o.baseValueThb) * 100),
      };
    })
    .filter((v) => v.property)
    .sort((a, b) => Number(a.offering.status === "active") - Number(b.offering.status === "active") || b.soldPct - a.soldPct);
}

/** Units a member held at the end of a month, from their trades. */
function unitsAt(trades: CoinvestTrade[], offeringId: string, userId: string, monthEnd: string) {
  return trades.filter((t) => t.offeringId === offeringId && t.userId === userId && t.createdAt.slice(0, 7) <= monthEnd)
    .reduce((s, t) => s + (t.side === "buy" ? t.units : -t.units), 0);
}

const addMonth = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
};

export function portfolio(db: Pick<DB, "coinvestOfferings" | "coinvestHoldings" | "coinvestTrades" | "properties">, userId: string) {
  const rows = db.coinvestHoldings
    .filter((h) => h.userId === userId && h.units > 0)
    .map((h) => {
      const o = db.coinvestOfferings.find((x) => x.id === h.offeringId)!;
      const property = db.properties.find((p) => p.id === o.propertyId)!;
      return { offering: o, property, holding: h, position: position(o, h), incomeThb: simulatedMonthlyIncome(o, h.units) };
    })
    .sort((a, b) => b.position.valueThb - a.position.valueThb);
  const value = round2(rows.reduce((s, r) => s + r.position.valueThb, 0));
  const cost = round2(rows.reduce((s, r) => s + r.position.costThb, 0));
  const income = round2(rows.reduce((s, r) => s + r.incomeThb, 0));
  const totals = { valueThb: value, costThb: cost, gainThb: round2(value - cost), gainPct: cost ? round2(((value - cost) / cost) * 100) : 0, incomeThb: income, properties: rows.length };

  // Monthly value since the member's first trade: units held then × the unit value then (funding price while funding).
  const mine = db.coinvestTrades.filter((t) => t.userId === userId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const history: { period: string; value: number }[] = [];
  if (mine.length) {
    // Up to the later of the last published index month and the latest trade (later months reuse the last index value).
    const lastTrade = mine.at(-1)!.createdAt.slice(0, 7);
    const indexEnd = latestMonth(seriesFor("condo"));
    const end = lastTrade > indexEnd ? lastTrade : indexEnd;
    const offerings = [...new Set(mine.map((t) => t.offeringId))].map((id) => db.coinvestOfferings.find((o) => o.id === id)!).filter(Boolean);
    for (let m = mine[0].createdAt.slice(0, 7); m <= end; m = addMonth(m)) {
      let total = 0;
      for (const o of offerings) {
        const units = unitsAt(db.coinvestTrades, o.id, userId, m);
        if (!units) continue;
        const type = db.properties.find((p) => p.id === o.propertyId)?.type ?? "condo";
        const funded = o.fundedAt && o.fundedAt.slice(0, 7) <= m;
        total += units * (funded ? valueAt(o, type, m) / o.totalUnits : o.unitParThb);
      }
      history.push({ period: m, value: Math.round(total) });
    }
  }
  return { rows, totals, history };
}

/** Owners of one offering, largest first, plus the unallocated units in the U-Estate pool. */
export function ownership(db: Pick<DB, "coinvestHoldings" | "profiles">, o: CoinvestOffering, meId: string | null) {
  const holders = db.coinvestHoldings
    .filter((h) => h.offeringId === o.id && h.units > 0)
    .map((h) => ({ userId: h.userId, name: db.profiles.find((p) => p.id === h.userId)?.name ?? "Member", units: h.units, sharePct: round2((h.units / o.totalUnits) * 100), you: h.userId === meId, foreign: h.fetRequired }))
    .sort((a, b) => b.units - a.units);
  const pool = poolUnits(o);
  return { holders, pool: { units: pool, sharePct: round2((pool / o.totalUnits) * 100) } };
}

export function offeringValuation(o: CoinvestOffering, property: Property) {
  return valuationSeries(o, property.type);
}
