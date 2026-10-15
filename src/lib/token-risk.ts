// T1 "Can my crypto fund this deposit?" (D-34). Pure, unit-tested.
// Many U-topia members hold crypto and plan to sell it for a deposit or a co-buy share.
// If a large token unlock lands before they pay, the price can drop and they come up short.
// Code decides the level from Tokenomist unlock data; AI never does. U-Estate never accepts crypto.

export interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  circulatingSupply: number | null;
  maxSupply: number | null;
  marketCap: number | null;
  totalLockedAmount: number;
  tbdLockedAmount: number;
  unlockedAmount: number;
  untrackedAmount: number;
  lastUpdated: string;
  source: string; // "Tokenomist API v5" or "SAMPLE"
  isSample: boolean;
}

export interface UnlockEvent {
  date: string; // ISO
  amount: number; // tokens
  valueUsd: number | null;
  valueToMarketCapPct: number | null; // Tokenomist "valueToMarketCap"
  allocations: string[];
}

export type TokenRiskLevel = "low" | "medium" | "high" | "unknown";

export const TOKEN_RULES = {
  settleDays: 7, // time to sell, convert to THB and transfer before the payment date
  highWindowPct: 5, // unlocks in the window ≥ 5% of market cap → high
  highSinglePct: 3, // or one unlock ≥ 3% → high
  mediumWindowPct: 1, // ≥ 1% → medium
  // Safety buffer: hold this much more token value than the deposit (an assumption, not a prediction)
  bufferPct: { low: 15, medium: 30, high: 50, unknown: 50 } as Record<TokenRiskLevel, number>,
} as const;

export const TOKEN_ADVICE = [
  "U-Estate never accepts crypto. Sell and convert to THB through a licensed exchange before you commit.",
  "Foreign buyers: the THB must arrive from abroad with an FET form for condo ownership.",
  "This is risk information from unlock data, not investment advice.",
] as const;

export interface TokenFundingResult {
  level: TokenRiskLevel;
  windowStart: string;
  windowEnd: string;
  unlockPctInWindow: number | null;
  largestUnlockPct: number | null;
  eventsInWindow: UnlockEvent[];
  nextUnlock: UnlockEvent | null;
  lockedSharePct: number | null;
  bufferPct: number;
  depositThb: number;
  tokenValueToHoldThb: number;
  reasons: string[];
}

const DAY = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function assessTokenFunding(i: {
  token: TokenInfo | null;
  events: UnlockEvent[];
  now: Date;
  payBy: Date;
  depositThb: number;
}): TokenFundingResult {
  const windowStart = i.now;
  const windowEnd = new Date(Math.max(i.payBy.getTime(), i.now.getTime()) + TOKEN_RULES.settleDays * DAY);
  const base = { windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), depositThb: i.depositThb };
  const finish = (level: TokenRiskLevel, rest: Omit<TokenFundingResult, "level" | "bufferPct" | "tokenValueToHoldThb" | keyof typeof base>): TokenFundingResult => {
    const bufferPct = TOKEN_RULES.bufferPct[level];
    return { level, ...base, ...rest, bufferPct, tokenValueToHoldThb: Math.round(i.depositThb * (1 + bufferPct / 100)) };
  };

  if (!i.token) {
    return finish("unknown", {
      unlockPctInWindow: null, largestUnlockPct: null, eventsInWindow: [], nextUnlock: null, lockedSharePct: null,
      reasons: ["This token is not tracked by Tokenomist, so its unlock schedule is unknown."],
    });
  }

  const t = i.token;
  const tracked = t.totalLockedAmount + t.tbdLockedAmount + t.unlockedAmount + t.untrackedAmount;
  const lockedSharePct = tracked > 0 ? round1(((t.totalLockedAmount + t.tbdLockedAmount) / tracked) * 100) : null;
  const future = i.events
    .filter((e) => new Date(e.date).getTime() > i.now.getTime())
    .sort((a, b) => a.date.localeCompare(b.date));
  const inWindow = future.filter((e) => new Date(e.date).getTime() <= windowEnd.getTime());
  const nextUnlock = future[0] ?? null;
  const known = inWindow.map((e) => e.valueToMarketCapPct).filter((v): v is number => v !== null);
  const unlockPctInWindow = inWindow.length ? round1(known.reduce((s, v) => s + v, 0)) : 0;
  const largestUnlockPct = known.length ? round1(Math.max(...known)) : null;
  const rest: { unlockPctInWindow: number | null; largestUnlockPct: number | null; eventsInWindow: UnlockEvent[]; nextUnlock: UnlockEvent | null; lockedSharePct: number | null } =
    { unlockPctInWindow, largestUnlockPct, eventsInWindow: inWindow, nextUnlock, lockedSharePct };
  const days = Math.round((windowEnd.getTime() - windowStart.getTime()) / DAY);

  if (lockedSharePct === 0) {
    return finish("low", { ...rest, reasons: [`All tracked ${t.symbol} supply is already unlocked, so no unlock can add selling pressure.`] });
  }
  if (future.length === 0) {
    return finish("unknown", {
      ...rest,
      unlockPctInWindow: null,
      reasons: [
        `${lockedSharePct ?? "Some"}% of ${t.symbol} supply is still locked, but no upcoming unlock dates were returned.`,
        "The data plan may only include past unlocks. Treat the risk as unknown and keep a large buffer.",
      ],
    });
  }
  if (inWindow.length > 0 && known.length < inWindow.length) {
    rest.unlockPctInWindow = known.length ? unlockPctInWindow : null;
  }

  const reasons: string[] = [];
  let level: TokenRiskLevel = "low";
  if (inWindow.length === 0) {
    reasons.push(`No ${t.symbol} unlocks are scheduled in the next ${days} days (until ${windowEnd.toISOString().slice(0, 10)}).`);
  } else {
    const worth = known.length ? `worth ${unlockPctInWindow}% of its market cap` : "of unknown value";
    reasons.push(`${inWindow.length} ${t.symbol} unlock${inWindow.length > 1 ? "s" : ""} before you need the money, ${worth}.`);
    if (unlockPctInWindow >= TOKEN_RULES.highWindowPct || (largestUnlockPct ?? 0) >= TOKEN_RULES.highSinglePct) level = "high";
    else if (unlockPctInWindow >= TOKEN_RULES.mediumWindowPct) level = "medium";
    if (known.length < inWindow.length) {
      reasons.push("Some unlock values are unknown, so the share may be higher.");
      if (level === "low") level = "medium";
    }
  }
  if (nextUnlock && !inWindow.includes(nextUnlock)) {
    reasons.push(`Next unlock after that: ${nextUnlock.date.slice(0, 10)}.`);
  }
  return finish(level, { ...rest, reasons });
}
