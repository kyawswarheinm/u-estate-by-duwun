// SYNTHETIC demo dataset for the valuation model (AI_SPEC §2.1, D-02, D-25). No scraping and no real sales:
// every row is generated from the formula below and marked is_synthetic. It shows that the method and the
// measurement work, not how accurate the model is on the real market.
import type { CondoSale, IndexAt } from "./features";

/**
 * SYNTHETIC base prices per m² (THB, Jan 2019). Not market data and not Treasury appraisal values.
 * Sathorn and Bang Na are set to the same price level as the app's SAMPLE seed listings (src/lib/seed.ts:
 * last sale, appraisal, asking), so the demo's own sample data and this synthetic data agree with each other.
 */
export const SYNTHETIC_DISTRICT_BASE: Record<string, number> = {
  "Bang Na": 70_000,
  "Bang Rak": 90_000,
  "Bang Sue": 50_000,
  Chatuchak: 60_000,
  "Huai Khwang": 58_000,
  "Khlong Toei": 80_000,
  "Pathum Wan": 110_000,
  "Phaya Thai": 70_000,
  "Phra Khanong": 62_000,
  Sathorn: 72_000,
  "Thon Buri": 48_000,
  Watthana: 95_000,
};

export const DATASET = {
  name: "U-Estate synthetic condo sales (demo)",
  file: "data/valuation/demo_sales.csv",
  rows: 1200,
  seed: 20261016,
  firstMonth: "2019-01",
  lastMonth: "2026-09",
  isSynthetic: true,
  sources: [
    "Synthetic district base prices (SYNTHETIC_DISTRICT_BASE in src/lib/valuation/dataset.ts)",
    "Bank of Thailand condominium price index, Bangkok and vicinities (EC_EI_008_S4, via src/data/index-sample.ts): real index movement over time",
  ],
};

export interface SaleRow extends CondoSale {
  id: number;
  pricePerSqm: number;
  priceThb: number;
  isSynthetic: true;
}

/** Small deterministic PRNG (mulberry32), so the same seed always produces the same file. */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function monthsBetween(first: string, last: string): string[] {
  const out: string[] = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(5, 7));
  while (`${y}-${String(m).padStart(2, "0")}` <= last) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

/**
 * price_per_sqm = base[district] × index(month)/index(2019-01)
 *                 × exp(0.06·[rail ≤ 8 min] − 0.004·age + 0.003·floor − 0.08·ln(size/35) + ε),  ε ~ N(0, 0.07)
 */
export function generateSales(indexAt: IndexAt, opts: { rows?: number; seed?: number } = {}): SaleRow[] {
  const rand = prng(opts.seed ?? DATASET.seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand()); // Box–Muller
  const districts = Object.keys(SYNTHETIC_DISTRICT_BASE);
  const months = monthsBetween(DATASET.firstMonth, DATASET.lastMonth);
  const index0 = indexAt(DATASET.firstMonth);

  const rows: SaleRow[] = [];
  for (let id = 1; id <= (opts.rows ?? DATASET.rows); id++) {
    const district = districts[int(0, districts.length - 1)];
    const saleMonth = months[int(0, months.length - 1)];
    const saleYear = Number(saleMonth.slice(0, 4));
    const sizeSqm = int(25, 90);
    const floor = int(2, 45);
    const buildYear = int(2005, Math.min(2025, saleYear)); // never sold before it was built
    const railWalkMin = int(2, 25);
    const age = saleYear - buildYear;
    const logEffect = 0.06 * (railWalkMin <= 8 ? 1 : 0) - 0.004 * age + 0.003 * floor - 0.08 * Math.log(sizeSqm / 35) + 0.07 * normal();
    const pricePerSqm = Math.round(SYNTHETIC_DISTRICT_BASE[district] * (indexAt(saleMonth) / index0) * Math.exp(logEffect));
    rows.push({ id, district, sizeSqm, floor, buildYear, railWalkMin, saleMonth, pricePerSqm, priceThb: pricePerSqm * sizeSqm, isSynthetic: true });
  }
  return rows;
}

const HEADER = "id,district,size_sqm,floor,build_year,rail_walk_min,sale_month,price_per_sqm,price_thb,is_synthetic";

export function toCsv(rows: SaleRow[]): string {
  return [HEADER, ...rows.map((r) => [r.id, r.district, r.sizeSqm, r.floor, r.buildYear, r.railWalkMin, r.saleMonth, r.pricePerSqm, r.priceThb, "true"].join(","))].join("\n") + "\n";
}

export function fromCsv(text: string): SaleRow[] {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  if (header.trim() !== HEADER) throw new Error("Unexpected CSV header");
  return lines.map((line) => {
    const c = line.split(",");
    if (c[9] !== "true") throw new Error(`Row ${c[0]} is not marked synthetic`);
    return {
      id: Number(c[0]), district: c[1], sizeSqm: Number(c[2]), floor: Number(c[3]), buildYear: Number(c[4]),
      railWalkMin: Number(c[5]), saleMonth: c[6], pricePerSqm: Number(c[7]), priceThb: Number(c[8]), isSynthetic: true,
    };
  });
}
