// U-Pal page awareness: which kind of page the user is on, and what that page tells the assistant.
// The greetings, suggestions and contextual questions per page live in src/i18n/upal.ts (all five languages);
// which question sets each page uses is decided here, in one place.

/** "rent" is the market page in Rent mode (it publishes mode: "rent" in its facts). */
export type PageKind = "home" | "market" | "rent" | "sell" | "listing" | "cobuy" | "coinvest" | "wallet" | "dashboard" | "ledger" | "assistant" | "other";
export const PAGE_KINDS = ["home", "market", "rent", "sell", "listing", "cobuy", "coinvest", "wallet", "dashboard", "ledger", "assistant", "other"] as const;

export function pageKindFor(pathname: string): PageKind {
  const p = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  if (p === "/market") return "market";
  if (p === "/sell") return "sell";
  if (/^\/listing\/[^/]+(?:\/offers)?$/.test(p) || /^\/market\/rl-[a-f0-9]+$/.test(p)) return "listing";
  if (/^\/cobuy\/[^/]+$/.test(p)) return "cobuy";
  if (p === "/coinvest" || p.startsWith("/coinvest/") || p === "/premium") return "coinvest";
  if (p === "/account/wallet" || p.startsWith("/account/wallet/")) return "wallet";
  if (p === "/account" || p.startsWith("/account/")) return "dashboard";
  if (p === "/ledger") return "ledger";
  if (p === "/assistant") return "assistant";
  return "other";
}

/** Who is asking: questions never suggest something the user cannot open without saying what it needs. */
export type UPalTier = "guest" | "standard" | "premium";

/** Question sets, shared by all languages. A page can draw from several (the market page has listings, a map and analytics). */
export type QuestionSet = "home" | "listings" | "details" | "map" | "analytics" | "rent" | "sell" | "cobuy" | "coinvest" | "wallet" | "dashboard" | "ledger" | "other";
export const QUESTION_SETS = ["home", "listings", "details", "map", "analytics", "rent", "sell", "cobuy", "coinvest", "wallet", "dashboard", "ledger", "other"] as const;

export const PAGE_QUESTION_SETS: Record<PageKind, readonly QuestionSet[]> = {
  home: ["home"],
  market: ["listings", "map", "analytics"],
  rent: ["rent", "map"],
  listing: ["details"],
  sell: ["sell"],
  cobuy: ["cobuy"],
  coinvest: ["coinvest"],
  wallet: ["wallet"],
  dashboard: ["dashboard"],
  ledger: ["ledger"],
  assistant: [], // the full-page chat already shows its suggestions
  other: ["other"],
};

/** One contextual question in U-Pal's voice. `for` limits it to some users (default: everyone). */
export type UPalQuestion = { q: string; for?: readonly UPalTier[] };

/** The questions a page offers this user, in config order. */
export function questionsFor(sets: Record<QuestionSet, readonly UPalQuestion[]>, kind: PageKind, tier: UPalTier): string[] {
  return PAGE_QUESTION_SETS[kind].flatMap((s) => sets[s]).filter((x) => !x.for || x.for.includes(tier)).map((x) => x.q);
}

/** The next question to show: rotates through the list, never the one shown last time when there is another. */
export function pickQuestion(list: readonly string[], lastShown: string | null): string | null {
  if (list.length === 0) return null;
  const at = lastShown ? list.indexOf(lastShown) : -1;
  return list[(at + 1) % list.length];
}

/** Facts a page publishes for U-Pal. Values come from the page's own server data, never typed by the user. */
export type PageFacts = Record<string, string | number | boolean | null>;
export type PageContext = { kind: PageKind; path: string; facts?: PageFacts };

export const MAX_FACTS = 24;

type Turn = { role: "user" | "assistant"; content: string; error?: boolean };

/** Chat history for /api/assistant: no empty or error turns, roles alternate, starts with the user, at most 20 turns. */
export function toHistory(messages: Turn[]) {
  const turns: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    const content = m.content.trim();
    if (!content || m.error) continue;
    const last = turns.at(-1);
    if (last?.role === m.role) last.content = `${last.content}\n${content}`.slice(0, 2000);
    else turns.push({ role: m.role, content: content.slice(0, 2000) });
  }
  const recent = turns.slice(-20);
  while (recent[0]?.role === "assistant") recent.shift();
  return recent;
}

/** A short, plain-text description of the page for the assistant's system prompt or the voice agent. */
export function describeContext(ctx: PageContext) {
  const facts = ctx.facts && Object.keys(ctx.facts).length ? ` On screen: ${JSON.stringify(ctx.facts)}` : "";
  return `The user is viewing ${ctx.path} (${ctx.kind} page).${facts}`;
}
