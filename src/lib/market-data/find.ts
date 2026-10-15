// Owner: P1 (docs/WORKPLAN.md). Finds external market listings from the scrape snapshot.
// Starter version works on the fixture; P1 improves it (P1T06). Keep the exported names and shapes stable for P3.
import { z } from "zod";
import { MARKET_LISTINGS, MarketKind, MarketType, type MarketListing } from "./index";

export const EXTERNAL_NOTE = "External listings copied from other websites on the date shown. U-Estate has not checked them; open the source link to confirm.";

export const MarketSearchSchema = z.object({
  type: MarketType.optional(),
  kind: MarketKind.optional(),
  district: z.string().max(60).optional().describe("English district name, e.g. Sathorn"),
  maxPriceThb: z.number().positive().optional().describe("Sale price ceiling, or monthly rent ceiling when kind is rent"),
  minSizeSqm: z.number().positive().optional(),
  near: z.object({ lat: z.number(), lng: z.number(), radiusKm: z.number().positive().max(50).default(3) }).optional(),
  limit: z.number().int().min(1).max(20).default(5),
});
export type MarketSearch = z.input<typeof MarketSearchSchema>;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(bLat - aLat) / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(r(bLng - aLng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function findMarketListings(input: MarketSearch = {}) {
  const f = MarketSearchSchema.parse(input);
  const district = f.district?.trim().toLowerCase();
  const matches = MARKET_LISTINGS.listings
    .filter((l) => (!f.type || l.type === f.type) && (!f.kind || l.kind === f.kind))
    .filter((l) => !district || l.district.toLowerCase() === district)
    .filter((l) => (!f.maxPriceThb || l.price_thb <= f.maxPriceThb) && (!f.minSizeSqm || l.area_sqm >= f.minSizeSqm))
    .map((l) => ({ l, distanceKm: f.near && l.lat != null && l.lng != null ? km(f.near.lat, f.near.lng, l.lat, l.lng) : null }))
    .filter(({ distanceKm }) => !f.near || (distanceKm != null && distanceKm <= f.near.radiusKm))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0) || a.l.price_per_sqm - b.l.price_per_sqm);
  return {
    total_matches: matches.length,
    results: matches.slice(0, f.limit).map(({ l, distanceKm }) => summarise(l, distanceKm)),
    is_sample: MARKET_LISTINGS.meta.is_sample,
    scraped_at: MARKET_LISTINGS.meta.scraped_at,
    note: EXTERNAL_NOTE,
  };
}

function summarise(l: MarketListing, distanceKm: number | null) {
  return {
    id: l.id, site: l.site, source_url: l.source_url, kind: l.kind, type: l.type, project: l.project,
    location: `${l.district}, ${l.province}`, price_thb: l.price_thb, area_sqm: l.area_sqm, price_per_sqm: l.price_per_sqm,
    bedrooms: l.bedrooms, listed_at: l.listed_at, distance_km: distanceKm == null ? null : Math.round(distanceKm * 10) / 10,
  };
}
