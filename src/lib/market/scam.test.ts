import { describe, expect, it } from "vitest";
import { seed } from "../seed";
import { scamCheckForListing } from "./listing-scam";
import { assessListing, scanMessage, scanText, withAiOpinion, type ListingScamInput } from "./scam";

const now = new Date("2026-10-16T00:00:00Z");
const base = (over: Partial<ListingScamInput> = {}): ListingScamInput => ({
  askingThb: 4_000_000, likelyThb: 4_000_000, photoHashes: ["aaa"], otherPhotos: [], sellerId: "u-malee",
  deedOwnerMismatch: false, seller: { accountCreatedAt: "2025-01-01T00:00:00Z", activeListings: 2, maxListingPriceThb: 6_000_000 },
  description: "1-bed condo near BTS", chatFlags: [], now, ...over,
});
const codes = (r: ReturnType<typeof assessListing>) => r.flags.map((f) => `${f.code}:${f.severity}`);

describe("price far below the estimate (R11)", () => {
  it.each([
    [2_600_000, "price_far_below:critical"], // 35% below
    [3_000_000, "price_far_below:critical"], // exactly 75%
    [3_400_000, "price_far_below:warning"], // exactly 85%
    [3_440_000, null], // 86%
  ] as const)("asking %i vs likely 4,000,000 → %s", (asking, expected) => {
    const r = assessListing(base({ askingThb: asking }));
    expect(codes(r)).toEqual(expected ? [expected] : []);
  });

  it("explains the reason in plain language, with the Land Office advice", () => {
    const r = assessListing(base({ askingThb: 2_600_000 }));
    expect(r.badge).toBe("scam_alert");
    expect(r.needsReview).toBe(true);
    expect(r.reasons[0]).toBe("Priced 35% below our estimate. Never pay a deposit before visiting and checking the deed at the Land Office.");
  });

  it("does not run without an estimate ('Not enough data')", () => {
    expect(assessListing(base({ askingThb: 1, likelyThb: null })).flags).toEqual([]);
  });
});

describe("other listing rules", () => {
  it("duplicate photo only counts when a different seller uses it", () => {
    const same = assessListing(base({ otherPhotos: [{ sha256: "aaa", sellerId: "u-malee", listingId: "l-house" }] }));
    const other = assessListing(base({ otherPhotos: [{ sha256: "aaa", sellerId: "u-x", listingId: "l-fake" }] }));
    expect(same.flags).toEqual([]);
    expect(codes(other)).toEqual(["duplicate_photo:critical"]);
    expect(other.flags[0].evidence).toEqual({ other_listing_id: "l-fake" });
  });

  it("deed owner mismatch is critical", () => {
    expect(codes(assessListing(base({ deedOwnerMismatch: true })))).toEqual(["deed_mismatch:critical"]);
  });

  it.each([
    ["6 days old, 3 listings", "2026-10-10T00:00:00Z", 3, 5_000_000, true],
    ["6 days old, one ฿12M listing", "2026-10-10T00:00:00Z", 1, 12_000_000, true],
    ["6 days old, 2 listings under ฿10M", "2026-10-10T00:00:00Z", 2, 9_000_000, false],
    ["8 days old, 5 listings", "2026-10-08T00:00:00Z", 5, 20_000_000, false],
  ] as const)("seller velocity: %s", (_name, created, active, max, flagged) => {
    const r = assessListing(base({ seller: { accountCreatedAt: created, activeListings: active, maxListingPriceThb: max } }));
    expect(codes(r)).toEqual(flagged ? ["seller_velocity:warning"] : []);
    if (flagged) expect(r.badge).toBe("warning");
  });

  it("urgency pressure only counts together with a low price (description or chat)", () => {
    expect(codes(assessListing(base({ description: "Today only! Many buyers waiting." })))).toEqual([]);
    expect(codes(assessListing(base({ askingThb: 3_300_000, description: "Today only! Many buyers waiting." })))).toEqual(["price_far_below:warning", "urgency_pressure:warning"]);
    expect(codes(assessListing(base({ askingThb: 3_300_000, chatTexts: ["ขายด่วนมาก วันนี้วันเดียว"] })))).toEqual(["price_far_below:warning", "urgency_pressure:warning"]);
  });

  it("chat payment flags add a listing warning without copying message text", () => {
    const chatFlags = scanMessage("Please transfer the deposit to my personal account");
    const r = assessListing(base({ chatFlags }));
    expect(codes(r)).toEqual(["offplatform_payment:warning"]);
    expect(JSON.stringify(r.flags[0].evidence)).not.toMatch(/transfer|account/);
  });

  it("several critical rules give one Scam alert with every reason", () => {
    const r = assessListing(base({ askingThb: 2_000_000, deedOwnerMismatch: true, otherPhotos: [{ sha256: "aaa", sellerId: "u-x", listingId: "l-fake" }] }));
    expect(r.badge).toBe("scam_alert");
    expect(r.reasons).toHaveLength(3);
  });
});

