// Import or refresh real listings (src/data/market/verified-listings.json).
//
//   npm run listings:import -- rows.csv            # add/update rows from a CSV or JSON array, check source links
//   npm run listings:import -- rows.json --no-links
//   npm run listings:refresh                       # recheck every source link and report stale rows
//
// Only import rows U-Estate may publish: the owner's or agency's permission, or a licensed feed. Fill `permission`
// with who agreed and when. DDproperty, Hipflat, FazWaz and Livinginsider are off-limits (pipeline/scraper/SOURCES.md):
// never copy rows or photos from them. Columns (CSV header or JSON keys): see CandidateRow in src/lib/listings/ingest.ts.
// Lists in CSV (amenities) use ";". Unknown values stay empty. A log of every problem goes to .data/import-logs/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ingest, refresh, type LinkCheck, type LogEntry } from "../src/lib/listings/ingest";
import { RealListingsFile } from "../src/lib/listings/schema";

const FILE = path.join(process.cwd(), "src/data/market/verified-listings.json");
const LOG_DIR = path.join(process.cwd(), ".data/import-logs");
const UA = "U-Estate-Hackathon/0.1 (+https://github.com/kyawswarheinm/u-estate-by-duwun; listing-link-check)";

/** One polite request per link. 404/410 = broken; 401/403/429 or a timeout = could not check, not broken. */
const checkLink: LinkCheck = async (url) => {
  const ask = (method: string) => fetch(url, { method, redirect: "follow", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10_000) });
  let r = await ask("HEAD");
  if (r.status === 405 || r.status === 501) r = await ask("GET");
  if (r.ok) return "ok";
  if (r.status === 404 || r.status === 410) return "broken";
  return "unchecked";
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  const [header = [], ...body] = rows;
  return body.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), cells[i] ?? ""])));
}

function readCandidates(file: string): unknown[] {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  if (file.toLowerCase().endsWith(".csv")) return parseCsv(text);
  const json = JSON.parse(text);
  if (!Array.isArray(json)) throw new Error("JSON input must be an array of rows");
  return json;
}

async function main() {
  const args = process.argv.slice(2);
  const refreshOnly = args.includes("--refresh");
  const links = !args.includes("--no-links");
  const input = args.find((a) => !a.startsWith("--"));
  if (!refreshOnly && !input) {
    console.error("Usage: npm run listings:import -- <rows.csv|rows.json> [--no-links]   or   npm run listings:refresh");
    process.exit(2);
  }
  const current = RealListingsFile.parse(JSON.parse(readFileSync(FILE, "utf8")));
  const today = new Date().toISOString().slice(0, 10);
  const checker = links ? checkLink : undefined;

  let log: LogEntry[] = [];
  let listings = current.listings;
  let summary = "";
  if (refreshOnly) {
    listings = await refresh(listings, { checkLink: checker, log });
    summary = `refreshed ${listings.length} listings`;
  } else {
    const result = await ingest(current.listings, readCandidates(input!), { today, checkLink: checker });
    ({ listings, log } = result);
    summary = `added ${result.added}, updated ${result.updated}, total ${listings.length}`;
  }

  const next = RealListingsFile.parse({ meta: { ...current.meta, updated_at: today }, listings });
  writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);

  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  writeFileSync(logFile, [summary, ...log.map((l) => `${l.level.toUpperCase()}\trow ${l.row}\t${l.message}`)].join("\n") + "\n");

  const errors = log.filter((l) => l.level === "error").length;
  const warnings = log.filter((l) => l.level === "warning").length;
  console.log(`${summary}. ${errors} rejected-row errors, ${warnings} warnings. Log: ${path.relative(process.cwd(), logFile)}`);
  for (const l of log.filter((x) => x.level !== "info").slice(0, 20)) console.log(`  ${l.level}: row ${l.row}: ${l.message}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
