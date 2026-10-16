import { describe, expect, it } from "vitest";
import { seed } from "../seed";
import type { DB } from "../types";
import { availableThb, checkInvariants, COINVEST, position, trade, unitPrice, upgradePremium } from "./engine";
import { populationPlan, populationUsers } from "./population";
import { currentValuation, valuationSeries, valueAt } from "./valuation";
import { offeringViews, ownership, portfolio } from "./view";
import { walletSummary } from "../wallet";

const fresh = () => seed(new Date("2026-10-16T03:00:00.000Z"));
const offering = (db: DB, code: string) => db.coinvestOfferings.find((o) => o.code === code)!;

describe("demo population", () => {
  it("has 90 fictional members: 50 standard and 40 premium, with example.com emails", () => {
    const users = populationUsers();
    expect(users).toHaveLength(90);
    expect(users.filter((u) => u.tier === "standard")).toHaveLength(50);
    expect(users.filter((u) => u.tier === "premium")).toHaveLength(40);
    expect(new Set(users.map((u) => u.name)).size).toBeGreaterThan(80);
    const db = fresh();
    const members = db.profiles.filter((p) => /^u-m\d{3}$/.test(p.id));
    expect(members).toHaveLength(90);
    expect(members.every((p) => p.email?.endsWith("@example.com"))).toBe(true);
    expect(members.filter((p) => p.premium)).toHaveLength(40);
  });

  it("is deterministic and keeps every invariant", () => {
    expect(JSON.stringify(populationPlan().trades)).toBe(JSON.stringify(populationPlan().trades));
    const db = fresh();
    expect(checkInvariants(db)).toEqual([]);
    for (const p of db.profiles) expect(availableThb(db, p.id)).toBeGreaterThanOrEqual(0);
  });

  it("gives every premium member a holding, and foreign members only condo units", () => {
    const db = fresh();
    for (const p of db.profiles.filter((x) => x.premium && /^u-m\d{3}$/.test(x.id))) {
      const held = db.coinvestHoldings.filter((h) => h.userId === p.id && h.units > 0);
      expect(held.length, p.name).toBeGreaterThan(0);
      if (!p.isThai) {
        for (const h of held) {
          const o = db.coinvestOfferings.find((x) => x.id === h.offeringId)!;
          expect(db.properties.find((x) => x.id === o.propertyId)!.type).toBe("condo");
          expect(h.fetRequired).toBe(true);
        }
      }
    }
  });

  it("funds three offerings fully and leaves three funding, with pool units left to buy", () => {
    const db = fresh();
    expect(db.coinvestOfferings.filter((o) => o.status === "active").map((o) => o.code).sort()).toEqual(["ci-ladprao", "ci-lumpini", "ci-ratchada"]);
    expect(db.coinvestOfferings.filter((o) => o.status === "funding")).toHaveLength(3);
    for (const o of db.coinvestOfferings) expect(o.totalUnits - o.unitsOutstanding).toBeGreaterThan(0);
  });

  it("records refunds, sales and purchases as signed wallet movements", () => {
    const db = fresh();
    const kinds = new Set(db.walletTxns.map((t) => t.kind));
    for (const k of ["demo_grant", "top_up", "premium_fee", "share_purchase", "share_sale", "refund"]) expect(kinds.has(k as never), k).toBe(true);
    for (const t of db.walletTxns) {
      if (["premium_fee", "share_purchase"].includes(t.kind)) expect(t.amountThb).toBeLessThan(0);
      else expect(t.amountThb).toBeGreaterThan(0);
    }
  });
});

