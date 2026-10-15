import "server-only";
import { sampleTokens } from "@/data/token-sample";
import type { TokenInfo, UnlockEvent } from "./token-risk";

// Tokenomist API v5 (https://docs.tokenomist.ai): read-only token supply and unlock data (D-34).
// Auth: x-api-key header, server-side only. Data licence on non-Enterprise plans is non-commercial (demo use).
const BASE = "https://api.tokenomist.ai/v5";

export function tokenomistConfigured() {
  return Boolean(process.env.TOKENOMIST_API_KEY);
}

interface ApiToken {
  id: string; name: string; symbol: string;
  circulatingSupply: number | null; marketCap: number | null; maxSupply: number | null;
  totalLockedAmount: number; tbdLockedAmount: number; unlockedAmount: number; untrackedAmount: number;
  lastUpdatedDate: string;
}
interface ApiEvent {
  unlockDate: string;
  cliffUnlocks?: { cliffAmount?: number; cliffValue?: number | null; valueToMarketCap?: number | null; allocationBreakdown?: { allocationName?: string }[] };
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "x-api-key": process.env.TOKENOMIST_API_KEY!, accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Tokenomist ${r.status}`);
  const j = (await r.json()) as { status: boolean; data: T };
  return j.data;
}

let listCache: { at: number; tokens: ApiToken[] } | null = null;
async function tokenList() {
  if (listCache && Date.now() - listCache.at < 3_600_000) return listCache.tokens;
  const tokens = await get<ApiToken[]>("/token/list"); // one credit per hour at most
  listCache = { at: Date.now(), tokens };
  return tokens;
}

const toInfo = (t: ApiToken): TokenInfo => ({
  id: t.id, name: t.name, symbol: t.symbol, circulatingSupply: t.circulatingSupply, maxSupply: t.maxSupply, marketCap: t.marketCap,
  totalLockedAmount: t.totalLockedAmount ?? 0, tbdLockedAmount: t.tbdLockedAmount ?? 0, unlockedAmount: t.unlockedAmount ?? 0,
  untrackedAmount: t.untrackedAmount ?? 0, lastUpdated: t.lastUpdatedDate, source: "Tokenomist API v5", isSample: false,
});

export type TokenLookup =
  | { found: true; token: TokenInfo; events: UnlockEvent[] }
  | { found: false; reason: "not_tracked" | "not_configured"; suggestions: string[] };

/** Find a token by Tokenomist ID, symbol or name, then load its unlocks from today until `until`. */
export async function lookupToken(query: string, now: Date, until: Date): Promise<TokenLookup> {
  const q = query.trim().toLowerCase();
  const samples = sampleTokens(now);
  const sample = samples.find((s) => s.token.id === q || s.token.symbol.toLowerCase() === q);
  if (sample) return { found: true, ...sample };
  if (!tokenomistConfigured()) {
    return { found: false, reason: "not_configured", suggestions: samples.map((s) => s.token.id) };
  }

  const list = await tokenList();
  const matches = list.filter((t) => t.id.toLowerCase() === q || t.symbol?.toLowerCase() === q || t.name?.toLowerCase() === q);
  const best = matches.sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))[0];
  if (!best) {
    const near = list.filter((t) => t.name?.toLowerCase().includes(q) || t.symbol?.toLowerCase().startsWith(q)).slice(0, 5).map((t) => t.id);
    return { found: false, reason: "not_tracked", suggestions: near };
  }
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 30 * 86_400_000); // a little history shows whether the plan returns forward data
  const events = await get<ApiEvent[]>(`/unlock/events/${encodeURIComponent(best.id)}?start=${day(start)}&end=${day(until)}&pageSize=100`);
  return {
    found: true,
    token: toInfo(best),
    events: events.map((e) => ({
      date: e.unlockDate,
      amount: e.cliffUnlocks?.cliffAmount ?? 0,
      valueUsd: e.cliffUnlocks?.cliffValue ?? null,
      valueToMarketCapPct: e.cliffUnlocks?.valueToMarketCap ?? null,
      allocations: (e.cliffUnlocks?.allocationBreakdown ?? []).map((a) => a.allocationName ?? "").filter(Boolean),
    })),
  };
}
