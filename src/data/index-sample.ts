// Price index for the price panel, the listing chart and the valuation (P2T07, 16 Oct 2026).
// REAL DATA: Bank of Thailand Residential Property Price Index (table EC_EI_008_S4), Bangkok and vicinities,
// 2011 = 100, monthly. Downloaded by pipeline/analytics/fetch_bot.py (see pipeline/analytics/data/SOURCE.md);
// the history is read from src/data/market/forecast.json so the app and the forecast share one copy.
// The file keeps its old name because many modules import it.
import forecastJson from "./market/forecast.json";

type Point = { month: string; value: number };

const BOT = forecastJson.series;

export const INDEX_SOURCE = {
  label: `${forecastJson.meta.series_source} (2011 = 100)`,
  isSample: forecastJson.meta.is_sample,
};

const SERIES: Record<string, Point[]> = Object.fromEntries(
  BOT.map((s) => [s.key, s.history.map((p) => ({ month: p.period, value: p.value }))]),
);

if (!SERIES.condo_bkk || !SERIES.house_bkk) throw new Error("forecast.json must contain condo_bkk and house_bkk");

export function indexSeries(key: string): Point[] {
  return SERIES[key] ?? SERIES.condo_bkk;
}
