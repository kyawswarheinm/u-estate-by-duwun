// Truthful status for every transparency-ledger entry (D-33, D-45). Pure, unit-tested, shared by the page and U-Pal.
//   verified        the entry is covered by a fingerprint confirmed on Avalanche Fuji (a stored anchor with its real
//                   transaction hash, saved only after the transaction was mined)
//   pending_anchor  the network is available; the entry is fingerprinted and waits for the next anchor
//   recorded        the network is not available; the entry is fingerprinted in the U-Estate ledger only
// A fallback record is never shown as on-chain: only an anchor with a transaction hash can make an entry "verified".
// When the network comes back, the next anchor covers every older entry too (the hash chain includes them); the
// anchor keeps its own date, so history is never rewritten.
import type { LedgerAnchor, LedgerEntry } from "../types";

export type LedgerProviderId = "avalanche" | "database";
export type EntryStatus = "verified" | "pending_anchor" | "recorded";

export const STATUS_LABEL: Record<EntryStatus, "Verified on Avalanche" | "Pending network anchoring" | "Recorded"> = {
  verified: "Verified on Avalanche",
  pending_anchor: "Pending network anchoring",
  recorded: "Recorded",
};

const TX_HASH = /^0x[0-9a-fA-F]{64}$/;

/** Anchors that carry genuine network evidence (a well-formed transaction hash on the Fuji chain). */
export function confirmedAnchors(anchors: LedgerAnchor[]) {
  return anchors.filter((a) => TX_HASH.test(a.txHash) && a.chainId === 43113);
}

/** The anchor that covers an entry: the earliest confirmed anchor whose range includes it. */
export function anchorFor(entryId: number, anchors: LedgerAnchor[]) {
  return confirmedAnchors(anchors)
    .filter((a) => a.upToEntryId >= entryId)
    .sort((a, b) => a.upToEntryId - b.upToEntryId)[0] ?? null;
}

export function entryStatus(entry: Pick<LedgerEntry, "id">, anchors: LedgerAnchor[], provider: LedgerProviderId): EntryStatus {
  if (anchorFor(entry.id, anchors)) return "verified";
  return provider === "avalanche" ? "pending_anchor" : "recorded";
}

export function statusCounts(entries: Pick<LedgerEntry, "id">[], anchors: LedgerAnchor[], provider: LedgerProviderId) {
  const counts: Record<EntryStatus, number> = { verified: 0, pending_anchor: 0, recorded: 0 };
  for (const e of entries) counts[entryStatus(e, anchors, provider)]++;
  return counts;
}
