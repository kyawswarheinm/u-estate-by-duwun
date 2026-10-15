// Owner: P2 (docs/WORKPLAN.md). Reads the descriptive stats and the TimesFM forecast snapshots.
// Starter version works on the fixtures; P2 improves it (P2T05). Keep the exported names and shapes stable for P3.
import { z } from "zod";
import { MARKET_FORECAST, MARKET_STATS, MarketKind, MarketType } from "./index";

export const FORECAST_NOTE = "A forecast from past index movement, not a guarantee.";

export const MarketStatsSchema = z.object({
  type: MarketType,
  kind: MarketKind.default("sale"),
  district: z.string().max(60).optional().describe("District name, e.g. Sathorn. Leave out for every district"),
});
export type MarketStatsQuery = z.input<typeof MarketStatsSchema>;

export function getMarketStats(input: MarketStatsQuery) {
  const q = MarketStatsSchema.parse(input);
  const find = (district: string) => MARKET_STATS.by_area.find((r) => r.type === q.type && r.kind === q.kind && r.district.toLowerCase() === district.toLowerCase()) ?? null;
  return {
    area: q.district ? find(q.district) : null,
    all_districts: find("ALL"),
    districts_available: MARKET_STATS.by_area.filter((r) => r.type === q.type && r.kind === q.kind && r.district !== "ALL").map((r) => r.district),
    is_sample: MARKET_STATS.meta.is_sample,
    based_on: MARKET_STATS.meta.based_on,
    method: MARKET_STATS.meta.method,
    note: "Asking prices from listing websites, not sale prices.",
  };
}

export const PriceForecastSchema = z.object({
  type: MarketType,
  months_ahead: z.number().int().min(1).max(24).default(12),
});
export type PriceForecastQuery = z.input<typeof PriceForecastSchema>;

export function getPriceForecast(input: PriceForecastQuery) {
  const q = PriceForecastSchema.parse(input);
  const s = MARKET_FORECAST.series.find((x) => x.type === q.type);
  if (!s) return { available: false as const, reason: `No forecast series for ${q.type}`, series_available: MARKET_FORECAST.series.map((x) => x.type) };
  const last = s.history[s.history.length - 1];
  const point = s.forecast[Math.min(q.months_ahead, s.forecast.length) - 1];
  const pct = (v: number) => Math.round(((v - last.value) / last.value) * 1000) / 10;
  return {
    available: true as const,
    series: s.label, region: s.region, unit: s.unit,
    last_actual: last,
    forecast: point,
    change_pct: { low: pct(point.p10), central: pct(point.p50), high: pct(point.p90) },
    interval: "p10 to p90 (80% range)",
    model: MARKET_FORECAST.meta.model,
    source: MARKET_FORECAST.meta.series_source,
    is_sample: MARKET_FORECAST.meta.is_sample,
    note: FORECAST_NOTE,
  };
}

/** Where a price per sqm sits against the district's asking prices. Used by P3 on the listing page and in tools. */
export function compareToMarket(input: { priceThb: number; areaSqm: number; district: string; type: z.infer<typeof MarketType>; kind?: z.infer<typeof MarketKind> }) {
  const stats = getMarketStats({ type: input.type, kind: input.kind ?? "sale", district: input.district });
  const row = stats.area ?? stats.all_districts;
  if (!row) return { available: false as const, reason: "No market data for this type yet" };
  const pps = input.priceThb / input.areaSqm;
  const diffPct = Math.round(((pps - row.median_price_per_sqm) / row.median_price_per_sqm) * 1000) / 10;
  return {
    available: true as const,
    price_per_sqm: Math.round(pps),
    compared_with: row.district === "ALL" ? "all districts" : row.district,
    median_price_per_sqm: row.median_price_per_sqm,
    listings_compared: row.count,
    diff_pct: diffPct,
    position: pps < row.p25_price_per_sqm ? "below most" : pps > row.p75_price_per_sqm ? "above most" : "in the middle range",
    is_sample: stats.is_sample,
    note: "Compared with asking prices on listing websites, not sale prices.",
  };
}
