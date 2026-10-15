// Price forecast from the price index (AI_SPEC §2.2). "Based on past index movement, not a guarantee."
// g = slope of log(index) over the last 60 months × 12; σ = std-dev of 12-month log changes.
// For t in years: central = V·e^{g t}, range = V·e^{g t ± 1.28 σ √t} (≈80%).

export const FORECAST_NOTE = "Based on past index movement, not a guarantee.";

export interface ForecastPoint {
  years: number;
  centralThb: number;
  lowThb: number;
  highThb: number;
}

export function indexGrowth(series: { value: number }[]) {
  const recent = series.slice(-60);
  const n = recent.length;
  if (n < 13) throw new Error("Need at least 13 months of index data");
  const ys = recent.map((p) => Math.log(p.value));
  const mx = (n - 1) / 2;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  ys.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; });
  const g = (sxy / sxx) * 12;

  const changes = series.slice(12).map((p, i) => Math.log(p.value) - Math.log(series[i].value));
  const mc = changes.reduce((a, b) => a + b, 0) / changes.length;
  const sigma = changes.length > 1 ? Math.sqrt(changes.reduce((s, c) => s + (c - mc) ** 2, 0) / (changes.length - 1)) : 0;
  return { g, sigma };
}

export function forecast(series: { value: number }[], valueThb: number, horizons = [1, 3, 5]) {
  const { g, sigma } = indexGrowth(series);
  const round = (v: number) => Math.round(v / 1000) * 1000;
  const points: ForecastPoint[] = horizons.map((t) => ({
    years: t,
    centralThb: round(valueThb * Math.exp(g * t)),
    lowThb: round(valueThb * Math.exp(g * t - 1.28 * sigma * Math.sqrt(t))),
    highThb: round(valueThb * Math.exp(g * t + 1.28 * sigma * Math.sqrt(t))),
  }));
  return { annualGrowthPct: Math.round(g * 1000) / 10, sigma, points, note: FORECAST_NOTE };
}
