// U-Pal page awareness: which kind of page the user is on, and what that page tells the assistant.
// The greetings, suggestions and invitations per page live in src/i18n/upal.ts.

/** "rent" is the market page in Rent mode (it publishes mode: "rent" in its facts). */
export type PageKind = "home" | "market" | "rent" | "sell" | "listing" | "ledger" | "assistant" | "other";
export const PAGE_KINDS = ["home", "market", "rent", "sell", "listing", "ledger", "assistant", "other"] as const;

export function pageKindFor(pathname: string): PageKind {
  const p = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  if (p === "/market") return "market";
  if (p === "/sell") return "sell";
  if (/^\/listing\/[^/]+(?:\/offers)?$/.test(p) || /^\/market\/rl-[a-f0-9]+$/.test(p)) return "listing";
  if (p === "/ledger") return "ledger";
  if (p === "/assistant") return "assistant";
  return "other";
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
