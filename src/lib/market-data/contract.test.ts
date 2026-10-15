// Merge gate for the three-developer split: whoever replaces a snapshot file must keep these green.
import { describe, expect, it } from "vitest";
import { MARKET_FORECAST, MARKET_LISTINGS, MARKET_STATS } from "./index";
import { findMarketListings } from "./find";
import { compareToMarket, getMarketStats, getPriceForecast } from "./analytics";

// Personal data must never reach the repo (PDPA; the repo becomes public at submission).
const PHONE = /(\+66|\b0)[\s-]?[1-9](?:[\s-]?\d){7,8}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const LINE_ID = /\bline\s*(id)?\s*[:@]/i;

describe("market snapshot contract", () => {
  it("listings: unique ids, consistent price per sqm, known sites", () => {
    const ids = new Set(MARKET_LISTINGS.listings.map((l) => l.id));
    expect(ids.size).toBe(MARKET_LISTINGS.listings.length);
    const sites = new Set(MARKET_LISTINGS.meta.sites.map((s) => s.name));
    for (const l of MARKET_LISTINGS.listings) {
      expect(Math.abs(l.price_per_sqm - l.price_thb / l.area_sqm) / l.price_per_sqm).toBeLessThan(0.01);
      expect(sites.has(l.site)).toBe(true);
    }
  });

  it("listings: no phone numbers, emails or LINE IDs in text fields", () => {
    for (const l of MARKET_LISTINGS.listings) {
      for (const v of [l.project, l.district, l.province]) {
        if (v == null) continue;
        expect(PHONE.test(v) || EMAIL.test(v) || LINE_ID.test(v), `${l.id}: ${v}`).toBe(false);
      }
    }
  });

  it("listings: a fixture is always labelled sample", () => {
    expect(MARKET_LISTINGS.meta.source === "fixture" ? MARKET_LISTINGS.meta.is_sample : true).toBe(true);
  });

  it("stats: quartiles are ordered", () => {
    for (const r of MARKET_STATS.by_area) {
      expect(r.p25_price_per_sqm).toBeLessThanOrEqual(r.median_price_per_sqm);
      expect(r.median_price_per_sqm).toBeLessThanOrEqual(r.p75_price_per_sqm);
      expect(r.count).toBeGreaterThanOrEqual(MARKET_STATS.meta.min_count);
    }
  });

  it("forecast: p10 <= p50 <= p90 and the forecast starts after the history", () => {
    for (const s of MARKET_FORECAST.series) {
      for (const p of s.forecast) expect(p.p10 <= p.p50 && p.p50 <= p.p90, `${s.key} ${p.period}`).toBe(true);
      expect(s.forecast[0].period > s.history[s.history.length - 1].period).toBe(true);
    }
  });
});

describe("market functions used by the AI tools (P3)", () => {
  it("findMarketListings filters and caps results", () => {
    const r = findMarketListings({ type: "condo", kind: "sale", limit: 2 });
    expect(r.results.length).toBeLessThanOrEqual(2);
    expect(r.results.every((x) => x.type === "condo" && x.kind === "sale")).toBe(true);
    expect(r.note).toMatch(/not checked/);
  });

  it("getMarketStats and getPriceForecast return labelled answers", () => {
    const type = MARKET_STATS.by_area[0].type;
    expect(getMarketStats({ type }).all_districts).not.toBeNull();
    const f = getPriceForecast({ type: MARKET_FORECAST.series[0].type, months_ahead: 12 });
    expect(f.available).toBe(true);
    if (f.available) expect(f.change_pct.low).toBeLessThanOrEqual(f.change_pct.high);
  });

  it("compareToMarket places a price against the district", () => {
    const row = MARKET_STATS.by_area.find((r) => r.district !== "ALL")!;
    const r = compareToMarket({ priceThb: row.median_price_per_sqm * 40, areaSqm: 40, district: row.district, type: row.type, kind: row.kind });
    expect(r.available && r.diff_pct).toBe(0);
  });
});
