// Tamper-evident hash chain over the transparency ledger (D-18, D-33).
// Each entry's hash covers the previous hash, so changing or deleting any old entry
// changes every later hash. Publishing the latest hash on Avalanche lets anyone check
// that our records were not edited afterwards. Pure functions, unit-tested.
import { createHash } from "node:crypto";
import type { LedgerEntry } from "./types";

export const GENESIS_HASH = "0".repeat(64);

/** Stable JSON: keys sorted at every level, so the same entry always hashes the same. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

export function sha256Hex(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function entryHash(prevHash: string, entry: LedgerEntry) {
  return sha256Hex(`${prevHash}\n${canonicalJson(entry)}`);
}

/** Hash of every entry, in id order. */
export function hashChain(entries: LedgerEntry[]) {
  const sorted = [...entries].sort((a, b) => a.id - b.id);
  let prev = GENESIS_HASH;
  return sorted.map((e) => {
    prev = entryHash(prev, e);
    return { id: e.id, hash: prev };
  });
}

/** The chain head after the entry with id `upToId` (inclusive). */
export function headHash(entries: LedgerEntry[], upToId: number) {
  const chain = hashChain(entries.filter((e) => e.id <= upToId));
  return {
    hash: chain.length ? chain[chain.length - 1].hash : GENESIS_HASH,
    count: chain.length,
  };
}

/** The exact text written on-chain. Readable in the block explorer ("view input as UTF-8"). */
export function anchorMessage(upToId: number, count: number, hash: string) {
  return `U-Estate transparency ledger v1 | entries 1-${upToId} (${count}) | sha256 ${hash}`;
}

export function parseAnchorMessage(text: string) {
  const m = /^U-Estate transparency ledger v1 \| entries 1-(\d+) \((\d+)\) \| sha256 ([0-9a-f]{64})$/.exec(text.trim());
  return m ? { upToId: Number(m[1]), count: Number(m[2]), hash: m[3] } : null;
}
