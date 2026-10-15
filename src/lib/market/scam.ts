// Scam & manipulation detection (R11, AI_SPEC §4.2). Rules decide; AI may only *add* a warning, never a critical flag.
// Output rows map 1:1 to `listing_flags` (code, severity, evidence). Evidence never holds personal data or message text.

export type Severity = "info" | "warning" | "critical";
export type FlagCode = "price_far_below" | "duplicate_photo" | "deed_mismatch" | "seller_velocity" | "offplatform_payment" | "urgency_pressure";

export interface ScamFlag {
  code: FlagCode;
  severity: Severity;
  evidence: Record<string, string | number | boolean>;
  /** Plain-language reason for the badge and the reviewer queue (English source; translated by the UI). */
  message: string;
}

export const SCAM_RULES = {
  priceCriticalRatio: 0.75, // asking ≤ 75% of the likely value → Scam alert
  priceWarningRatio: 0.85,
  newSellerDays: 7,
  newSellerListings: 3,
  newSellerHighValueThb: 10_000_000,
};

const LAND_OFFICE = "Never pay a deposit before visiting and checking the deed at the Land Office.";

// ---------- chat and description phrases (5 languages) ----------

export type PhraseCategory = "payment" | "identity" | "pressure";

/**
 * Lower-case, Unicode-normalised (NFKC folds full-width "ＬＩＮＥ" to "line"), Arabic diacritics and tatweel removed,
 * spaces collapsed. NFKC splits Thai SARA AM (ำ) into ํ + า, so it is recomposed for the Thai patterns to match.
 */
export function normaliseText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/ํา/g, "ำ")
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PHRASES: Record<PhraseCategory, RegExp[]> = {
  payment: [
    // English
    /transfer (the |a |your )?(deposit|booking fee|reservation fee|money|payment) (to|into) (my|our|this) (personal |private |own )?account/,
    /(deposit|pay|send|transfer)[^.?!]{0,30}(personal|private) account/,
    /pay (the |a )?(deposit|booking fee|reservation fee) (first|now|before (the )?(viewing|visit))/,
    /\bline id\b/, /\badd (me )?on line\b/, /\bwhatsapp me\b/, /\bwestern union\b/, /\bgift cards?\b/,
    /\b(usdt|bitcoin|btc|crypto)\b[^.?!]{0,30}\b(deposit|pay|transfer)\b|\b(deposit|pay|transfer)\b[^.?!]{0,30}\b(usdt|bitcoin|btc|crypto)\b/,
    // Thai
    /โอนมัดจำ/, /มัดจำก่อน/, /โอนเงินก่อน/, /โอนก่อน/, /บัญชีส่วนตัว/, /แอดไลน์/, /ไลน์ไอดี/, /ทักไลน์/,
    // Arabic
    /حول العربون/, /تحويل العربون/, /ادفع العربون/, /حسابي الشخصي/, /حساب شخصي/,
    // Traditional Chinese (and common simplified variants)
    /先付訂金/, /先付定金/, /先匯款/, /匯款到我的(個人)?帳戶/, /私人帳戶/, /个人账户/, /加line/, /加賴/,
    // Spanish
    /transfiere el dep[oó]sito/, /deposita en mi cuenta/, /cuenta personal/, /paga (el|la) (dep[oó]sito|se[nñ]al) (primero|ya|antes)/,
  ],
  identity: [
    /send (me )?(a )?(photo|picture|copy|scan) of (your )?(id|id card|passport)/, /(id card|passport) (photo|copy|number)/,
    /ส่งรูปบัตรประชาชน/, /สำเนาบัตรประชาชน/, /เลขบัตรประชาชน/,
    /صورة (الهوية|جواز السفر)/, /رقم الهوية/,
    /身分證(照片|影本|號碼)/, /護照(照片|影本)/,
    /(foto|copia) de (tu |su )?(dni|pasaporte|identificaci[oó]n)/,
  ],
  pressure: [
    /\btoday only\b/, /\bmany (other )?buyers (are )?waiting\b/, /\blast chance\b/, /\bmust (pay|decide) today\b/, /\burgent sale\b/,
    /วันนี้วันเดียว/, /มีคนรอซื้อ/, /ด่วนมาก/,
    /اليوم فقط/, /مشترين كثير/,
    /只限今天/, /很多人在等/, /急售/,
    /solo hoy/, /muchos compradores esperando/,
  ],
};

export interface PhraseMatch { categories: PhraseCategory[] }

/** Which risky phrase categories a text contains. Rules first; the AI classifier runs only when this is empty. */
export function scanText(text: string): PhraseMatch {
  const t = normaliseText(text);
  return { categories: (Object.keys(PHRASES) as PhraseCategory[]).filter((c) => PHRASES[c].some((re) => re.test(t))) };
}

export const CHAT_WARNING: Record<"payment" | "identity", string> = {
  payment: "This message asks for payment or contact outside U-Estate. Never transfer a deposit to a personal account or before checking the deed at the Land Office.",
  identity: "This message asks for ID documents. Never send ID card or passport photos in chat.",
};

/** Flags for one chat message: drives the recipient's warning banner and `messages.risk_flags`. */
export function scanMessage(text: string): ScamFlag[] {
  const { categories } = scanText(text);
  const risky = categories.filter((c): c is "payment" | "identity" => c !== "pressure");
  return risky.map((category) => ({ code: "offplatform_payment", severity: "warning", evidence: { category, source: "rules" }, message: CHAT_WARNING[category] }));
}

