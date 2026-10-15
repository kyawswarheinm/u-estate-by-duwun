// Feature design for the hedonic model (AI_SPEC §2.2). Target: log(price per m²).
// One-hot district (first district dropped), log(size), floor, building age, near rail (≤ 8 min walk), log(index at sale month).

export interface CondoSale {
  district: string;
  sizeSqm: number;
  floor: number;
  buildYear: number;
  railWalkMin: number;
  saleMonth: string; // YYYY-MM
}

export const RAIL_NEAR_MIN = 8;
/** The numeric features that "Why this price?" explains (district and market index are context, not factors). */
export const FACTOR_KEYS = ["log_size", "floor", "age", "rail_near"] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

export type IndexAt = (month: string) => number;

export function featureNames(districts: string[]): string[] {
  return ["intercept", ...districts.slice(1).map((d) => `district:${d}`), ...FACTOR_KEYS, "log_index"];
}

export function ageAt(buildYear: number, saleMonth: string) {
  return Math.max(0, Number(saleMonth.slice(0, 4)) - buildYear);
}

export function numericFeatures(x: CondoSale): Record<FactorKey, number> {
  return {
    log_size: Math.log(x.sizeSqm),
    floor: x.floor,
    age: ageAt(x.buildYear, x.saleMonth),
    rail_near: x.railWalkMin <= RAIL_NEAR_MIN ? 1 : 0,
  };
}

export function featureVector(x: CondoSale, districts: string[], indexAt: IndexAt): number[] {
  const n = numericFeatures(x);
  return [
    1,
    ...districts.slice(1).map((d) => (d === x.district ? 1 : 0)),
    ...FACTOR_KEYS.map((k) => n[k]),
    Math.log(indexAt(x.saleMonth)),
  ];
}

/** Index value for a month; months after the last published point use the latest value. */
export function indexLookup(series: { month: string; value: number }[]): IndexAt {
  const byMonth = new Map(series.map((p) => [p.month, p.value]));
  const first = series[0];
  const last = series[series.length - 1];
  return (month) => byMonth.get(month) ?? (month < first.month ? first.value : last.value);
}
