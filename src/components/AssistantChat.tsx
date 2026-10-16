"use client";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";
import { SLOT, withSlot } from "@/i18n/slot";

import Link from "next/link";
import { useRef, useState } from "react";
import { LOCALE_INFO, type Locale } from "@/lib/locale";
import { LocaleSelect } from "./LocaleSelect";
import { speak, VOICE_SOURCE_NOTE } from "./speak";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[]; error?: boolean };

const TOOL_LABEL: Record<string, MessageKey> = {
  search_listings: "Searched listings",
  get_listing_facts: "Checked listing facts",
  compute_fees: "Calculated fees",
  check_token_unlocks: "Checked token unlocks (Tokenomist)",
  get_cobuy_rules: "Read co-buy rules",
  search_market_listings: "Searched other websites' listings",
  get_market_stats: "Checked market asking prices",
  get_price_forecast: "Checked the price forecast",
  compare_to_market: "Compared with the market",
};
const EXAMPLES: MessageKey[] = [
  "Find a condo under 4 million baht",
  "What are the fees on l-condo if I'm a U-topia member?",
  "I'm Australian. Can I co-buy the house in Bang Yai?",
  "I'll sell sample-cliff to pay a ฿1,000,000 share within 14 days. Is that risky?",
];

/** Makes /listing/… and /cobuy/… paths in AI text clickable. */
function withLinks(text: string) {
  return text.split(/(\/(?:listing|cobuy)\/[a-z0-9-]+(?:\/offers)?)/g).map((part, i) =>
    i % 2 ? <Link key={i} href={part} className="font-semibold underline">{part}</Link> : part,
  );
}

// Typed real-time chat (streams as Claude writes). Same read-only tools as the voice agent.
export function AssistantChat({ initialQuestion = "" }: { initialQuestion?: string } = {}) {
  const { locale: uiLocale, t } = useI18n();
  const [locale, setLocale] = useState<Locale>(uiLocale);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState(initialQuestion); // e.g. from /market's "Ask the AI about this market"
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: question }];
    setMessages([...history, { role: "assistant", content: "", tools: [] }]);
    setInput("");
    setBusy(true);
    setStatus(t("Thinking…"));
    const update = (fn: (m: Msg) => Msg) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, messages: history.map(({ role, content }) => ({ role, content })) }),
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.message ?? "AI is unavailable right now.");
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as { type: string; text?: string; name?: string; message?: string };
          if (ev.type === "text") update((m) => ({ ...m, content: m.content + ev.text }));
          if (ev.type === "tool") update((m) => ({ ...m, tools: [...(m.tools ?? []), ev.name!] }));
          if (ev.type === "error") throw new Error(ev.message);
        }
      }
      setStatus("");
    } catch (e) {
      update((m) => ({ ...m, error: !m.content, content: m.content || (e instanceof Error ? e.message : t("Something went wrong.")) }));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-surface grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <LocaleSelect id="chat-lang" value={locale} onChange={setLocale} label={t("Reply in")} />
        <span className="text-sm text-ink-soft">{withSlot(t("Prefer to talk? Use {voice} (bottom corner).", { voice: SLOT }), <strong>{t("Talk to U-Estate")}</strong>)}</span>
      </div>

      {messages.length === 0 && (
        <ul className="suggested-questions" aria-label={t("Example questions")}>
          {EXAMPLES.map((q) => (
            <li key={q}><button type="button" onClick={() => send(t(q))} className="rounded-full border border-line px-3 py-2 text-sm hover:bg-mist">{t(q)}</button></li>
          ))}
        </ul>
      )}

      <ol aria-live="polite" className="grid gap-3">
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "justify-self-end rounded-xl bg-mist p-3" : "rounded-xl border border-line p-3"}>
            {m.role === "assistant" && (
              <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <span className="rounded bg-ink px-1.5 py-0.5 font-semibold text-paper">AI</span>
                {(m.tools ?? []).map((tool, k) => <span key={k} className="rounded-full bg-teal-soft px-2 py-0.5 text-teal">⚙ {TOOL_LABEL[tool] ? t(TOOL_LABEL[tool]) : tool}</span>)}
              </p>
            )}
            <p dir="auto" lang={m.role === "assistant" ? locale : undefined} className="whitespace-pre-wrap break-words">{m.role === "assistant" ? withLinks(m.content) || "…" : m.content}</p>
            {m.role === "assistant" && m.content && !m.error && !(busy && i === messages.length - 1) && (
              <button type="button" onClick={async () => setStatus(t(VOICE_SOURCE_NOTE[await speak(m.content, locale, audioRef.current)]))} className="mt-2 rounded border border-line px-2 py-1 text-sm">
                <span aria-hidden="true">🔊</span> {t("Listen")}
              </button>
            )}
          </li>
        ))}
      </ol>

      <form
        className="chat-composer flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">{t("Your question")}</label>
        <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} dir="auto" placeholder={t("Ask about a listing, fees, co-buying or paying with crypto…")} className="min-w-0 flex-1 rounded border border-line px-3 py-3" />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-ink px-5 py-3 font-semibold text-paper disabled:opacity-60">{t("Send")}</button>
      </form>
      <p role="status" className="text-sm text-ink-soft">{status}</p>
      <p className="text-xs text-ink-soft" dir={LOCALE_INFO[uiLocale].dir}>{t("AI answers use U-Estate data through tools. Estimates, not financial or legal advice.")}</p>
      <audio ref={audioRef} className="sr-only" />
    </div>
  );
}
