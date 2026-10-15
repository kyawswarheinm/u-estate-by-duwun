import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { indexSeries } from "../../data/index-sample";
import savedCard from "../../data/model-card.json";
import savedModel from "../../data/valuation-model.json";
import { valueProperty } from "./index";
import { conformalBand, quantile } from "./conformal";
import { DATASET, fromCsv, generateSales, monthsBetween, toCsv } from "./dataset";
import { evaluateModel, splitByTime } from "./evaluate";
import { explainFactors } from "./factors";
import { featureVector, indexLookup } from "./features";
import { forecast, indexGrowth } from "./forecast";
import { estimate, fitModel, valueBadge } from "./model";
import { cholesky, ridge, solveSpd } from "./ols";

const indexAt = indexLookup(indexSeries("condo_bkk"));
const rows = generateSales(indexAt);
const { train, calibration, test } = splitByTime(rows);
const model = fitModel(train, calibration, indexAt, { isSynthetic: true });
const coef = (name: string) => model.beta[model.featureNames.indexOf(name)];

describe("linear algebra (T07)", () => {
  it("Cholesky matches the known factor of a 3×3 SPD matrix", () => {
    const L = cholesky([[4, 12, -16], [12, 37, -43], [-16, -43, 98]]);
    expect(L).toEqual([[2, 0, 0], [6, 1, 0], [-8, 5, 3]]);
  });

  it("solves A·x = b exactly", () => {
    const x = solveSpd([[4, 12, -16], [12, 37, -43], [-16, -43, 98]], [-24, -68, 125]); // A·[1, -1, 1]
    x.forEach((v, i) => expect(v).toBeCloseTo([1, -1, 1][i], 10));
  });

  it("ridge recovers a noise-free linear system", () => {
    const X = [[1, 0, 1], [1, 1, 0], [1, 2, 5], [1, 3, 2], [1, 4, 4], [1, 5, 1]];
    const y = X.map((r) => 2 + 3 * r[1] - r[2]);
    const b = ridge(X, y, 1e-9);
    [2, 3, -1].forEach((v, i) => expect(b[i]).toBeCloseTo(v, 5));
  });

  it("rejects a matrix that is not positive definite", () => {
    expect(() => cholesky([[1, 2], [2, 1]])).toThrow();
  });
});