describe("Co-Invest trading rules", () => {
  it("only premium members trade; the upgrade costs the demo fee once", () => {
    const db = fresh();
    expect(trade(db, { userId: "u-narin", offeringId: "ci-ari", side: "buy", units: 1 })).toEqual({ ok: false, code: "PREMIUM_ONLY" });
    const before = availableThb(db, "u-narin");
    expect(upgradePremium(db, "u-narin", "req-1")).toEqual({ ok: true, replayed: false });
    expect(availableThb(db, "u-narin")).toBe(before - COINVEST.premiumFeeThb);
    expect(upgradePremium(db, "u-narin", "req-1")).toEqual({ ok: true, replayed: true });
    expect(upgradePremium(db, "u-narin")).toEqual({ ok: false, code: "ALREADY_PREMIUM" });
    expect(availableThb(db, "u-narin")).toBe(before - COINVEST.premiumFeeThb);
  });

  it("buys at the funding price, debits the wallet, writes the ledger, and replays a retry", () => {
    const db = fresh();
    upgradePremium(db, "u-narin");
    const o = offering(db, "ci-ari");
    const out = o.unitsOutstanding;
    const before = availableThb(db, "u-narin");
    const ledger = db.ledger.length;
    const r = trade(db, { userId: "u-narin", offeringId: o.id, side: "buy", units: 5, requestId: "r-buy" });
    expect(r.ok && r.trade.amountThb).toBe(5 * o.unitParThb);
    expect(availableThb(db, "u-narin")).toBe(before - 5 * o.unitParThb);
    expect(o.unitsOutstanding).toBe(out + 5);
    expect(db.ledger.length).toBe(ledger + 1);
    expect(db.ledger.at(-1)!.entryType).toBe("share_transfer");
    const again = trade(db, { userId: "u-narin", offeringId: o.id, side: "buy", units: 5, requestId: "r-buy" });
    expect(again.ok && again.replayed).toBe(true);
    expect(o.unitsOutstanding).toBe(out + 5);
    expect(trade(db, { userId: "u-narin", offeringId: o.id, side: "buy", units: 6, requestId: "r-buy" })).toEqual({ ok: false, code: "REQUEST_MISMATCH" });
    expect(checkInvariants(db)).toEqual([]);
  });

  it("refuses overselling, buying beyond the pool, bad unit counts and spending beyond the balance", () => {
    const db = fresh();
    upgradePremium(db, "u-narin");
    const o = offering(db, "ci-ari");
    expect(trade(db, { userId: "u-narin", offeringId: o.id, side: "sell", units: 1 })).toEqual({ ok: false, code: "NOT_ENOUGH_UNITS" });
    expect(trade(db, { userId: "u-narin", offeringId: o.id, side: "buy", units: o.totalUnits - o.unitsOutstanding + 1 })).toEqual({ ok: false, code: "NOT_ENOUGH_UNITS" });
    expect(trade(db, { userId: "u-narin", offeringId: o.id, side: "buy", units: 0 })).toEqual({ ok: false, code: "UNITS_INVALID" });
    expect(trade(db, { userId: "u-narin", offeringId: o.id, side: "buy", units: 1.5 })).toEqual({ ok: false, code: "UNITS_INVALID" });
    // Spend most of the balance, then try to buy more than what is left: refused, and nothing is written.
    const town = offering(db, "ci-bangkapi");
    expect(trade(db, { userId: "u-narin", offeringId: town.id, side: "buy", units: town.totalUnits - town.unitsOutstanding }).ok).toBe(true);
    const left = availableThb(db, "u-narin");
    const ariNow = offering(db, "ci-ari");
    const tooMany = Math.floor(left / ariNow.unitParThb) + 1;
    expect(tooMany).toBeLessThanOrEqual(ariNow.totalUnits - ariNow.unitsOutstanding);
    const tradesBefore = db.coinvestTrades.length;
    const walletBefore = db.walletTxns.length;
    expect(trade(db, { userId: "u-narin", offeringId: ariNow.id, side: "buy", units: tooMany })).toEqual({ ok: false, code: "WALLET_BALANCE" });
    expect([db.coinvestTrades.length, db.walletTxns.length]).toEqual([tradesBefore, walletBefore]);
    expect(availableThb(db, "u-narin")).toBe(left);
    expect(checkInvariants(db)).toEqual([]);
  });

  it("keeps foreign members to condos (D-14)", () => {
    const db = fresh();
    expect(db.profiles.find((p) => p.id === "u-daniel")!.premium).toBe(true);
    expect(trade(db, { userId: "u-daniel", offeringId: offering(db, "ci-bangkapi").id, side: "buy", units: 1 })).toEqual({ ok: false, code: "FOREIGN_LAND" });
    expect(trade(db, { userId: "u-daniel", offeringId: offering(db, "ci-ari").id, side: "buy", units: 1 }).ok).toBe(true);
  });

  it("withdrawing during funding is a full refund; selling an active offering uses the index-tracked unit value", () => {
    const db = fresh();
    const ari = offering(db, "ci-ari");
    const r = trade(db, { userId: "u-ploy", offeringId: ari.id, side: "sell", units: 4 });
    expect(r.ok && r.trade.amountThb).toBe(4 * ari.unitParThb);
    expect(db.walletTxns.at(-1)!.kind).toBe("refund");
    const lumpini = offering(db, "ci-lumpini");
    const holder = db.coinvestHoldings.find((h) => h.offeringId === lumpini.id && h.units > 2)!;
    const price = unitPrice(lumpini);
    expect(price).toBe(Math.round((lumpini.currentValueThb / lumpini.totalUnits) * 100) / 100);
    const s = trade(db, { userId: holder.userId, offeringId: lumpini.id, side: "sell", units: 2 });
    expect(s.ok && s.trade.amountThb).toBe(Math.round(price * 2 * 100) / 100);
    expect(db.walletTxns.at(-1)!.kind).toBe("share_sale");
  });

  it("completing the funding target turns the offering active", () => {
    const db = fresh();
    const studio = offering(db, "ci-ari-studio");
    const left = studio.totalUnits - studio.unitsOutstanding;
    const buyers = db.profiles.filter((p) => p.premium && p.isThai && !db.coinvestHoldings.some((h) => h.offeringId === studio.id && h.userId === p.id));
    let remaining = left;
    for (const b of buyers) {
      if (remaining === 0) break;
      const units = Math.min(remaining, Math.floor(availableThb(db, b.id) / studio.unitParThb), 40);
      if (units <= 0) continue;
      const r = trade(db, { userId: b.id, offeringId: studio.id, side: "buy", units });
      expect(r.ok).toBe(true);
      remaining -= units;
    }
    expect(studio.status).toBe("active");
    expect(studio.fundedAt).toBeTruthy();
    expect(trade(db, { userId: buyers[0].id, offeringId: studio.id, side: "buy", units: 1 })).toEqual({ ok: false, code: "POOL_EMPTY" });
    expect(checkInvariants(db)).toEqual([]);
  });

  it("wallet summary agrees with the engine balance", () => {
    const db = fresh();
    for (const id of ["u-ploy", "u-daniel", "u-m001", "u-m045"]) expect(walletSummary(db, id).availableThb).toBe(availableThb(db, id));
  });
});

