// Market page search state: Buy/Rent mode, price and size ranges, multi-select property types, location, rooms,
// furnishing, amenities and whether SAMPLE data is shown. Parsed from the URL so filters survive the back button,
// links to a listing and sharing. Code filters; nothing is invented. A listing whose value is unknown never matches
// a filter on that value.
import { AMENITIES, FURNISHING, PROPERTY_TYPES } from "./listings/schema";

export const LISTING_TYPES = PROPERTY_TYPES;
export type ListingType = (typeof LISTING_TYPES)[number];
export type Furnishing = (typeof FURNISHING)[number];
export type Amenity = (typeof AMENITIES)[number];
export type MarketMode = "buy" | "rent";

/** Rentals start here: the default and lowest monthly rent the filters accept. */
export const RENT_FLOOR_THB = 3_000;

/** Quick price ranges. `null` = no upper limit. Monthly rent in rent mode, total price in buy mode. */
export const PRICE_PRESETS: Record<MarketMode, [number, number | null][]> = {
  rent: [
    [3_000, 5_000], [5_000, 8_000], [8_000, 12_000], [12_000, 15_000], [15_000, 20_000],
    [20_000, 30_000], [30_000, 50_000], [50_000, 100_000], [100_000, null],
  ],
  buy: [
    [0, 2_000_000], [2_000_000, 3_000_000], [3_000_000, 5_000_000], [5_000_000, 8_000_000],
    [8_000_000, 12_000_000], [12_000_000, 20_000_000], [20_000_000, null],
  ],
};

export type MarketSearch = {
  mode: MarketMode;
  q: string;
  province: string;
  district: string;
  types: ListingType[];
  minPrice: number | null;
  maxPrice: number | null;
  minArea: number | null;
  maxArea: number | null;
  page: number;
  minBeds: number | null;
  minBaths: number | null;
  furnishing: Furnishing | null;
  amenities: Amenity[];
  /** Show the synthetic SAMPLE listings and the statistics computed from them (off by default). */
  sample: boolean;
  /** The maximum was below the minimum, so it was ignored. */
  priceError: boolean;
  areaError: boolean;
};