describe("chat phrase guard in 5 languages", () => {
  it.each([
    ["en", "Please transfer the deposit to my account before the viewing", "payment"],
    ["en", "Pay the booking fee now, then I send the keys", "payment"],
    ["en", "Add me on LINE, my LINE ID is below", "payment"],
    ["en", "Send me a photo of your passport", "identity"],
    ["th", "โอนมัดจำมาที่บัญชีส่วนตัวได้เลยค่ะ", "payment"],
    ["th", "รบกวนส่งรูปบัตรประชาชนมาด้วย", "identity"],
    ["th", "โอนมัดจำก่อนนะคะ", "payment"], // ำ survives NFKC normalisation
    ["en", "ＡＤＤ ＭＥ ＯＮ ＬＩＮＥ", "payment"], // full-width letters
    ["ar", "حوِّل العربون إلى حسابي الشخصي", "payment"], // with diacritics
    ["zh-Hant", "請先付訂金，匯款到我的帳戶", "payment"],
    ["es", "Transfiere el depósito a mi cuenta personal", "payment"],
  ] as const)("%s: %s → %s", (_l, text, category) => {
    expect(scanText(text).categories).toContain(category);
    expect(scanMessage(text).length).toBeGreaterThan(0);
  });

  it.each([
    "Can I visit on Saturday?",
    "I will pay through U-Estate after we check the deed at the Land Office.",
    "วันเสาร์ไปดูห้องได้ไหมคะ",
    "هل يمكنني زيارة الشقة يوم السبت؟",
    "請問週末可以看房嗎？",
    "¿Puedo visitar el sábado?",
  ])("normal message is not flagged: %s", (text) => {
    expect(scanMessage(text)).toEqual([]);
  });

  it("pressure phrases alone never raise a chat banner", () => {
    expect(scanText("today only").categories).toEqual(["pressure"]);
    expect(scanMessage("today only")).toEqual([]);
  });
});

describe("AI chat classifier can only add a warning", () => {
  it("adds a warning when no rule matched and the AI says risky", () => {
    const f = withAiOpinion([], { risky: true, category: "payment", reason: "asks for a wire to an unknown person" });
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("warning");
    expect(f[0].evidence).toEqual({ category: "payment", source: "ai" });
  });

  it("never overrides rules, never adds critical, ignores 'none' and pressure", () => {
    const rules = scanMessage("โอนมัดจำก่อนนะ");
    expect(withAiOpinion(rules, { risky: true, category: "identity", reason: "x" })).toBe(rules);
    expect(withAiOpinion([], { risky: false, category: "none", reason: "" })).toEqual([]);
    expect(withAiOpinion([], { risky: true, category: "pressure", reason: "" })).toEqual([]);
    expect(withAiOpinion([], null)).toEqual([]);
  });
});

describe("scam check on the demo data store", () => {
  it("the seed listings are clean", () => {
    const db = seed(now);
    for (const l of db.listings) expect(scamCheckForListing(db, l.id, now)?.flags).toEqual([]);
    expect(scamCheckForListing(db, "nope", now)).toBeNull();
  });

  it("a condo priced far below the model's estimate becomes a Scam alert", () => {
    const db = seed(now);
    db.listings.find((l) => l.id === "l-condo")!.askingPriceThb = 2_500_000;
    const r = scamCheckForListing(db, "l-condo", now)!;
    expect(r.badge).toBe("scam_alert");
    expect(r.flags[0].code).toBe("price_far_below");
  });

  it("reads the deed owner mismatch from the latest deed check", () => {
    const db = seed(now);
    db.documentChecks.push({
      id: "dc-x", listingId: "l-house", fileName: "sample.png", createdAt: now.toISOString(), extraction: {}, outcome: "needs_review", humanReview: "pending",
      flags: [{ severity: "critical", message: 'Owner name on the deed ("Somsak") does not match the seller (Khun Malee).' }],
    });
    expect(codes(scamCheckForListing(db, "l-house", now)!)).toEqual(["deed_mismatch:critical"]);
  });
});
