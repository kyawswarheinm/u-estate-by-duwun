// "Why this price?" (AI_SPEC §2.2): each feature's effect versus the district-average unit,
// e^{β·(x − x̄)} − 1, using the model's own coefficients. Real contributions, not AI guesses.
import { ageAt, FACTOR_KEYS, numericFeatures, RAIL_NEAR_MIN, type CondoSale, type FactorKey } from "./features";
import type { ValuationModel } from "./model";

export interface Factor {
  key: FactorKey;
  label: string;
  pct: number; // +6.2 means this feature adds 6.2% versus the district-average unit
}

function label(key: FactorKey, x: CondoSale): string {
  switch (key) {
    case "rail_near": return x.railWalkMin <= RAIL_NEAR_MIN ? `Near rail (${x.railWalkMin} min walk)` : `Not near rail (${x.railWalkMin} min walk)`;
    case "age": return `Building age (${ageAt(x.buildYear, x.saleMonth)} years)`;
    case "floor": return `Floor ${x.floor}`;
    case "log_size": return `Unit size (${x.sizeSqm} m²)`;
  }
}

export function explainFactors(model: ValuationModel, x: CondoSale): Factor[] {
  const means = model.districtMeans[x.district];
  if (!means) return [];
  const values = numericFeatures(x);
  return FACTOR_KEYS.map((key) => {
    const beta = model.beta[model.featureNames.indexOf(key)];
    const pct = (Math.exp(beta * (values[key] - means[key])) - 1) * 100;
    return { key, label: label(key, x), pct: Math.round(pct * 10) / 10 };
  }).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
}
