// Real third-party and owner-supplied listings, imported by scripts/import-listings.ts into
// src/data/market/verified-listings.json. Separate from the frozen P1 market contract (src/lib/market-data/types.ts):
// richer fields, and only rows a human has permission to publish (an owner, an agency or a licensed feed).
// Unknown facts stay null. Nothing here is inferred from photos or descriptions.
import { z } from "zod";

export const PROPERTY_TYPES = [
  "condo", "apartment", "studio", "serviced_apartment", "house", "villa", "townhouse", "townhome", "land", "building",
] as const;
export const PropertyType = z.enum(PROPERTY_TYPES);
export type PropertyType = z.infer<typeof PropertyType>;

export const FURNISHING = ["furnished", "partly_furnished", "unfurnished"] as const;
export const AMENITIES = ["pool", "gym", "security", "elevator", "parking", "balcony", "air_conditioning", "pet_friendly", "coworking", "laundry"] as const;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "ISO date, e.g. 2026-10-16");

export const RealListing = z.object({
  id: z.string().regex(/^rl-[a-z0-9-]+$/, "rl-<hash>"),
  name: z.string().min(1).max(160),
  type: PropertyType,
  kind: z.enum(["sale", "rent"]),
  price_thb: z.number().positive(), // total asking price, or monthly asking rent when kind = "rent"
  currency: z.literal("THB"),
  province: z.string().min(1).max(60),
  district: z.string().min(1).max(60),
  neighborhood: z.string().max(80).nullable(),
  address_or_project: z.string().max(200).nullable(),
  // Only coordinates someone verified; rounded to 5 decimals; Thailand bounding box.
  lat: z.number().min(5).max(21).nullable(),
  lng: z.number().min(97).max(106).nullable(),
  geo_precision: z.enum(["exact", "project", "district", "none"]),
  bedrooms: z.number().int().min(0).max(50).nullable(),
  bathrooms: z.number().int().min(0).max(50).nullable(),
  area_sqm: z.number().positive().nullable(),
  furnishing: z.enum(FURNISHING).nullable(),
  amenities: z.array(z.enum(AMENITIES)), // only amenities the source states; empty = not provided
  // Only photos licensed for reuse, with their credit.
  photos: z.array(z.object({ url: z.url(), credit: z.string().min(1), license: z.string().min(1) }).strict()).max(12),
  source: z.object({
    name: z.string().min(1).max(80),
    kind: z.enum(["owner", "agency", "licensed_feed"]),
    url: z.url().nullable(), // the original listing page, when there is one
    permission: z.string().min(1).max(200), // who allowed U-Estate to publish this row, e.g. "Owner email 2026-10-16"
  }).strict(),
  retrieved_at: IsoDate,
  last_verified_at: IsoDate.nullable(),
  availability: z.enum(["available", "unconfirmed", "unavailable"]),
  verification: z.enum(["uestate_verified", "third_party"]),
  link_status: z.enum(["ok", "broken", "unchecked"]),
}).strict();
export type RealListing = z.infer<typeof RealListing>;

export const RealListingsFile = z.object({
  meta: z.object({
    updated_at: z.string().min(1),
    note: z.string(),
  }).strict(),
  listings: z.array(RealListing),
});
export type RealListingsFile = z.infer<typeof RealListingsFile>;

/** Rows older than this since their last verification are shown as "availability unconfirmed" and flagged for review. */
export const STALE_AFTER_DAYS = 14;

export function isStale(l: Pick<RealListing, "last_verified_at">, now = new Date()) {
  if (!l.last_verified_at) return true;
  return now.getTime() - Date.parse(l.last_verified_at) > STALE_AFTER_DAYS * 86_400_000;
}

/** Shown as available only when someone verified it recently. */
export function availabilityShown(l: Pick<RealListing, "availability" | "last_verified_at">, now = new Date()): RealListing["availability"] {
  return l.availability === "available" && !isStale(l, now) ? "available" : l.availability === "unavailable" ? "unavailable" : "unconfirmed";
}
