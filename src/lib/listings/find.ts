// Search over real third-party listings for U-Pal (typed chat and voice): the same rows the Market page shows.
// Returns only stated facts, with source, links, verification and availability, so the assistant never fills gaps.
import { z } from "zod";
import { AMENITIES, availabilityShown, FURNISHING, PropertyType, type RealListing } from "./schema";
import { googleMapsLink } from "./maps";
import { REAL_LISTINGS } from "./index";

export const RealListingSearchSchema = z.object({
  kind: z.enum(["sale", "rent"]).optional().describe("sale or rent. Rent prices are per month."),
  types: z.array(PropertyType).max(10).optional().describe("Property types, e.g. [\"condo\", \"apartment\"]"),
  district: z.string().max(60).optional().describe("District, neighbourhood or project words, e.g. Bang Kapi"),
  min_price_thb: z.number().positive().optional(),
  max_price_thb: z.number().positive().optional().describe("Budget ceiling in THB (monthly when kind is rent)"),
  min_bedrooms: z.number().int().min(0).optional(),
  min_bathrooms: z.number().int().min(0).optional(),
  furnishing: z.enum(FURNISHING).optional(),
  amenities: z.array(z.enum(AMENITIES)).max(10).optional().describe("Only listings that state all of these"),
  ids: z.array(z.string().max(40)).max(5).optional().describe("Fetch these listing ids, e.g. to compare two listings"),
  limit: z.number().int().min(1).max(10).default(5),
});
export type RealListingSearch = z.input<typeof RealListingSearchSchema>;

const NOTE =
  "Third-party listings imported with the source's permission. Not independently verified by U-Estate unless verification is uestate_verified. " +
  "Only say a listing is available when availability is 'available'. Null fields are not provided: never guess them. " +
  "Distance to BTS/MRT is not recorded. Always give the source and original_url when you mention a listing.";

export function summariseRealListing(l: RealListing, now = new Date()) {
  const maps = googleMapsLink({ lat: l.lat, lng: l.lng, precision: l.geo_precision, project: l.address_or_project, district: l.district, province: l.province });
  return {
    id: l.id, name: l.name, type: l.type, kind: l.kind, price_thb: l.price_thb, price_unit: l.kind === "rent" ? "THB per month" : "THB",
    province: l.province, district: l.district, neighborhood: l.neighborhood, project: l.address_or_project,
    bedrooms: l.bedrooms, bathrooms: l.bathrooms, area_sqm: l.area_sqm, furnishing: l.furnishing, amenities: l.amenities.length ? l.amenities : null,
    availability: availabilityShown(l, now), verification: l.verification,
    source: l.source.name, original_url: l.source.url, google_maps_url: maps?.url ?? null,
    google_maps_precision: maps?.precision ?? null, // "area" = district search, not the building
    last_verified_at: l.last_verified_at, retrieved_at: l.retrieved_at, detail_url: `/market/${l.id}`,
  };
}

export function findRealListings(input: RealListingSearch = {}, rows: RealListing[] = REAL_LISTINGS.listings, now = new Date()) {
  const f = RealListingSearchSchema.parse(input);
  const place = f.district?.trim().toLowerCase();
  const matches = rows
    .filter((l) => !f.ids || f.ids.includes(l.id))
    .filter((l) => (!f.kind || l.kind === f.kind) && (!f.types?.length || f.types.includes(l.type)))
    .filter((l) => !place || [l.district, l.neighborhood, l.address_or_project, l.name].some((v) => v?.toLowerCase().includes(place)))
    .filter((l) => (!f.min_price_thb || l.price_thb >= f.min_price_thb) && (!f.max_price_thb || l.price_thb <= f.max_price_thb))
    .filter((l) => (f.min_bedrooms == null || (l.bedrooms != null && l.bedrooms >= f.min_bedrooms)) && (f.min_bathrooms == null || (l.bathrooms != null && l.bathrooms >= f.min_bathrooms)))
    .filter((l) => (!f.furnishing || l.furnishing === f.furnishing) && (f.amenities ?? []).every((a) => l.amenities.includes(a)))
    .filter((l) => availabilityShown(l, now) !== "unavailable")
    .sort((a, b) => a.price_thb - b.price_thb || a.id.localeCompare(b.id));
  return {
    total_matches: matches.length,
    results: matches.slice(0, f.limit).map((l) => summariseRealListing(l, now)),
    note: rows.length === 0
      ? "No third-party listings have been imported yet. Say so; do not suggest any outside listings."
      : matches.length ? NOTE : `No third-party listings match. Say so and suggest widening the filters. ${NOTE}`,
  };
}
