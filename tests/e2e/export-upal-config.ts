// Writes the U-Pal question config as JSON for the browser tests (tests/e2e/test_upal.py), so the tests check the
// real configuration instead of a copy. Run: npx --yes tsx@4.20.6 tests/e2e/export-upal-config.ts tmp/e2e/upal-config.json
import { writeFileSync } from "node:fs";
import { UPAL_COPY } from "../../src/i18n/upal";
import { PAGE_KINDS, PAGE_QUESTION_SETS, questionsFor } from "../../src/lib/upal";

const out = process.argv[2] ?? "tmp/e2e/upal-config.json";
const tiers = ["guest", "standard", "premium"] as const;
const config = Object.fromEntries(
  (Object.keys(UPAL_COPY) as (keyof typeof UPAL_COPY)[]).map((locale) => [
    locale,
    Object.fromEntries(PAGE_KINDS.map((kind) => [kind, Object.fromEntries(tiers.map((tier) => [tier, questionsFor(UPAL_COPY[locale].questions, kind, tier)]))])),
  ]),
);
writeFileSync(out, JSON.stringify({ pageSets: PAGE_QUESTION_SETS, questions: config }, null, 1));
console.log(`wrote ${out}`);