describe("conformal range", () => {
  it("interpolates quantiles", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1, 10);
    expect(conformalBand([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual({ q10: 1, q90: 9, n: 11 });
  });
});

describe("synthetic dataset", () => {
  it("is deterministic, labelled synthetic and inside the documented ranges", () => {
    expect(generateSales(indexAt)).toEqual(rows);
    expect(rows).toHaveLength(DATASET.rows);
    for (const r of rows) {
      expect(r.isSynthetic).toBe(true);
      expect(r.sizeSqm).toBeGreaterThanOrEqual(25);
      expect(r.sizeSqm).toBeLessThanOrEqual(90);
      expect(r.buildYear).toBeLessThanOrEqual(Number(r.saleMonth.slice(0, 4)));
      expect(r.saleMonth >= DATASET.firstMonth && r.saleMonth <= DATASET.lastMonth).toBe(true);
    }
  });

  it("round-trips through CSV and refuses rows not marked synthetic", () => {
    expect(fromCsv(toCsv(rows.slice(0, 5)))).toEqual(rows.slice(0, 5));
    expect(() => fromCsv(toCsv(rows.slice(0, 1)).replace(",true", ",false"))).toThrow(/synthetic/);
  });

  it("splits by time without overlap", () => {
    expect(train.every((r) => r.saleMonth < "2025-07")).toBe(true);
    expect(calibration.every((r) => r.saleMonth >= "2025-07" && r.saleMonth <= "2025-12")).toBe(true);
    expect(test.every((r) => r.saleMonth >= "2026-01")).toBe(true);
    expect(train.length + calibration.length + test.length).toBe(rows.length);
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("hedonic model", () => {
  it("recovers the generator's effects from the training data", () => {
    expect(coef("rail_near")).toBeCloseTo(0.06, 1);
    expect(coef("log_size")).toBeCloseTo(-0.08, 1);
    expect(coef("floor")).toBeGreaterThan(0);
    expect(coef("age")).toBeLessThan(0);
    expect(coef("log_index")).toBeGreaterThan(0.7);
    expect(featureVector(rows[0], model.districts, indexAt)).toHaveLength(model.beta.length);
  });

  it("measures real metrics on the held-out 2026 sales (no fixed targets)", () => {
    const m = evaluateModel(model, test, indexAt);
    expect(m.n_test).toBe(test.length);
    expect(m.test_period.startsWith("2026-")).toBe(true);
    // sanity bounds only: noise is N(0, 0.07), so a working model sits near 5% median error and 80% coverage
    expect(m.median_ape_pct).toBeLessThan(10);
    expect(m.range_coverage_pct).toBeGreaterThan(60);
  });

  it("estimates a condo with a low ≤ likely ≤ high range and reports filled-in inputs", () => {
    const e = estimate(model, { type: "condo", district: "Sathorn", sizeSqm: 40, month: "2026-09", buildYear: 2016 }, indexAt);
    if (!e.available) throw new Error(e.reason);
    expect(e.lowThb).toBeLessThan(e.likelyThb);
    expect(e.highThb).toBeGreaterThan(e.likelyThb);
    expect(e.imputed).toEqual(["floor", "rail_walk_min"]);
    expect(e.isSynthetic).toBe(true);
  });

  it("says 'Not enough data' outside the training types and districts", () => {
    const house = estimate(model, { type: "house", district: "Bang Yai", sizeSqm: 160, month: "2026-09" }, indexAt);
    const unknown = estimate(model, { type: "condo", district: "Chiang Mai", sizeSqm: 40, month: "2026-09" }, indexAt);
    expect(house.available || unknown.available).toBe(false);
    expect(!house.available && house.reason).toMatch(/Not enough data/);
    expect(!unknown.available && unknown.reason).toMatch(/Chiang Mai/);
  });
});

describe("badges (AI_SPEC §2.2, R11)", () => {
  it.each([
    [740_000, "scam_alert"], [750_000, "scam_alert"], [970_000, "good_value"], [980_000, "fair"],
    [1_040_000, "fair"], [1_050_000, "overpriced"],
  ] as const)("asking %i vs likely 1,000,000 → %s", (asking, badge) => {
    expect(valueBadge(asking, 1_000_000).badge).toBe(badge);
  });
});

describe("why this price", () => {
  it("a district-average unit has no factor effects; near rail adds about +6%", () => {
    const means = model.districtMeans.Sathorn;
    const sale = { district: "Sathorn", sizeSqm: Math.exp(means.log_size), floor: means.floor, buildYear: 2026 - means.age, railWalkMin: 5, saleMonth: "2026-09" };
    const f = explainFactors(model, sale);
    const rail = f.find((x) => x.key === "rail_near")!;
    expect(rail.label).toMatch(/Near rail/);
    expect(rail.pct).toBeGreaterThan(3);
    expect(rail.pct).toBeLessThan(10);
    for (const x of f.filter((x) => x.key !== "rail_near")) expect(Math.abs(x.pct)).toBeLessThan(0.1);
  });
});

describe("committed files match the code (rerun valuation:dataset + eval:valuation if this fails)", () => {
  it("dataset CSV, model JSON and Model Card are up to date", () => {
    expect(readFileSync(DATASET.file, "utf8").replace(/\r\n/g, "\n")).toBe(toCsv(rows));
    expect(savedModel.districts).toEqual(model.districts);
    savedModel.beta.forEach((b, i) => expect(b).toBeCloseTo(model.beta[i], 9));
    expect(savedCard.metrics).toMatchObject(evaluateModel(model, test, indexAt));
    expect(savedCard.dataset.is_synthetic).toBe(true);
  });

  it("values the seed condo and says 'Not enough data' for the seed house", () => {
    const condo = valueProperty({ type: "condo", district: "Sathorn", areaSqm: 40, buildYear: 2016, railWalkMin: 6 }, 4_000_000);
    expect(condo.estimate.available).toBe(true);
    expect(condo.badge).not.toBeNull();
    expect(condo.factors).toHaveLength(4);
    expect(condo.forecast?.points).toHaveLength(3);
    const house = valueProperty({ type: "house", district: "Bang Yai", areaSqm: 160 }, 6_000_000);
    expect(house.estimate.available).toBe(false);
    expect(house.badge).toBeNull();
  });
});

describe("forecast from the index", () => {
  const series = Array.from({ length: 72 }, (_, i) => ({ value: 100 * Math.exp((0.05 / 12) * i) }));

  it("reads 5%/year growth and zero volatility from a clean exponential series", () => {
    const { g, sigma } = indexGrowth(series);
    expect(g).toBeCloseTo(0.05, 10);
    expect(sigma).toBeCloseTo(0, 10);
  });

  it("projects V·e^{g t} with a range that collapses when σ = 0", () => {
    const f = forecast(series, 4_000_000);
    expect(f.points.map((p) => p.years)).toEqual([1, 3, 5]);
    expect(f.points[2].centralThb).toBe(Math.round((4_000_000 * Math.exp(0.25)) / 1000) * 1000);
    expect(f.points[0].lowThb).toBe(f.points[0].highThb);
    expect(f.note).toMatch(/not a guarantee/);
  });

  it("widens the range with the horizon on the SAMPLE index", () => {
    const f = forecast(indexSeries("condo_bkk"), 4_000_000);
    const width = f.points.map((p) => p.highThb - p.lowThb);
    expect(width[2]).toBeGreaterThan(width[0]);
  });
});
