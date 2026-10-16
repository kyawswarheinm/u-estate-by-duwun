import { describe, expect, it } from "vitest";
import { matchesSearch, parseMarketSearch, PRICE_PRESETS, RENT_FLOOR_THB, rentAffordability, rentStats, searchHref, switchModeHref } from "./market-search";

const condoRent = { kind: "rent" as const, type: "condo", priceThb: 8_500, areaSqm: 28, district: "Watthana", province: "Bangkok", name: "Studio near On Nut" };

describe("market search", () => {
  it("defaults to Buy with no price floor, and Rent to a ฿3,000 floor", () => {
    expect(parseMarketSearch({}).mode).toBe("buy");
    expect(parseMarketSearch({}).minPrice).toBeNull();
    const rent = parseMarketSearch({ mode: "rent" });
    expect(rent.mode).toBe("rent");
    expect(rent.minPrice).toBe(RENT_FLOOR_THB);
    expect(parseMarketSearch({ kind: "rent" }).mode).toBe("rent"); // older links
    expect(parseMarketSearch({ mode: "rent", minPrice: "1000" }).minPrice).toBe(RENT_FLOOR_THB);
  });

  it("ignores a maximum below the minimum and says so", () => {
    const s = parseMarketSearch({ mode: "rent", minPrice: "8000", maxPrice: "5000" });
    expect(s.maxPrice).toBeNull();
    expect(s.priceError).toBe(true);
    expect(parseMarketSearch({ minArea: "50", maxArea: "20" }).areaError).toBe(true);
  });

  it("keeps several property types and drops unknown ones", () => {
    expect(parseMarketSearch({ type: ["condo", "house", "castle", "condo"] }).types).toEqual(["condo", "house"]);
  });

  it("filters by mode, price, size, types and place", () => {
    const s = parseMarketSearch({ mode: "rent", maxPrice: "12000", type: ["condo", "townhouse"] });
    expect(matchesSearch(s, condoRent)).toBe(true);
    expect(matchesSearch(s, { ...condoRent, kind: "sale" })).toBe(false);
    expect(matchesSearch(s, { ...condoRent, priceThb: 2_500 })).toBe(false);
    expect(matchesSearch(s, { ...condoRent, priceThb: 15_000 })).toBe(false);
    expect(matchesSearch(s, { ...condoRent, type: "house" })).toBe(false);
    expect(matchesSearch(parseMarketSearch({ mode: "rent", q: "on nut" }), condoRent)).toBe(true);
    expect(matchesSearch(parseMarketSearch({ mode: "rent", district: "Sathorn" }), condoRent)).toBe(false);
    expect(matchesSearch(parseMarketSearch({ mode: "rent", minPrice: "100000" }), { ...condoRent, priceThb: 250_000 })).toBe(true);
  });

  it("round-trips through the URL and resets prices when switching mode", () => {
    const s = parseMarketSearch({ mode: "rent", maxPrice: "12000", type: ["condo"], district: "Watthana" });
    expect(searchHref(s)).toBe("/market?mode=rent&district=Watthana&type=condo&maxPrice=12000");
    expect(parseMarketSearch(Object.fromEntries(new URLSearchParams(searchHref(s).split("?")[1]))).maxPrice).toBe(12_000);
    expect(switchModeHref(s, "buy")).toBe("/market?district=Watthana&type=condo");
  });

  it("has rent presets from ฿3,000 to ฿100,000+ without gaps", () => {
    const r = PRICE_PRESETS.rent;
    expect(r[0][0]).toBe(3_000);
    expect(r.at(-1)).toEqual([100_000, null]);
    for (let i = 1; i < r.length; i++) expect(r[i][0]).toBe(r[i - 1][1]);
  });
});

describe("rent statistics", () => {
  it("shows nothing below the minimum count instead of a misleading median", () => {
    const s = rentStats([{ district: "Chatuchak", priceThb: 18_000, areaSqm: 34 }], 3);
    expect(s.overall).toBeNull();
    expect(s.districts).toEqual([]);
    expect(s.count).toBe(1);
  });
  it("computes medians and bands from the listings", () => {
    const xs = [8_000, 10_000, 30_000].map((p) => ({ district: "Watthana", priceThb: p, areaSqm: 40 }));
    const s = rentStats(xs, 3);
    expect(s.overall?.medianRentThb).toBe(10_000);
    expect(s.overall?.medianRentPerSqm).toBe(250);
    expect(s.bands.find((b) => b.from === 8_000)?.count).toBe(2);
    expect(s.bands.find((b) => b.from === 30_000)?.count).toBe(1);
  });
});

describe("rent affordability", () => {
  it("computes the income share, move-in cost and monthly cost", () => {
    const r = rentAffordability({ income: 40_000, rent: 10_000, depositMonths: 2, advanceMonths: 1, utilities: 1_500, guidelinePct: 30 });
    expect(r.rentSharePct).toBe(25);
    expect(r.withinGuideline).toBe(true);
    expect(r.guidelineRentThb).toBe(12_000);
    expect(r.moveInThb).toBe(30_000);
    expect(r.monthlyThb).toBe(11_500);
  });
  it("gives no share without an income", () => {
    expect(rentAffordability({ income: 0, rent: 8_000, depositMonths: 2, advanceMonths: 1, utilities: 0, guidelinePct: 30 }).rentSharePct).toBeNull();
  });
});
