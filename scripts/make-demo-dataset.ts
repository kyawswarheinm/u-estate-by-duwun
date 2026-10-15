// Writes the SYNTHETIC valuation dataset (AI_SPEC §2.1): npm run valuation:dataset
// Deterministic (fixed seed), so re-running produces the same file. Every row is is_synthetic=true.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { indexSeries } from "../src/data/index-sample";
import { DATASET, generateSales, toCsv } from "../src/lib/valuation/dataset";
import { indexLookup } from "../src/lib/valuation/features";

const rows = generateSales(indexLookup(indexSeries("condo_bkk")));
mkdirSync(dirname(DATASET.file), { recursive: true });
writeFileSync(DATASET.file, toCsv(rows));
console.log(`Wrote ${rows.length} SYNTHETIC rows to ${DATASET.file} (seed ${DATASET.seed}).`);
