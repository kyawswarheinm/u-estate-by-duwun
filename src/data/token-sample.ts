// SAMPLE tokens for the T1 crypto-deposit check when TOKENOMIST_API_KEY is not set (or for a repeatable demo).
// Fictional tokens with fictional unlocks, dated relative to today. Always labelled SAMPLE in the UI (D-25).
import type { TokenInfo, UnlockEvent } from "@/lib/token-risk";

const DAY = 86_400_000;
const at = (now: Date, days: number) => new Date(now.getTime() + days * DAY).toISOString();

const base = { circulatingSupply: null, maxSupply: 1_000_000_000, marketCap: null, untrackedAmount: 0, source: "SAMPLE (fictional token, not Tokenomist data)", isSample: true };

export function sampleTokens(now = new Date()): { token: TokenInfo; events: UnlockEvent[] }[] {
  return [
    {
      token: { ...base, id: "sample-cliff", name: "Sample Cliff Token", symbol: "SCLF", totalLockedAmount: 550_000_000, tbdLockedAmount: 0, unlockedAmount: 450_000_000, lastUpdated: at(now, -3) },
      events: [
        { date: at(now, 12), amount: 42_000_000, valueUsd: null, valueToMarketCapPct: 4.2, allocations: ["Early investors (sample)"] },
        { date: at(now, 42), amount: 15_000_000, valueUsd: null, valueToMarketCapPct: 1.5, allocations: ["Team (sample)"] },
      ],
    },
    {
      token: { ...base, id: "sample-drip", name: "Sample Drip Token", symbol: "SDRP", totalLockedAmount: 200_000_000, tbdLockedAmount: 0, unlockedAmount: 800_000_000, lastUpdated: at(now, -3) },
      events: [7, 14, 21, 28, 35].map((d) => ({ date: at(now, d), amount: 3_000_000, valueUsd: null, valueToMarketCapPct: 0.3, allocations: ["Ecosystem (sample)"] })),
    },
    {
      token: { ...base, id: "sample-steady", name: "Sample Steady Token", symbol: "SSTD", totalLockedAmount: 0, tbdLockedAmount: 0, unlockedAmount: 1_000_000_000, lastUpdated: at(now, -3) },
      events: [],
    },
  ];
}
