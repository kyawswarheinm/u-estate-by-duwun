// Time-ordered evaluation (AI_SPEC §2.2–§2.3): train on sales before 2025-07, calibrate the range on
// 2025-07…2025-12, test on 2026. The model never sees later months while learning.
import { median } from "./conformal";
import type { CondoSale, IndexAt } from "./features";
import { predictPerSqm, type ValuationModel } from "./model";

export const SPLIT = { trainBefore: "2025-07", calibrationFrom: "2025-07", calibrationTo: "2025-12", testFrom: "2026-01" };

export function splitByTime<T extends { saleMonth: string }>(rows: T[]) {
  return {
    train: rows.filter((r) => r.saleMonth < SPLIT.trainBefore),
    calibration: rows.filter((r) => r.saleMonth >= SPLIT.calibrationFrom && r.saleMonth <= SPLIT.calibrationTo),
    test: rows.filter((r) => r.saleMonth >= SPLIT.testFrom),
  };
}

export interface Metrics {
  median_ape_pct: number;
  within_10_pct: number;
  range_coverage_pct: number;
  n_test: number;
  test_period: string;
}

const pct = (v: number) => Math.round(v * 1000) / 10;

/** Measured on the test split only. Nothing here is a target or an assumption: these are the results. */
export function evaluateModel(model: ValuationModel, test: (CondoSale & { pricePerSqm: number })[], indexAt: IndexAt): Metrics {
  const rows = test.filter((r) => model.districts.includes(r.district));
  if (rows.length === 0) throw new Error("No test rows");
  const ape: number[] = [];
  let within10 = 0;
  let covered = 0;
  for (const r of rows) {
    const pred = predictPerSqm(model, r, indexAt);
    const err = Math.abs(pred - r.pricePerSqm) / r.pricePerSqm;
    ape.push(err);
    if (err <= 0.1) within10++;
    if (r.pricePerSqm >= pred * Math.exp(model.band.q10) && r.pricePerSqm <= pred * Math.exp(model.band.q90)) covered++;
  }
  const months = rows.map((r) => r.saleMonth).sort();
  return {
    median_ape_pct: pct(median(ape)),
    within_10_pct: pct(within10 / rows.length),
    range_coverage_pct: pct(covered / rows.length),
    n_test: rows.length,
    test_period: `${months[0]} to ${months[months.length - 1]}`,
  };
}