export interface ChatClassifierResult { risky: boolean; category: "payment" | "identity" | "pressure" | "none"; reason: string }

/**
 * Adds the AI chat classifier's opinion. It may only add a *warning*, and only when no rule matched (AI_SPEC §4.2).
 * The AI's free-text reason is not shown as evidence (it could quote personal data); the category is.
 */
export function withAiOpinion(ruleFlags: ScamFlag[], ai: ChatClassifierResult | null): ScamFlag[] {
  if (ruleFlags.length > 0 || !ai?.risky || ai.category === "none" || ai.category === "pressure") return ruleFlags;
  return [{ code: "offplatform_payment", severity: "warning", evidence: { category: ai.category, source: "ai" }, message: CHAT_WARNING[ai.category] }];
}

// ---------- listing assessment ----------

export interface ListingScamInput {
  askingThb: number;
  /** Likely value from the valuation engine; null when it says "Not enough data" (then no price rule runs). */
  likelyThb: number | null;
  /** SHA-256 of this listing's photos. */
  photoHashes: string[];
  /** Photos of every other listing, with their seller. */
  otherPhotos: { sha256: string; sellerId: string; listingId: string }[];
  sellerId: string;
  /** True when the deed check found an owner/seller name mismatch. */
  deedOwnerMismatch: boolean;
  seller: { accountCreatedAt: string; activeListings: number; maxListingPriceThb: number };
  description: string;
  /** Messages in this listing's conversations, already scanned with scanMessage (rules or AI). */
  chatFlags: ScamFlag[];
  /** Message texts, only checked for pressure phrases here (never copied into evidence). */
  chatTexts?: string[];
  now: Date;
}

export interface ListingScamResult {
  flags: ScamFlag[];
  /** "scam_alert" when any flag is critical; "warning" when only warnings; null when clean. */
  badge: "scam_alert" | "warning" | null;
  /** Any flag sends the listing to the human reviewer queue. */
  needsReview: boolean;
  reasons: string[];
}

export function assessListing(i: ListingScamInput): ListingScamResult {
  const flags: ScamFlag[] = [];

  let priceFlag: ScamFlag | null = null;
  if (i.likelyThb && i.likelyThb > 0) {
    const ratio = i.askingThb / i.likelyThb;
    const belowPct = Math.round((1 - ratio) * 100);
    const evidence = { asking_thb: i.askingThb, likely_thb: i.likelyThb, below_pct: belowPct };
    if (ratio <= SCAM_RULES.priceCriticalRatio) {
      priceFlag = { code: "price_far_below", severity: "critical", evidence, message: `Priced ${belowPct}% below our estimate. ${LAND_OFFICE}` };
    } else if (ratio <= SCAM_RULES.priceWarningRatio) {
      priceFlag = { code: "price_far_below", severity: "warning", evidence, message: `Priced ${belowPct}% below our estimate. Ask why before you pay anything.` };
    }
    if (priceFlag) flags.push(priceFlag);
  }

  const mine = new Set(i.photoHashes);
  const dup = i.otherPhotos.find((p) => mine.has(p.sha256) && p.sellerId !== i.sellerId);
  if (dup) {
    flags.push({ code: "duplicate_photo", severity: "critical", evidence: { other_listing_id: dup.listingId }, message: "A photo of this listing is also used by a different seller. The listing may be copied." });
  }

  if (i.deedOwnerMismatch) {
    flags.push({ code: "deed_mismatch", severity: "critical", evidence: { from: "deed_check" }, message: `The owner name on the deed does not match the seller. ${LAND_OFFICE}` });
  }

  const ageDays = (i.now.getTime() - new Date(i.seller.accountCreatedAt).getTime()) / 86_400_000;
  if (ageDays < SCAM_RULES.newSellerDays && (i.seller.activeListings >= SCAM_RULES.newSellerListings || i.seller.maxListingPriceThb > SCAM_RULES.newSellerHighValueThb)) {
    flags.push({
      code: "seller_velocity", severity: "warning",
      evidence: { account_age_days: Math.floor(ageDays), active_listings: i.seller.activeListings, max_listing_thb: i.seller.maxListingPriceThb },
      message: "New seller account with several or high-value listings. Check the seller's identity and the deed before paying.",
    });
  }

  const chatPayment = i.chatFlags.filter((f) => f.code === "offplatform_payment");
  if (chatPayment.length > 0) {
    flags.push({
      code: "offplatform_payment", severity: "warning",
      evidence: { messages: chatPayment.length, categories: [...new Set(chatPayment.map((f) => String(f.evidence.category)))].join(",") },
      message: "Messages about this listing asked for payment, contact or ID outside U-Estate.",
    });
  }

  const pressure = [i.description, ...(i.chatTexts ?? [])].some((t) => scanText(t).categories.includes("pressure"));
  if (priceFlag && pressure) {
    flags.push({ code: "urgency_pressure", severity: "warning", evidence: { with: "price_far_below" }, message: "Pressure to decide fast on an unusually low price is a common scam pattern." });
  }

  const badge = flags.some((f) => f.severity === "critical") ? "scam_alert" : flags.length ? "warning" : null;
  return { flags, badge, needsReview: flags.length > 0, reasons: flags.map((f) => f.message) };
}
