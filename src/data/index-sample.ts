// ⚠️ SAMPLE INDEX VALUES FOR THE DEMO — NOT REAL DATA.
// Replace with the Bank of Thailand Residential Property Price Index (monthly, by type/region):
// download the series from the BOT statistics portal, save it as a CSV, and update INDEX_SOURCE.
// The app shows "SAMPLE" on every chart until isSample is false.

export const INDEX_SOURCE = {
  label: "SAMPLE index (replace with Bank of Thailand Residential Property Price Index)",
  isSample: true,
};

type Point = { month: string; value: number };

function build(start: number, monthlyGrowth: number, wobble: number): Point[] {
  const out: Point[] = [];
  let v = start;
  for (let y = 2019; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 9) break;
      const k = out.length;
      v = v * (1 + monthlyGrowth) + Math.sin(k / 5) * wobble; // deterministic, no randomness
      out.push({ month: `${y}-${String(m).padStart(2, "0")}`, value: Math.round(v * 10) / 10 });
    }
  }
  return out;
}

const SERIES: Record<string, Point[]> = {
  condo_bkk: build(150, 0.0025, 0.35),
  house_bkk: build(140, 0.003, 0.25),
};

export function indexSeries(key: string): Point[] {
  return SERIES[key] ?? SERIES.condo_bkk;
}
