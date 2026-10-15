// Split-conformal range (AI_SPEC §2.2): residuals r = log(actual) − log(predicted) on the calibration split.
// low = predicted·e^{q10}, high = predicted·e^{q90}, an ≈80% interval.

/** Quantile with linear interpolation between order statistics (q in [0, 1]). */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) throw new Error("No values");
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function conformalBand(logResiduals: number[]) {
  return { q10: quantile(logResiduals, 0.1), q90: quantile(logResiduals, 0.9), n: logResiduals.length };
}

export const median = (values: number[]) => quantile(values, 0.5);
