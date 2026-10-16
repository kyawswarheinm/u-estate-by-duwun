"use client";
import { useI18n } from "@/i18n/provider";

import Link from "next/link";
import { useRef, useState } from "react";
import { LOCALE_INFO, type Locale } from "@/lib/locale";
import { LocaleSelect } from "./LocaleSelect";
import { speak, VOICE_SOURCE_NOTE } from "./speak";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[]; error?: boolean };

const TOOL_LABEL: Record<string, string> = {
  search_listings: "Searched listings",
  get_listing_facts: "Checked listing facts",
  compute_fees: "Calculated fees",
  check_token_unlocks: "Checked token unlocks (Tokenomist)",
  get_cobuy_rules: "Read co-buy rules",
};
const EXAMPLES = [
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
  const { locale: uiLocale } = useI18n();
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
    setStatus("Thinking…");
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
      update((m) => ({ ...m, error: !m.content, content: m.content || (e instanceof Error ? e.message : "Something went wrong.") }));
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <LocaleSelect id="chat-lang" value={locale} onChange={setLocale} label="Reply in" />
        <span className="text-sm text-ink-soft">Prefer to talk? Use <strong>Talk to U-Estate</strong> (bottom corner).</span>
      </div>

      {messages.length === 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Example questions">
          {EXAMPLES.map((q) => (
            <li key={q}><button type="button" onClick={() => send(q)} className="rounded-full border border-line px-3 py-2 text-sm hover:bg-mist">{q}</button></li>
          ))}
        </ul>
      )}

      <ol aria-live="polite" className="grid gap-3">
        {messages.map((m, i) => (
          <li key={i} className={m.role === "user" ? "justify-self-end rounded-xl bg-mist p-3" : "rounded-xl border border-line p-3"}>
            {m.role === "assistant" && (
              <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                <span className="rounded bg-ink px-1.5 py-0.5 font-semibold text-paper">AI</span>
                {(m.tools ?? []).map((t, k) => <span key={k} className="rounded-full bg-teal-soft px-2 py-0.5 text-teal">⚙ {TOOL_LABEL[t] ?? t}</span>)}
              </p>
            )}
            <p dir="auto" lang={m.role === "assistant" ? locale : undefined} className="whitespace-pre-wrap">{m.role === "assistant" ? withLinks(m.content) || "…" : m.content}</p>
            {m.role === "assistant" && m.content && !m.error && !(busy && i === messages.length - 1) && (
              <button type="button" onClick={async () => setStatus(VOICE_SOURCE_NOTE[await speak(m.content, locale, audioRef.current)])} className="mt-2 rounded border border-line px-2 py-1 text-sm">
                <span aria-hidden="true">🔊</span> Listen
              </button>
            )}
          </li>
        ))}
      </ol>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">Your question</label>
        <input id="chat-input" value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} dir="auto" placeholder="Ask about a listing, fees, co-buying or paying with crypto…" className="min-w-0 flex-1 rounded border border-line px-3 py-3" />
        <button type="submit" disabled={busy || !input.trim()} className="rounded-lg bg-ink px-5 py-3 font-semibold text-paper disabled:opacity-60">Send</button>
      </form>
      <p role="status" className="text-sm text-ink-soft">{status}</p>
      <p className="text-xs text-ink-soft" dir={LOCALE_INFO[locale].dir}>AI answers use U-Estate data through tools. Estimates, not financial or legal advice.</p>
      <audio ref={audioRef} className="sr-only" />
    </div>
  );
}
