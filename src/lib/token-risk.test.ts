import { describe, expect, it } from "vitest";
import { assessTokenFunding, type TokenInfo, type UnlockEvent } from "./token-risk";

const now = new Date("2026-10-15T00:00:00Z");
const payBy = new Date("2026-10-29T00:00:00Z"); // window ends 7 settle days later: 5 Nov

const token = (over: Partial<TokenInfo> = {}): TokenInfo => ({
  id: "t", name: "Test", symbol: "TST", circulatingSupply: 400, maxSupply: 1000, marketCap: 1_000_000,
  totalLockedAmount: 600, tbdLockedAmount: 0, unlockedAmount: 400, untrackedAmount: 0,
  lastUpdated: "2026-10-01T00:00:00Z", source: "test", isSample: true, ...over,
});
const ev = (date: string, pct: number | null): UnlockEvent => ({ date, amount: 10, valueUsd: 1000, valueToMarketCapPct: pct, allocations: ["Investors"] });

describe("token funding check (T1)", () => {
  it("unknown when the token is not tracked", () => {
    const r = assessTokenFunding({ token: null, events: [], now, payBy, depositThb: 1_000_000 });
    expect(r.level).toBe("unknown");
    expect(r.tokenValueToHoldThb).toBe(1_500_000);
  });

  it("low when all supply is unlocked", () => {
    const r = assessTokenFunding({ token: token({ totalLockedAmount: 0, unlockedAmount: 1000 }), events: [], now, payBy, depositThb: 100_000 });
    expect(r.level).toBe("low");
    expect(r.lockedSharePct).toBe(0);
    expect(r.tokenValueToHoldThb).toBe(115_000);
  });

  it("unknown when supply is locked but no future dates are returned (past-only data plan)", () => {
    const r = assessTokenFunding({ token: token(), events: [ev("2026-09-01T00:00:00Z", 4)], now, payBy, depositThb: 100_000 });
    expect(r.level).toBe("unknown");
    expect(r.lockedSharePct).toBe(60);
  });

  it("high when a big unlock lands inside the window (incl. the 7 settle days)", () => {
    const r = assessTokenFunding({ token: token(), events: [ev("2026-11-03T00:00:00Z", 3.5)], now, payBy, depositThb: 100_000 });
    expect(r.level).toBe("high");
    expect(r.eventsInWindow).toHaveLength(1);
    expect(r.tokenValueToHoldThb).toBe(150_000);
  });

  it("medium for several small unlocks summing over 1%", () => {
    const r = assessTokenFunding({ token: token(), events: [ev("2026-10-20T00:00:00Z", 0.6), ev("2026-10-27T00:00:00Z", 0.6)], now, payBy, depositThb: 100_000 });
    expect(r.level).toBe("medium");
    expect(r.unlockPctInWindow).toBe(1.2);
  });

  it("low when the next unlock is after the window", () => {
    const r = assessTokenFunding({ token: token(), events: [ev("2026-12-15T00:00:00Z", 8)], now, payBy, depositThb: 100_000 });
    expect(r.level).toBe("low");
    expect(r.nextUnlock?.date).toBe("2026-12-15T00:00:00Z");
  });

  it("unknown unlock values never count as low", () => {
    const r = assessTokenFunding({ token: token(), events: [ev("2026-10-20T00:00:00Z", null)], now, payBy, depositThb: 100_000 });
    expect(r.level).toBe("medium");
  });
});