type Params = Record<string, string | string[] | undefined>;
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
const one = (v: string | string[] | undefined) => all(v)[0]?.trim() ?? "";
const positive = (v: string | string[] | undefined) => {
  const n = Number(one(v).replace(/[,\s฿]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function parseMarketSearch(sp: Params): MarketSearch {
  // `kind=sale|rent` is the older parameter (links from U-Pal and the voice agent still use it).
  const mode: MarketMode = one(sp.mode) === "rent" || (!one(sp.mode) && one(sp.kind) === "rent") ? "rent" : "buy";
  const types = [...new Set(all(sp.type).flatMap((t) => t.split(",")))].filter((t): t is ListingType => (LISTING_TYPES as readonly string[]).includes(t));

  let minPrice = positive(sp.minPrice);
  if (mode === "rent") minPrice = Math.max(minPrice ?? RENT_FLOOR_THB, RENT_FLOOR_THB);
  let maxPrice = positive(sp.maxPrice);
  const priceError = maxPrice !== null && minPrice !== null && maxPrice < minPrice;
  if (priceError) maxPrice = null;

  const minArea = positive(sp.minArea);
  let maxArea = positive(sp.maxArea);
  const areaError = maxArea !== null && minArea !== null && maxArea < minArea;
  if (areaError) maxArea = null;

  return {
    mode,
    q: one(sp.q).slice(0, 80),
    province: one(sp.province).slice(0, 60),
    district: one(sp.district).slice(0, 60),
    types,
    minPrice,
    maxPrice,
    minArea,
    maxArea,
    page: Math.max(1, Number.parseInt(one(sp.page), 10) || 1),
    minBeds: positive(sp.beds),
    minBaths: positive(sp.baths),
    furnishing: (FURNISHING as readonly string[]).includes(one(sp.furnishing)) ? (one(sp.furnishing) as Furnishing) : null,
    amenities: [...new Set(all(sp.amenity))].filter((a): a is Amenity => (AMENITIES as readonly string[]).includes(a)),
    sample: one(sp.sample) === "1",
    priceError,
    areaError,
  };
}

export type Searchable = {
  kind: "sale" | "rent"; type: string; priceThb: number; areaSqm: number | null; district: string; province: string; name: string;
  bedrooms?: number | null; bathrooms?: number | null; furnishing?: string | null; amenities?: string[];
};

export function matchesSearch(s: MarketSearch, x: Searchable) {
  const q = s.q.toLowerCase();
  const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  return (
    x.kind === (s.mode === "rent" ? "rent" : "sale") &&
    (s.types.length === 0 || (s.types as string[]).includes(x.type)) &&
    (s.minPrice === null || x.priceThb >= s.minPrice) &&
    (s.maxPrice === null || x.priceThb <= s.maxPrice) &&
    (s.minArea === null || (x.areaSqm != null && x.areaSqm >= s.minArea)) &&
    (s.maxArea === null || (x.areaSqm != null && x.areaSqm <= s.maxArea)) &&
    (s.minBeds === null || (x.bedrooms != null && x.bedrooms >= s.minBeds)) &&
    (s.minBaths === null || (x.bathrooms != null && x.bathrooms >= s.minBaths)) &&
    (s.furnishing === null || x.furnishing === s.furnishing) &&
    s.amenities.every((a) => x.amenities?.includes(a)) &&
    (!s.province || eq(x.province, s.province)) &&
    (!s.district || eq(x.district, s.district)) &&
    (!q || [x.district, x.province, x.name].some((v) => v.toLowerCase().includes(q)) || q.includes(x.district.toLowerCase()))
  );
}

/** URL for a search, with some fields changed. Defaults are left out so URLs stay short. */
export function searchHref(s: MarketSearch, change: Partial<MarketSearch> = {}) {
  const n = { ...s, ...change };
  const p = new URLSearchParams();
  if (n.mode === "rent") p.set("mode", "rent");
  if (n.q) p.set("q", n.q);
  if (n.province) p.set("province", n.province);
  if (n.district) p.set("district", n.district);
  for (const t of n.types) p.append("type", t);
  if (n.minPrice !== null && !(n.mode === "rent" && n.minPrice === RENT_FLOOR_THB)) p.set("minPrice", String(n.minPrice));
  if (n.maxPrice !== null) p.set("maxPrice", String(n.maxPrice));
  if (n.minArea !== null) p.set("minArea", String(n.minArea));
  if (n.maxArea !== null) p.set("maxArea", String(n.maxArea));
  if (n.minBeds !== null) p.set("beds", String(n.minBeds));
  if (n.minBaths !== null) p.set("baths", String(n.minBaths));
  if (n.furnishing) p.set("furnishing", n.furnishing);
  for (const a of n.amenities) p.append("amenity", a);
  if (n.sample) p.set("sample", "1");
  if (n.page > 1) p.set("page", String(n.page));
  const qs = p.toString();
  return qs ? `/market?${qs}` : "/market";
}

/** Switching Buy/Rent keeps location and types; price ranges don't carry over (monthly rent vs total price). */
export function switchModeHref(s: MarketSearch, mode: MarketMode) {
  return searchHref(s, { mode, minPrice: mode === "rent" ? RENT_FLOOR_THB : null, maxPrice: null, page: 1 });
}

export const hasFilters = (s: MarketSearch) =>
  Boolean(s.q || s.province || s.district || s.types.length || s.maxPrice !== null || s.minArea !== null || s.maxArea !== null ||
    s.minBeds !== null || s.minBaths !== null || s.furnishing || s.amenities.length || (s.minPrice !== null && !(s.mode === "rent" && s.minPrice === RENT_FLOOR_THB)));

const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Per-m² and size medians use only listings that state a floor area; null when none do. */
export type RentRow = { district: string; count: number; medianRentThb: number; medianRentPerSqm: number | null; medianAreaSqm: number | null };

/**
 * Descriptive rent statistics from rental listings (monthly asking rents). A district (and the overall row) needs at
 * least `minCount` listings, the same threshold as the sale statistics; below that there is nothing honest to show.
 */
export function rentStats(items: { district: string; priceThb: number; areaSqm: number | null }[], minCount: number) {
  const row = (district: string, xs: typeof items): RentRow => {
    const sized = xs.filter((x): x is typeof x & { areaSqm: number } => x.areaSqm != null && x.areaSqm > 0);
    return {
      district,
      count: xs.length,
      medianRentThb: Math.round(median(xs.map((x) => x.priceThb))),
      medianRentPerSqm: sized.length ? Math.round(median(sized.map((x) => x.priceThb / x.areaSqm))) : null,
      medianAreaSqm: sized.length ? Math.round(median(sized.map((x) => x.areaSqm))) : null,
    };
  };
  const byDistrict = new Map<string, typeof items>();
  for (const x of items) byDistrict.set(x.district, [...(byDistrict.get(x.district) ?? []), x]);
  const districts = [...byDistrict].filter(([, xs]) => xs.length >= minCount).map(([d, xs]) => row(d, xs)).sort((a, b) => a.medianRentThb - b.medianRentThb);
  const bands = PRICE_PRESETS.rent.map(([from, to]) => ({ from, to, count: items.filter((x) => x.priceThb >= from && (to === null || x.priceThb < to)).length }));
  return { count: items.length, overall: items.length >= minCount ? row("ALL", items) : null, districts, bands };
}

/** Tenant budget arithmetic. The guideline is a rule of thumb the user sets, not an approval rule. */
export function rentAffordability(input: { income: number; rent: number; depositMonths: number; advanceMonths: number; utilities: number; guidelinePct: number }) {
  const { income, rent, depositMonths, advanceMonths, utilities, guidelinePct } = input;
  const rentSharePct = income > 0 ? Math.round((rent / income) * 1000) / 10 : null;
  return {
    rentSharePct,
    withinGuideline: rentSharePct === null ? null : rentSharePct <= guidelinePct,
    guidelineRentThb: Math.round((income * guidelinePct) / 100),
    moveInThb: Math.round(rent * (depositMonths + advanceMonths)),
    monthlyThb: Math.round(rent + utilities),
  };
}
