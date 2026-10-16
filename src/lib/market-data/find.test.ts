import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketKind, MarketType, type MarketListing } from "./types";

const snapshot = vi.hoisted(() => ({ meta: { is_sample: false, scraped_at: "2026-10-16T06:00:00+07:00", note: "" }, listings: [] as unknown[] }));
vi.mock("./index", () => ({ MARKET_LISTINGS: snapshot, MarketKind, MarketType }));
import { findMarketListings } from "./find";

function row(id: string, overrides: Partial<MarketListing> = {}): MarketListing {
  return { id, site: "fixture", source_url: "https://example.com/fixture", kind: "sale", type: "condo", project: null,
    district: "Sathorn", province: "Bangkok", lat: 13.72, lng: 100.53, geo_precision: "district",
    price_thb: 4_000_000, area_sqm: 40, price_per_sqm: 100_000, bedrooms: null, listed_at: null,
    scraped_at: snapshot.meta.scraped_at, ...overrides };
}

describe("market listing search", () => {
  beforeEach(() => {
    snapshot.meta.is_sample = false;
    snapshot.meta.note = "";
    snapshot.listings = [row("ext-a", { price_thb: 6_000_000, price_per_sqm: 150_000, listed_at: "2026-10-01", lat: 13.73 }),
      row("ext-b", { price_thb: 3_000_000, price_per_sqm: 75_000, listed_at: "2026-10-10" }),
      row("ext-c", { price_thb: 2_000_000, price_per_sqm: 50_000, district: "Bang Na", lat: 13.67, lng: 100.61 }),
      row("ext-d", { lat: null, lng: null, geo_precision: "none" })];
  });
  it("sorts sale prices and unit prices, caps results and returns the full match count", () => {
    expect(findMarketListings({ sort: "price", limit: 2 }).results.map((r) => r.id)).toEqual(["ext-c", "ext-b"]);
    expect(findMarketListings({ sort: "price_desc" }).results[0].id).toBe("ext-a");
    expect(findMarketListings().results[0].id).toBe("ext-c");
    expect(findMarketListings({ limit: 1 }).total_matches).toBe(4);
  });
  it("sorts newest first and leaves unknown dates last with deterministic ties", () => {
    expect(findMarketListings({ sort: "newest" }).results.map((r) => r.id)).toEqual(["ext-b", "ext-a", "ext-c", "ext-d"]);
  });
  it("orders newest by instant across time zones and puts unusable dates last", () => {
    snapshot.listings = [
      row("ext-a", { listed_at: "2026-10-16T08:00:00+07:00" }),
      row("ext-b", { listed_at: "2026-10-16T02:00:00Z" }),
      row("ext-c", { listed_at: "2026-10-16-invalid" }),
      row("ext-d"),
    ];
    expect(findMarketListings({ sort: "newest" }).results.map((r) => r.id)).toEqual(["ext-b", "ext-a", "ext-c", "ext-d"]);
  });
  it("applies monthly rental budgets, property type and inclusive area boundaries", () => {
    snapshot.listings = [
      row("ext-rent", { kind: "rent", type: "house", price_thb: 25_000, area_sqm: 100 }),
      row("ext-large", { kind: "rent", type: "house", price_thb: 25_001, area_sqm: 120 }),
      row("ext-small", { kind: "rent", type: "house", price_thb: 20_000, area_sqm: 99 }),
      row("ext-condo", { kind: "rent", price_thb: 20_000, area_sqm: 100 }),
      row("ext-sale", { type: "house", price_thb: 25_000, area_sqm: 100 }),
    ];
    expect(findMarketListings({ kind: "rent", type: "house", maxPriceThb: 25_000, minSizeSqm: 100 }).results.map((r) => r.id)).toEqual(["ext-rent"]);
  });
  it("filters on unrounded distance and leaves the shared snapshot unchanged", () => {
    snapshot.listings = [row("ext-outside", { lat: 13.7291 }), row("ext-inside", { lat: 13.7289 })];
    const before = structuredClone(snapshot);
    const result = findMarketListings({ near: { lat: 13.72, lng: 100.53, radiusKm: 1 } });
    expect(result.results.map((r) => r.id)).toEqual(["ext-inside"]);
    expect(result.results[0].distance_km).toBe(1);
    expect(snapshot).toEqual(before);
    expect(findMarketListings().results.every((r) => r.distance_km === null)).toBe(true);
  });
  it("combines district, type, kind, budget and minimum area", () => {
    expect(findMarketListings({ district: "  SATHORN  ", type: "condo", kind: "sale", maxPriceThb: 3_000_000, minSizeSqm: 40 }).results.map((r) => r.id)).toEqual(["ext-b"]);
    expect(findMarketListings({ kind: "rent" }).total_matches).toBe(0);
  });
  it("uses haversine distance, excludes missing coordinates and respects the radius", () => {
    const result = findMarketListings({ near: { lat: 13.72, lng: 100.53, radiusKm: 2 } });
    expect(result.results.map((r) => r.id)).toEqual(["ext-b", "ext-a"]);
    expect(result.results[0].distance_km).toBe(0);
    expect(result.results[1].distance_km).toBeCloseTo(1.1, 1);
    expect(result.results.every((r) => r.distance_km! <= 2)).toBe(true);
  });
  it("allows explicit price sorting within a nearby search", () => {
    expect(findMarketListings({ near: { lat: 13.72, lng: 100.53 }, sort: "price_desc" }).results[0].id).toBe("ext-a");
  });
  it("rejects invalid coordinates, radius, limit and distance sorting without a point", () => {
    expect(() => findMarketListings({ near: { lat: 91, lng: 0 } })).toThrow();
    expect(() => findMarketListings({ near: { lat: 0, lng: 181 } })).toThrow();
    expect(() => findMarketListings({ near: { lat: 0, lng: 0, radiusKm: 51 } })).toThrow();
    expect(() => findMarketListings({ limit: 21 })).toThrow();
    expect(() => findMarketListings({ sort: "distance" })).toThrow(/requires near/);
  });
  it("explains an empty result without changing the response shape", () => {
    const result = findMarketListings({ district: "Not in this snapshot" });
    expect(result.total_matches).toBe(0);
    expect(result.results).toEqual([]);
    expect(result.note).toMatch(/No listings match/);
    expect(Object.keys(result).sort()).toEqual(["is_sample", "note", "results", "scraped_at", "total_matches"]);
  });
  it("labels synthetic results honestly instead of claiming they were scraped", () => {
    snapshot.meta.is_sample = true;
    const result = findMarketListings();
    expect(result.is_sample).toBe(true);
    expect(result.note).toMatch(/SYNTHETIC/);
    expect(result.note).not.toMatch(/copied from other websites/);
  });
  it("carries coordinate attribution to the AI without changing the result shape", () => {
    snapshot.meta.note = "Project coordinates: © OpenStreetMap contributors, ODbL 1.0.";
    expect(findMarketListings().note).toContain(snapshot.meta.note);
    snapshot.meta.is_sample = true;
    expect(findMarketListings().note).not.toContain(snapshot.meta.note);
  });
});
