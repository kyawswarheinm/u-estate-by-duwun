// Entry point for pages and tools (T08 wires this into the listing page). Uses the model fitted by
// `npm run eval:valuation`; nothing here is trained at request time.
import { indexSeries } from "../../data/index-sample";
import modelCardJson from "../../data/model-card.json";
import modelJson from "../../data/valuation-model.json";
import { explainFactors, type Factor } from "./factors";
import { indexLookup } from "./features";
import { forecast } from "./forecast";
import { estimate, valueBadge, type Estimate, type ValuationModel, type ValueBadge } from "./model";

export const valuationModel = modelJson as ValuationModel;
export const modelCard = modelCardJson;

const condoSeries = indexSeries(valuationModel.indexSeries);
const condoIndexAt = indexLookup(condoSeries);
export const LATEST_INDEX_MONTH = condoSeries[condoSeries.length - 1].month;

export interface Valuation {
  estimate: Estimate;
  badge: { badge: ValueBadge; diffPct: number } | null;
  factors: Factor[];
  forecast: ReturnType<typeof forecast> | null;
}

/** Fair-value range, badge, "Why this price?" factors and 1/3/5-year forecast for one property. */
export function valueProperty(
  p: { type: string; district: string; areaSqm: number; buildYear?: number; floor?: number; railWalkMin?: number },
  askingThb: number,
): Valuation {
  const e = estimate(valuationModel, { type: p.type, district: p.district, sizeSqm: p.areaSqm, buildYear: p.buildYear, floor: p.floor, railWalkMin: p.railWalkMin, month: LATEST_INDEX_MONTH }, condoIndexAt);
  if (!e.available) return { estimate: e, badge: null, factors: [], forecast: null };
  return {
    estimate: e,
    badge: valueBadge(askingThb, e.likelyThb),
    factors: explainFactors(valuationModel, e.sale),
    forecast: forecast(condoSeries, e.likelyThb),
  };
}

export type { Estimate, Factor, ValuationModel, ValueBadge };
