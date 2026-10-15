import { describe, expect, it } from "vitest";
import { parseQueryFallback, searchListings, spokenSummary } from "./search";
import { seed } from "./seed";

const districts = ["Sathorn", "Bang Yai", "Bang Na"];

describe("voice search parser (E2 fallback)", () => {
  it("reads type, budget and area in English", () => {
    const f = parseQueryFallback("Find a condo in Sathorn under 4.5 million baht", districts);
    expect(f).toMatchObject({ type: "condo", maxPriceThb: 4_500_000, district: "Sathorn", kind: null });
  });

  it("reads Thai: house under 6 ล้าน", () => {
    expect(parseQueryFallback("หาบ้าน งบไม่เกิน 6 ล้าน", districts)).toMatchObject({ type: "house", maxPriceThb: 6_000_000 });
  });

  it("reads Traditional Chinese 萬 and size", () => {
    expect(parseQueryFallback("找公寓 400萬 以內 30平方公尺", districts)).toMatchObject({ type: "condo", maxPriceThb: 4_000_000, minSizeSqm: 30 });
  });

  it("does not confuse size with price", () => {
    const f = parseQueryFallback("condo at least 40 sqm", districts);
    expect(f.minSizeSqm).toBe(40);
    expect(f.maxPriceThb).toBeNull();
  });

  it("reads plain baht numbers, rent and co-buy", () => {
    expect(parseQueryFallback("condo to rent under 25,000", districts)).toMatchObject({ kind: "rent", maxPriceThb: 25_000 });
    expect(parseQueryFallback("co-buy a condo under 4,500,000", districts)).toMatchObject({ cobuy: true, maxPriceThb: 4_500_000 });
  });
});

describe("searchListings", () => {
  const db = seed(new Date("2026-10-15T00:00:00Z"));

  it("filters by type and budget, cheapest first", () => {
    const r = searchListings(db, { type: "condo", kind: null, maxPriceThb: 4_000_000, minSizeSqm: null, district: null, cobuy: null });
    expect(r.map((x) => x.listingId)).toEqual(["l-condo2", "l-condo"]);
  });

  it("returns nothing for an impossible budget and says so", () => {
    const r = searchListings(db, { type: "house", kind: null, maxPriceThb: 1_000_000, minSizeSqm: null, district: null, cobuy: null });
    expect(r).toEqual([]);
    expect(spokenSummary(r, "th")).toContain("ยังไม่มี");
  });

  it("spoken summary uses code numbers", () => {
    const r = searchListings(db, { type: "condo", kind: null, maxPriceThb: null, minSizeSqm: 35, district: null, cobuy: null });
    expect(spokenSummary(r, "en")).toContain("4 million baht");
  });
});
