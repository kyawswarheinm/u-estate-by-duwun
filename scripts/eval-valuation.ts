// Fits the valuation model, measures it on the held-out 2026 split and writes (AI_SPEC §2.3, D-25):
//   src/data/valuation-model.json  the fitted model the app uses (coefficients + calibrated range)
//   src/data/model-card.json       the ONLY source of numbers for the Model Card page
// Run: npm run eval:valuation   (after npm run valuation:dataset)
// TODO (Supabase wiring): also upsert the card into the model_cards table.
import { readFileSync, writeFileSync } from "node:fs";
import { INDEX_SOURCE, indexSeries } from "../src/data/index-sample";
import { DATASET, fromCsv } from "../src/lib/valuation/dataset";
import { evaluateModel, SPLIT, splitByTime } from "../src/lib/valuation/evaluate";
import { indexLookup } from "../src/lib/valuation/features";
import { fitModel } from "../src/lib/valuation/model";

const indexAt = indexLookup(indexSeries("condo_bkk"));
const rows = fromCsv(readFileSync(DATASET.file, "utf8"));
const { train, calibration, test } = splitByTime(rows);
const model = fitModel(train, calibration, indexAt, { isSynthetic: rows.every((r) => r.isSynthetic) });
const metrics = evaluateModel(model, test, indexAt);

const card = {
  model_version: model.version,
  method: "Hedonic ridge regression on log(price per m²) with district, size, floor, building age, near-rail and price-index features; split-conformal 80% range.",
  metrics: { ...metrics, n_train: train.length, n_calibration: calibration.length },
  split: `train before ${SPLIT.trainBefore}; calibrate ${SPLIT.calibrationFrom} to ${SPLIT.calibrationTo}; test from ${SPLIT.testFrom}`,
  dataset: {
    name: DATASET.name,
    file: DATASET.file,
    rows: rows.length,
    is_synthetic: model.isSynthetic,
    seed: DATASET.seed,
    period: `${DATASET.firstMonth} to ${DATASET.lastMonth}`,
    sources: DATASET.sources,
    index: { label: INDEX_SOURCE.label, is_sample: INDEX_SOURCE.isSample },
  },
  notice: model.isSynthetic
    ? "Trained and tested on synthetic demo data generated from synthetic district prices and a SAMPLE price index; it shows the method works, not market accuracy."
    : "Trained and tested on the dataset listed above.",
  limitations: [
    "Condos only; other property types show 'Not enough data'.",
    "Only the districts in the training data; others show 'Not enough data'.",
    "Missing floor, build year or rail distance are filled with the district average, and the page says so.",
  ],
  evaluated_on: new Date().toISOString().slice(0, 10),
};

writeFileSync("src/data/valuation-model.json", JSON.stringify(model, null, 1) + "\n");
writeFileSync("src/data/model-card.json", JSON.stringify(card, null, 2) + "\n");
console.log(`Model ${model.version}: train ${train.length}, calibration ${calibration.length}, test ${metrics.n_test} (${metrics.test_period})`);
console.log(`median APE ${metrics.median_ape_pct}% · within ±10% ${metrics.within_10_pct}% · range coverage ${metrics.range_coverage_pct}%`);
console.log("Wrote src/data/valuation-model.json and src/data/model-card.json");
