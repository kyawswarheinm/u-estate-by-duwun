import "server-only";
import { anchorMessage, headHash } from "@/lib/ledger-hash";
import { AVALANCHE_CHAIN_ID, avalancheConfigured, avalancheReachable, publishAnchor, readAnchor } from "@/lib/avalanche";
import type { DB } from "@/lib/types";
import type { LedgerProviderId } from "./status";

// One ledger interface for the app; the provider is chosen on the server.
//   avalanche  configured and reachable: fingerprints can be published on Fuji and read back
//   database   fallback: entries stay in the database ledger (append-only, hash-chained), nothing is published
// The frontend never talks to a provider directly and never sees configuration, keys or raw provider errors:
// failures are logged here and returned as a short code plus a plain message.

export type ProviderState = { id: LedgerProviderId; canPublish: boolean };

let health: { at: number; ok: boolean } | null = null;
const HEALTH_TTL_MS = 60_000;

/** Which provider serves this request. The reachability check is cached for a minute. */
export async function ledgerProvider(): Promise<ProviderState> {
  if (!avalancheConfigured()) return { id: "database", canPublish: false };
  if (!health || Date.now() - health.at > HEALTH_TTL_MS) {
    health = { at: Date.now(), ok: await avalancheReachable() };
    if (!health.ok) console.warn("[ledger] Avalanche RPC not reachable; using the database ledger");
  }
  return health.ok ? { id: "avalanche", canPublish: true } : { id: "database", canPublish: false };
}

export type AnchorPlan =
  | { ok: false; code: "NOTHING_TO_ANCHOR" | "ALREADY_ANCHORED" }
  | { ok: true; upToId: number; count: number; hash: string; message: string };

/** What the next anchor would publish. Pure apart from reading the snapshot passed in. */
export function planAnchor(db: Pick<DB, "ledger" | "anchors">): AnchorPlan {
  if (db.ledger.length === 0) return { ok: false, code: "NOTHING_TO_ANCHOR" };
  const upToId = Math.max(...db.ledger.map((e) => e.id));
  const head = headHash(db.ledger, upToId);
  const last = db.anchors.at(-1);
  if (last && last.upToEntryId === upToId && last.headHash === head.hash) return { ok: false, code: "ALREADY_ANCHORED" };
  return { ok: true, upToId, count: head.count, hash: head.hash, message: anchorMessage(upToId, head.count, head.hash) };
}

/** Publishes on Avalanche. Throws a ProviderError with a user-safe code; details go to the server log only. */
export async function publishFingerprint(message: string) {
  try {
    const tx = await publishAnchor(message);
    return { ...tx, chainId: AVALANCHE_CHAIN_ID };
  } catch (e) {
    health = { at: Date.now(), ok: false }; // fall back until the next health check
    console.error("[ledger] anchor publish failed:", e instanceof Error ? e.message.split("\n")[0] : e);
    throw new ProviderError("NETWORK_UNAVAILABLE");
  }
}

/** Reads a published fingerprint back from the chain; null when the network cannot be reached. */
export async function readFingerprint(txHash: string) {
  try {
    return await readAnchor(txHash);
  } catch (e) {
    console.warn("[ledger] anchor read failed:", e instanceof Error ? e.message.split("\n")[0] : e);
    return null;
  }
}

export class ProviderError extends Error {
  constructor(readonly code: "NETWORK_UNAVAILABLE") {
    super(code);
  }
}
