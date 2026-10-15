// Shared contract for the market-intelligence layer (docs/WORKPLAN.md §3, docs/TECH_STACK.md).
// P1 writes src/data/market/listings.json, P2 writes stats.json + forecast.json, P3 reads them through ./index.ts.
// Change this file only when all three developers agree, in a small PR to main that everyone pulls.
import { z } from "zod";

export const MARKET_TYPES = ["condo", "house", "townhouse", "land"] as const;
export const MarketType = z.enum(MARKET_TYPES);
export const MarketKind = z.enum(["sale", "rent"]);
export type MarketType = z.infer<typeof MarketType>;
export type MarketKind = z.infer<typeof MarketKind>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "ISO date, e.g. 2026-10-16");
const Period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/, "YYYY-MM or YYYY-Q1..Q4");

// ---------- P1: scraped market listings (facts only: no descriptions, photos or agent details) ----------

export const SourceSite = z.object({
  name: z.string().min(1),
  url: z.url(),
  robots_checked_at: IsoDate,
}).strict();

export const MarketListing = z.object({
  id: z.string().regex(/^ext-[a-z0-9-]+$/, "ext-<site>-<hash>"),
  site: z.string().min(1),
  source_url: z.url(),
  kind: MarketKind,
  type: MarketType,
  project: z.string().max(120).nullable(),
  district: z.string().min(1),
  province: z.string().min(1),
  // Rounded to 3 decimals (~100 m). Thailand bounding box.
  lat: z.number().min(5).max(21).nullable(),
  lng: z.number().min(97).max(106).nullable(),
  geo_precision: z.enum(["exact", "project", "district", "none"]),
  price_thb: z.number().positive(), // sale price, or monthly rent when kind = "rent"
  area_sqm: z.number().positive(),
  price_per_sqm: z.number().positive(),
  bedrooms: z.number().int().min(0).nullable(),
  listed_at: IsoDate.nullable(),
  scraped_at: z.string().min(1),
}).strict(); // unknown keys (agent_name, phone, line_id, description...) are rejected
export type MarketListing = z.infer<typeof MarketListing>;

export const ListingsFile = z.object({
  meta: z.object({
    source: z.enum(["fixture", "scrape"]),
    is_sample: z.boolean(),
    sites: z.array(SourceSite),
    scraped_at: z.string().min(1),
    note: z.string(),
  }).strict(),
  listings: z.array(MarketListing),
});
export type ListingsFile = z.infer<typeof ListingsFile>;

// ---------- P2: descriptive market analysis ----------

export const AreaStats = z.object({
  district: z.string().min(1), // "ALL" = every district in the snapshot
  type: MarketType,
  kind: MarketKind,
  count: z.number().int().min(1),
  median_price_per_sqm: z.number().positive(),
  p25_price_per_sqm: z.number().positive(),
  p75_price_per_sqm: z.number().positive(),
  median_price_thb: z.number().positive(),
  median_area_sqm: z.number().positive(),
}).strict();
export type AreaStats = z.infer<typeof AreaStats>;

export const StatsFile = z.object({
  meta: z.object({
    source: z.enum(["fixture", "analysis"]),
    is_sample: z.boolean(),
    based_on: z.string(), // e.g. "listings.json scraped_at 2026-10-16T07:30+07:00, 412 listings"
    generated_at: z.string().min(1),
    method: z.string(),
    min_count: z.number().int().min(1), // rows with fewer listings are left out
  }).strict(),
  by_area: z.array(AreaStats),
});
export type StatsFile = z.infer<typeof StatsFile>;

// ---------- P2: price forecast (TimesFM) ----------

export const ForecastSeries = z.object({
  key: z.string().regex(/^[a-z0-9_]+$/), // e.g. "condo_bkk"
  type: MarketType,
  region: z.string().min(1),
  label: z.string().min(1),
  unit: z.string().min(1), // e.g. "index, 2021 = 100"
  history: z.array(z.object({ period: Period, value: z.number() }).strict()).min(12),
  forecast: z.array(z.object({ period: Period, p10: z.number(), p50: z.number(), p90: z.number() }).strict()).min(1),
}).strict();
export type ForecastSeries = z.infer<typeof ForecastSeries>;

export const ForecastFile = z.object({
  meta: z.object({
    source: z.enum(["fixture", "timesfm", "fallback"]),
    is_sample: z.boolean(),
    model: z.string(), // e.g. "TimesFM 3.0 (google/timesfm-3.0-pytorch)"
    series_source: z.string(), // e.g. "Bank of Thailand, Residential Property Price Index"
    series_url: z.string(),
    downloaded_at: z.string(),
    generated_at: z.string().min(1),
    frequency: z.enum(["monthly", "quarterly"]),
    backtest: z.object({ holdout_periods: z.number().int().min(1), mape_model_pct: z.number(), mape_baseline_pct: z.number(), baseline: z.string() }).strict().nullable(),
    note: z.string(),
  }).strict(),
  series: z.array(ForecastSeries),
});
export type ForecastFile = z.infer<typeof ForecastFile>;
