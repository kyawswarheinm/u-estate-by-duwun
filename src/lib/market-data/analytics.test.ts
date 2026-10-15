// P2 checks for the analytics functions. Data-driven: they hold for the fixture and for the real snapshots.
import { describe, expect, it } from "vitest";
import { MARKET_FORECAST, MARKET_STATS } from "./index";
import { compareToMarket, getMarketStats, getPriceForecast } from "./analytics";

const series = MARKET_FORECAST.series[0];

describe("getPriceForecast", () => {
  it("reports the last 12 months of the index from the history", () => {
    const h = series.history;
    const expected = Math.round(((h[h.length - 1].value - h[h.length - 13].value) / h[h.length - 13].value) * 1000) / 10;
    const f = getPriceForecast({ type: series.type });
    expect(f.available && f.last_12m_change_pct).toBe(expected);
  });

  it("clamps the horizon to the forecast it has and says so", () => {
    const f = getPriceForecast({ type: series.type, months_ahead: 24 });
    if (!f.available) throw new Error("expected a forecast");
    expect(f.months_ahead_used).toBe(series.forecast.length);
    expect(f.forecast.period).toBe(series.forecast[series.forecast.length - 1].period);
    expect(f.change_pct.low).toBeLessThanOrEqual(f.change_pct.central);
    expect(f.change_pct.central).toBeLessThanOrEqual(f.change_pct.high);
  });

  it("carries the backtest accuracy exactly as the script wrote it", () => {
    const f = getPriceForecast({ type: series.type });
    if (!f.available) throw new Error("expected a forecast");
    const bt = MARKET_FORECAST.meta.backtest;
    expect(f.accuracy?.mean_abs_error_pct ?? null).toBe(bt?.mape_model_pct ?? null);
    expect(f.note).toMatch(/not a guarantee/i);
  });

  it("says unavailable for a type without a series", () => {
    expect(getPriceForecast({ type: "land" }).available).toBe(false);
  });
});

describe("getMarketStats", () => {
  const row = MARKET_STATS.by_area.find((r) => r.district !== "ALL");

  it("matches districts case-insensitively", () => {
    if (!row) return; // a snapshot with only city-wide rows has nothing to match
    const r = getMarketStats({ type: row.type, kind: row.kind, district: row.district.toLowerCase() });
    expect(r.area?.district).toBe(row.district);
  });

  it("adds the regional index trend for types with a series, labelled with its period", () => {
    const r = getMarketStats({ type: series.type });
    expect(r.regional_index_trend?.to).toBe(series.history[series.history.length - 1].period);
    expect(getMarketStats({ type: "land" }).regional_index_trend).toBeNull();
  });
});

describe("compareToMarket", () => {
  it("falls back to all districts when the district has no row", () => {
    const all = MARKET_STATS.by_area.find((r) => r.district === "ALL")!;
    const r = compareToMarket({ priceThb: all.median_price_per_sqm * 50, areaSqm: 50, district: "Nowhere", type: all.type, kind: all.kind });
    expect(r.available && r.compared_with).toBe("all districts");
    expect(r.available && r.diff_pct).toBe(0);
  });
});
