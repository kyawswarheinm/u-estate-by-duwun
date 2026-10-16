import { describe, expect, it } from "vitest";
import { canonicalUrl, ingest, normalizeRow, refresh } from "./ingest";
import { googleMapsLink } from "./maps";
import { availabilityShown, isStale } from "./schema";
import { REAL_LISTINGS } from "./index";

const base = {
  name: "Studio near BTS On Nut", type: "condo", kind: "rent", price_thb: "8,500", province: "Bangkok", district: "Watthana",
  source_name: "Owner (direct)", source_kind: "owner", permission: "Owner email, 2026-10-16",
};

describe("Google Maps links", () => {
  it("uses real coordinates only at exact or project precision", () => {
    expect(googleMapsLink({ lat: 13.7563, lng: 100.5018, precision: "exact" })).toEqual({ url: "https://www.google.com/maps/search/?api=1&query=13.7563%2C100.5018", precision: "exact" });
    expect(googleMapsLink({ lat: 13.81, lng: 100.537, precision: "district", district: "Bang Sue", province: "Bangkok" })?.url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Bang%20Sue%2C%20Bangkok%2C%20Thailand");
  });
  it("searches the project and area by name without coordinates, and gives up without a location", () => {
    expect(googleMapsLink({ project: "Life Asoke", district: "Watthana", province: "Bangkok" })).toEqual({
      url: "https://www.google.com/maps/search/?api=1&query=Life%20Asoke%2C%20Watthana%2C%20Bangkok", precision: "project" });
    expect(googleMapsLink({ district: "Chatuchak", province: "Bangkok" })?.precision).toBe("area");
    expect(googleMapsLink({})).toBeNull();
  });
});

describe("real-listing import", () => {
  it("keeps unknown facts empty and never marks an import as U-Estate verified", () => {
    const { row, log } = normalizeRow(base, 1, "2026-10-16");
    expect(log).toEqual([]);
    expect(row).toMatchObject({ price_thb: 8500, bedrooms: null, bathrooms: null, area_sqm: null, furnishing: null, amenities: [], lat: null, geo_precision: "none", verification: "third_party", availability: "unconfirmed", link_status: "unchecked", retrieved_at: "2026-10-16" });
    expect(row?.id).toMatch(/^rl-[a-f0-9]{12}$/);
  });

  it("drops impossible coordinates and implausible counts instead of guessing", () => {
    const swapped = normalizeRow({ ...base, lat: 100.5, lng: 13.7 }, 2, "2026-10-16");
    expect(swapped.row?.lat).toBeNull();
    expect(swapped.log[0].message).toMatch(/outside Thailand/);
    const half = normalizeRow({ ...base, lat: 13.7 }, 3, "2026-10-16");
    expect(half.row?.lat).toBeNull();
    expect(normalizeRow({ ...base, bedrooms: 2.5 }, 4, "2026-10-16").row?.bedrooms).toBeNull();
  });

  it("rejects rows without permission, a known type or a price, with a reason", () => {
    const { row, log } = normalizeRow({ ...base, permission: "", type: "castle", price_thb: "" }, 5, "2026-10-16");
    expect(row).toBeNull();
    expect(log.map((l) => l.message).join(" ")).toMatch(/permission/);
    expect(log.map((l) => l.message).join(" ")).toMatch(/type/);
  });

  it("parses CSV-style text values", () => {
    const { row } = normalizeRow({ ...base, type: "Serviced Apartment", bedrooms: "1", furnishing: "Partly furnished", amenities: "pool; gym;Pet friendly" }, 6, "2026-10-16");
    expect(row).toMatchObject({ type: "serviced_apartment", bedrooms: 1, furnishing: "partly_furnished", amenities: ["pool", "gym", "pet_friendly"] });
  });

  it("merges duplicates by source URL and keeps the first retrieval date", async () => {
    const url = "https://example.com/listing/123?utm_source=x";
    const first = await ingest([], [{ ...base, source_url: url }], { today: "2026-10-01" });
    expect(first.added).toBe(1);
    const again = await ingest(first.listings, [{ ...base, source_url: "https://EXAMPLE.com/listing/123/", price_thb: 9000 }, { ...base, source_url: url }], { today: "2026-10-16" });
    expect(again.added).toBe(0);
    expect(again.updated).toBe(1);
    expect(again.listings).toHaveLength(1);
    expect(again.listings[0]).toMatchObject({ price_thb: 9000, retrieved_at: "2026-10-01" });
    expect(again.log.some((l) => /duplicate/.test(l.message))).toBe(true);
    expect(canonicalUrl(url)).toBe("https://example.com/listing/123");
  });

  it("marks broken links, keeps unverifiable ones unchecked, and flags stale rows", async () => {
    const { listings } = await ingest([], [
      { ...base, name: "A", source_url: "https://example.com/a", availability: "available", last_verified_at: "2026-10-15" },
      { ...base, name: "B", source_url: "https://example.com/b", availability: "available", last_verified_at: "2026-10-15" },
    ], { today: "2026-10-16" });
    const log: { message: string }[] = [];
    const checked = await refresh(listings, { checkLink: async (u) => (u.endsWith("/a") ? "broken" : "unchecked"), now: new Date("2026-10-16"), log: log as never });
    const a = checked.find((r) => r.name === "A")!;
    const b = checked.find((r) => r.name === "B")!;
    expect(a).toMatchObject({ link_status: "broken", availability: "unconfirmed" });
    expect(b).toMatchObject({ link_status: "unchecked", availability: "available" });
    expect(isStale(b, new Date("2026-11-30"))).toBe(true);
    expect(availabilityShown(b, new Date("2026-10-16"))).toBe("available");
    expect(availabilityShown(b, new Date("2026-11-30"))).toBe("unconfirmed");
  });

  it("ships a valid (possibly empty) listings file", () => {
    expect(Array.isArray(REAL_LISTINGS.listings)).toBe(true);
  });
});

describe("U-Pal search over real listings", async () => {
  const { findRealListings } = await import("./find");
  const { listings } = await ingest([], [
    { ...base, name: "Cheap studio", price_thb: 6000, bedrooms: 0, availability: "available", last_verified_at: "2026-10-15", district: "Bang Kapi", source_url: "https://example.com/1" },
    { ...base, name: "Two-bed", price_thb: 15000, bedrooms: 2, amenities: "pool", district: "Bang Kapi", source_url: "https://example.com/2" },
    { ...base, name: "Gone", price_thb: 7000, availability: "unavailable", district: "Bang Kapi", source_url: "https://example.com/3" },
  ], { today: "2026-10-16" });
  const now = new Date("2026-10-16");

  it("filters by area, budget and stated facts, and hides unavailable listings", () => {
    const r = findRealListings({ kind: "rent", district: "bang kapi", max_price_thb: 8000 }, listings, now);
    expect(r.results.map((x) => x.name)).toEqual(["Cheap studio"]);
    expect(r.results[0]).toMatchObject({ availability: "available", original_url: "https://example.com/1", price_unit: "THB per month", google_maps_precision: "area" });
    expect(findRealListings({ min_bedrooms: 1 }, listings, now).results.map((x) => x.name)).toEqual(["Two-bed"]);
    expect(findRealListings({ amenities: ["pool"] }, listings, now).results.map((x) => x.name)).toEqual(["Two-bed"]);
  });
  it("reports unknown facts as null and says so when nothing is imported", () => {
    const two = findRealListings({ ids: [listings.find((l) => l.name === "Two-bed")!.id] }, listings, now).results[0];
    expect(two).toMatchObject({ bathrooms: null, area_sqm: null, furnishing: null, availability: "unconfirmed" });
    expect(findRealListings({}, [], now).note).toMatch(/No third-party listings have been imported/);
  });
});
