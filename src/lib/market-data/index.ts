// Loads the market-intelligence snapshots (offline pipeline output, docs/TECH_STACK.md) and validates them
// against the shared contract once, at import. A file that breaks the contract fails here and in contract.test.ts.
import listingsJson from "../../data/market/listings.json";
import statsJson from "../../data/market/stats.json";
import forecastJson from "../../data/market/forecast.json";
import { ForecastFile, ListingsFile, StatsFile } from "./types";

export const MARKET_LISTINGS = ListingsFile.parse(listingsJson);
export const MARKET_STATS = StatsFile.parse(statsJson);
export const MARKET_FORECAST = ForecastFile.parse(forecastJson);

/** Provenance every tool answer carries, so the AI can say where a number came from and how old it is. */
export function provenance() {
  return {
    listings: { source: MARKET_LISTINGS.meta.source, is_sample: MARKET_LISTINGS.meta.is_sample, scraped_at: MARKET_LISTINGS.meta.scraped_at, sites: MARKET_LISTINGS.meta.sites.map((s) => s.name) },
    stats: { source: MARKET_STATS.meta.source, is_sample: MARKET_STATS.meta.is_sample, generated_at: MARKET_STATS.meta.generated_at },
    forecast: { source: MARKET_FORECAST.meta.source, is_sample: MARKET_FORECAST.meta.is_sample, model: MARKET_FORECAST.meta.model, series_source: MARKET_FORECAST.meta.series_source },
  };
}

export * from "./types";