describe("valuations and views", () => {
  it("values move with the BOT index from the funding month", () => {
    const db = fresh();
    const o = offering(db, "ci-ratchada");
    expect(valueAt(o, "condo", o.baseMonth)).toBe(o.baseValueThb);
    const now = currentValuation(o, "condo");
    expect(o.currentValueThb).toBe(now.valueThb);
    const series = valuationSeries(o, "condo");
    expect(series.history[0].valueThb).toBe(o.baseValueThb);
    expect(series.history.at(-1)!.valueThb).toBe(now.valueThb);
    expect(series.forecast.length).toBeGreaterThan(0);
    for (const f of series.forecast) expect(f.p10 <= f.p50 && f.p50 <= f.p90).toBe(true);
  });

  it("a member whose first trade is after the last index month still gets a value history", () => {
    const db = fresh();
    const p = portfolio(db, "u-ploy"); // bought in October 2026; the index ends in August 2026
    expect(p.history.length).toBeGreaterThan(0);
    expect(p.history.at(-1)!.value).toBeGreaterThan(0);
  });

  it("portfolio totals add up and ownership shares cover all units", () => {
    const db = fresh();
    const member = db.coinvestHoldings.find((h) => h.units > 0)!.userId;
    const p = portfolio(db, member);
    expect(p.totals.valueThb).toBeCloseTo(p.rows.reduce((s, r) => s + r.position.valueThb, 0), 2);
    expect(p.history.length).toBeGreaterThan(0);
    for (const o of db.coinvestOfferings) {
      const own = ownership(db, o, member);
      expect(own.holders.reduce((s, h) => s + h.units, 0) + own.pool.units).toBe(o.totalUnits);
    }
    const views = offeringViews(db, false);
    expect(views.every((v) => v.holders === null)).toBe(true);
    expect(offeringViews(db, true).every((v) => typeof v.holders === "number")).toBe(true);
    const h = db.coinvestHoldings.find((x) => x.units > 0)!;
    const o = db.coinvestOfferings.find((x) => x.id === h.offeringId)!;
    expect(position(o, h).sharePct).toBe(Math.round((h.units / o.totalUnits) * 10000) / 100);
  });
});
