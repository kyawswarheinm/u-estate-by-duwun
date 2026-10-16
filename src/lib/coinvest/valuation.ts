// Co-Invest valuations, computed by code from the Bank of Thailand residential price index (D-32): an offering's
// value moves with the index for its property type since it was funded. This is an index-tracked ESTIMATE of one
// property, not an appraisal; the forecast is the index forecast (p10–p90) scaled to that value, not a guarantee.
import { MARKET_FORECAST, type ForecastSeries } from "../market-data";
import type { CoinvestOffering, PropertyType } from "../types";
import { round2 } from "./engine";

export function seriesFor(type: PropertyType): ForecastSeries {
  const key = type === "condo" ? "condo_bkk" : type === "townhouse" ? "townhouse_bkk" : "house_bkk";
  return MARKET_FORECAST.series.find((s) => s.key === key) ?? MARKET_FORECAST.series[0];
}

/** Index value for a month, or the closest earlier month that has one. */
export function indexAt(series: ForecastSeries, month: string) {
  let found: number | null = null;
  for (const p of series.history) {
    if (p.period > month) break;
    found = p.value;
  }
  return found ?? series.history[0].value;
}

export const latestMonth = (series: ForecastSeries) => series.history.at(-1)!.period;

/** The estimated value at `month`: the funding value moved by the index since the funding month. */
export function valueAt(o: Pick<CoinvestOffering, "baseValueThb" | "baseMonth">, type: PropertyType, month: string) {
  const s = seriesFor(type);
  return Math.round((o.baseValueThb * indexAt(s, month)) / indexAt(s, o.baseMonth));
}

/** The value the seed stores as current_value_thb (the latest published index month). */
export function currentValuation(o: Pick<CoinvestOffering, "baseValueThb" | "baseMonth">, type: PropertyType) {
  const s = seriesFor(type);
  const month = latestMonth(s);
  return { valueThb: valueAt(o, type, month), month };
}

/** Monthly history since funding, plus the scaled forecast range. For the valuation chart. */
export function valuationSeries(o: Pick<CoinvestOffering, "baseValueThb" | "baseMonth" | "currentValueThb">, type: PropertyType) {
  const s = seriesFor(type);
  const base = indexAt(s, o.baseMonth);
  const history = s.history.filter((p) => p.period >= o.baseMonth).map((p) => ({ month: p.period, valueThb: Math.round((o.baseValueThb * p.value) / base) }));
  const last = history.at(-1);
  const scale = last ? last.valueThb / indexAt(s, last.month) : o.baseValueThb / base;
  const forecast = s.forecast.slice(0, 12).map((f) => ({ month: f.period, p10: Math.round(f.p10 * scale), p50: Math.round(f.p50 * scale), p90: Math.round(f.p90 * scale) }));
  const changePct = last ? round2(((last.valueThb - o.baseValueThb) / o.baseValueThb) * 100) : 0;
  return { history, forecast, changePct, source: MARKET_FORECAST.meta.series_source, model: MARKET_FORECAST.meta.model, indexLabel: s.label };
}
