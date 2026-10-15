// Predictive engine (AI_SPEC §2.2): hedonic ridge regression on log(price per m²) plus a split-conformal range.
// Code computes every number; AI may only explain them (D-32).
import { conformalBand } from "./conformal";
import { FACTOR_KEYS, featureNames, featureVector, numericFeatures, type CondoSale, type FactorKey, type IndexAt } from "./features";
import { dot, ridge } from "./ols";

export const MODEL_VERSION = "hedonic-ols-v1";

type DistrictMeans = Record<FactorKey, number> & { floorRaw: number; railWalkMin: number };

export interface ValuationModel {
  version: string;
  propertyType: "condo";
  indexSeries: "condo_bkk";
  isSynthetic: boolean;
  districts: string[];
  featureNames: string[];
  beta: number[];
  band: { q10: number; q90: number; n: number };
  districtMeans: Record<string, DistrictMeans>;
}

const logPrice = (r: { pricePerSqm: number }) => Math.log(r.pricePerSqm);

/** Fits on the training split and calibrates the range on the calibration split (never on test data). */
export function fitModel(
  train: (CondoSale & { pricePerSqm: number })[],
  calibration: (CondoSale & { pricePerSqm: number })[],
  indexAt: IndexAt,
  opts: { isSynthetic: boolean; lambda?: number },
): ValuationModel {
  const districts = [...new Set(train.map((r) => r.district))].sort();
  const beta = ridge(train.map((r) => featureVector(r, districts, indexAt)), train.map(logPrice), opts.lambda ?? 1e-3);

  const districtMeans: Record<string, DistrictMeans> = {};
  for (const d of districts) {
    const rows = train.filter((r) => r.district === d);
    const avg = (f: (r: CondoSale) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;
    districtMeans[d] = {
      ...(Object.fromEntries(FACTOR_KEYS.map((k) => [k, avg((r) => numericFeatures(r)[k])])) as Record<FactorKey, number>),
      floorRaw: avg((r) => r.floor),
      railWalkMin: avg((r) => r.railWalkMin),
    };
  }

  const partial = { districts, beta } as Pick<ValuationModel, "districts" | "beta">;
  const residuals = calibration
    .filter((r) => districts.includes(r.district))
    .map((r) => logPrice(r) - Math.log(predictPerSqm(partial, r, indexAt)));

  return {
    version: MODEL_VERSION,
    propertyType: "condo",
    indexSeries: "condo_bkk",
    isSynthetic: opts.isSynthetic,
    districts,
    featureNames: featureNames(districts),
    beta,
    band: conformalBand(residuals),
    districtMeans,
  };
}

export function predictPerSqm(model: Pick<ValuationModel, "districts" | "beta">, x: CondoSale, indexAt: IndexAt): number {
  return Math.exp(dot(model.beta, featureVector(x, model.districts, indexAt)));
}

export interface EstimateInput {
  type: string;
  district: string;
  sizeSqm: number;
  month: string; // YYYY-MM, usually the latest index month
  floor?: number;
  buildYear?: number;
  railWalkMin?: number;
}

export type Estimate =
  | { available: false; reason: string }
  | {
      available: true;
      likelyThb: number;
      lowThb: number;
      highThb: number;
      likelyPerSqm: number;
      /** Inputs the listing did not provide, filled with the district average from the training data. */
      imputed: ("floor" | "build_year" | "rail_walk_min")[];
      sale: CondoSale;
      modelVersion: string;
      isSynthetic: boolean;
    };

const roundTo = (v: number, step: number) => Math.round(v / step) * step;

export function estimate(model: ValuationModel, input: EstimateInput, indexAt: IndexAt): Estimate {
  if (input.type !== model.propertyType) return { available: false, reason: `Not enough data: the model is trained on condos only, not ${input.type}s.` };
  const means = model.districtMeans[input.district];
  if (!means) return { available: false, reason: `Not enough data: no sales in ${input.district} in the training data.` };
  if (!(input.sizeSqm > 0)) return { available: false, reason: "Not enough data: the size is missing." };

  const imputed: ("floor" | "build_year" | "rail_walk_min")[] = [];
  const saleYear = Number(input.month.slice(0, 4));
  const floor = input.floor ?? (imputed.push("floor"), Math.round(means.floorRaw));
  const buildYear = input.buildYear ?? (imputed.push("build_year"), saleYear - Math.round(means.age));
  const railWalkMin = input.railWalkMin ?? (imputed.push("rail_walk_min"), Math.round(means.railWalkMin));
  const sale: CondoSale = { district: input.district, sizeSqm: input.sizeSqm, floor, buildYear, railWalkMin, saleMonth: input.month };

  const perSqm = predictPerSqm(model, sale, indexAt);
  const likely = perSqm * input.sizeSqm;
  return {
    available: true,
    likelyThb: roundTo(likely, 1000),
    lowThb: roundTo(likely * Math.exp(model.band.q10), 1000),
    highThb: roundTo(likely * Math.exp(model.band.q90), 1000),
    likelyPerSqm: Math.round(perSqm),
    imputed,
    sale,
    modelVersion: model.version,
    isSynthetic: model.isSynthetic,
  };
}

export type ValueBadge = "scam_alert" | "good_value" | "fair" | "overpriced";

/** Badge on asking ÷ likely − 1 (AI_SPEC §2.2; the scam threshold is R11 in §4.2). */
export function valueBadge(askingThb: number, likelyThb: number): { badge: ValueBadge; diffPct: number } {
  const diff = askingThb / likelyThb - 1;
  const diffPct = Math.round(diff * 1000) / 10;
  if (diff <= -0.25) return { badge: "scam_alert", diffPct };
  if (diff <= -0.03) return { badge: "good_value", diffPct };
  if (diff >= 0.05) return { badge: "overpriced", diffPct };
  return { badge: "fair", diffPct };
}
