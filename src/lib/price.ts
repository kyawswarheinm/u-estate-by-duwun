// Honest price method (decision D-13, build spec §8). Code computes every number; AI only explains them.
import { INDEX_SOURCE, indexSeries } from "@/data/index-sample";
import type { Listing, Property } from "./types";

export interface PricePanel {
  askingThb: number;
  appraisal: { thb: number; source: string; date: string };
  estimate:
    | { thb: number; lowThb: number; highThb: number; method: string; basis: string }
    | { thb: null; reason: string };
  index: { latestMonth: string; latestValue: number; source: string; isSample: boolean };
  askingVsEstimatePct: number | null;
  risks: { level: "ok" | "warning" | "unknown"; label: string; detail: string }[];
}

function valueAt(series: { month: string; value: number }[], month: string) {
  return series.find((p) => p.month === month)?.value ?? null;
}

export function pricePanel(listing: Listing, property: Property, comparables: { pricePerSqm: number }[]): PricePanel {
  const series = indexSeries(property.indexSeries);
  const latest = series[series.length - 1];

  let estimate: PricePanel["estimate"] = { thb: null, reason: "Not enough data: no recorded previous sale price." };
  if (property.lastSalePriceThb && property.lastSaleDate) {
    const then = valueAt(series, property.lastSaleDate);
    if (then) {
      const est = property.lastSalePriceThb * (latest.value / then);
      // Range: spread of comparable prices per m² (min ±5%).
      let spreadPct = 0.05;
      if (comparables.length >= 2) {
        const v = comparables.map((c) => c.pricePerSqm);
        const mean = v.reduce((a, b) => a + b, 0) / v.length;
        spreadPct = Math.max(0.05, (Math.max(...v) - Math.min(...v)) / 2 / mean);
      }
      estimate = {
        thb: Math.round(est),
        lowThb: Math.round(est * (1 - spreadPct)),
        highThb: Math.round(est * (1 + spreadPct)),
        method: "Index-adjusted: last sale price × (index now ÷ index at last sale)",
        basis: `Last sale ฿${property.lastSalePriceThb.toLocaleString("en-US")} in ${property.lastSaleDate}; index ${then} → ${latest.value}`,
      };
    }
  }

  const askingVsEstimatePct =
    estimate.thb !== null ? Math.round(((listing.askingPriceThb - estimate.thb) / estimate.thb) * 1000) / 10 : null;

  const age = property.buildYear ? new Date().getFullYear() - property.buildYear : null;
  const risks: PricePanel["risks"] = [
    askingVsEstimatePct === null
      ? { level: "unknown", label: "Price check", detail: "Not enough data to compare the asking price." }
      : askingVsEstimatePct > 15
        ? { level: "warning", label: "Price check", detail: `Asking price is ${askingVsEstimatePct}% above the index-adjusted estimate. Ask the seller why.` }
        : { level: "ok", label: "Price check", detail: `Asking price is ${askingVsEstimatePct > 0 ? "+" : ""}${askingVsEstimatePct}% vs the index-adjusted estimate.` },
    listing.verificationStatus === "verified_sample"
      ? { level: "ok", label: "Documents", detail: "Deed checked by AI (sample). Ownership must still be confirmed at the Land Office." }
      : listing.verificationStatus === "needs_review"
        ? { level: "warning", label: "Documents", detail: "The document check found issues that need human review." }
        : { level: "unknown", label: "Documents", detail: "No document checked yet." },
    age === null
      ? { level: "unknown", label: "Building age", detail: "Build year not provided." }
      : { level: age > 25 ? "warning" : "ok", label: "Building age", detail: `${age} years old${age > 25 ? ": ask for an inspection report" : ""}.` },
    { level: "unknown", label: "Flood risk", detail: "No flood data source connected yet. We do not guess." },
  ];

  return {
    askingThb: listing.askingPriceThb,
    appraisal: { thb: property.officialAppraisalThb, source: property.appraisalSource, date: property.appraisalDate },
    estimate,
    index: { latestMonth: latest.month, latestValue: latest.value, source: INDEX_SOURCE.label, isSample: INDEX_SOURCE.isSample },
    askingVsEstimatePct,
    risks,
  };
}

/** Linear trend over the last 24 months, projected 12 months. Labelled "trend, not a prediction". */
export function trendLine(series: { month: string; value: number }[]) {
  const recent = series.slice(-24);
  const n = recent.length;
  const xs = recent.map((_, i) => i);
  const ys = recent.map((p) => p.value);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const intercept = my - slope * mx;
  return Array.from({ length: 13 }, (_, k) => ({ step: k, value: Math.round((intercept + slope * (n - 1 + k)) * 10) / 10 }));
}
