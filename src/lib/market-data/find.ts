// Owner: P1 (docs/WORKPLAN.md). Finds external market listings from the scrape snapshot.
// Sorting and nearby search keep the exported names and result shape stable for P3.
import { z } from "zod";
import { MARKET_LISTINGS, MarketKind, MarketType, type MarketListing } from "./index";

export const EXTERNAL_NOTE = "External listings copied from other websites on the date shown. U-Estate has not checked them; open the source link to confirm.";

export const MarketSearchSchema = z.object({
  type: MarketType.optional(),
  kind: MarketKind.optional(),
  district: z.string().max(60).optional().describe("English district name, e.g. Sathorn"),
  maxPriceThb: z.number().positive().optional().describe("Sale price ceiling, or monthly rent ceiling when kind is rent"),
  minSizeSqm: z.number().positive().optional(),
  sort: z.enum(["price", "price_desc", "price_per_sqm", "newest", "distance"]).optional().describe("price = cheapest first; newest uses known listing dates, unknown dates last; distance requires near"),
  near: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), radiusKm: z.number().positive().max(50).default(3) }).optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export type MarketSearch = z.input<typeof MarketSearchSchema>;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function findMarketListings(input: MarketSearch = {}) {
  const f = MarketSearchSchema.parse(input);
  const district = f.district?.trim().replace(/\s+/g, " ").toLowerCase();
  const sort = f.sort ?? (f.near ? "distance" : "price_per_sqm");
  if (sort === "distance" && !f.near) throw new Error("Distance sort requires near coordinates.");
  const matches = MARKET_LISTINGS.listings
    .filter((l) => (!f.type || l.type === f.type) && (!f.kind || l.kind === f.kind))
    .filter((l) => !district || l.district.toLowerCase() === district)
    .filter((l) => (!f.maxPriceThb || l.price_thb <= f.maxPriceThb) && (!f.minSizeSqm || l.area_sqm >= f.minSizeSqm))
    .map((l) => ({ l, distanceKm: f.near && l.lat != null && l.lng != null ? km(f.near.lat, f.near.lng, l.lat, l.lng) : null }))
    .filter(({ distanceKm }) => !f.near || (distanceKm != null && distanceKm <= f.near.radiusKm))
    .sort((a, b) => {
      const difference = sort === "price" ? a.l.price_thb - b.l.price_thb
        : sort === "price_desc" ? b.l.price_thb - a.l.price_thb
        : sort === "newest" ? (b.l.listed_at ?? "").localeCompare(a.l.listed_at ?? "")
        : sort === "distance" ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
        : a.l.price_per_sqm - b.l.price_per_sqm;
      return difference || a.l.id.localeCompare(b.l.id);
    });
  const note = MARKET_LISTINGS.meta.is_sample
    ? "SAMPLE / SYNTHETIC data, not real property listings or sale prices. U-Estate has not checked these as properties for sale. Source links identify fixture provenance; coordinates are approximate district centres, not building locations."
    : EXTERNAL_NOTE + " Distances may use approximate project or district coordinates.";
  return {
    total_matches: matches.length,
    results: matches.slice(0, f.limit).map(({ l, distanceKm }) => summarise(l, distanceKm)),
    is_sample: MARKET_LISTINGS.meta.is_sample,
    scraped_at: MARKET_LISTINGS.meta.scraped_at,
    note: matches.length ? note : `No listings match these filters. Try another district or widen the budget, size or radius. ${note}`,
  };
}

function summarise(l: MarketListing, distanceKm: number | null) {
  return {
    id: l.id, site: l.site, source_url: l.source_url, kind: l.kind, type: l.type, project: l.project,
    location: `${l.district}, ${l.province}`, price_thb: l.price_thb, area_sqm: l.area_sqm, price_per_sqm: l.price_per_sqm,
    bedrooms: l.bedrooms, listed_at: l.listed_at, distance_km: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
  };
}
