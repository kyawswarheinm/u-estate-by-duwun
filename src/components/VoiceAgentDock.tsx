"use client";
import { useI18n } from "@/i18n/provider";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ConversationProvider, useConversation, useConversationControls } from "@elevenlabs/react";
import { LOCALE_INFO, type Locale } from "@/lib/locale";
import { LocaleSelect } from "./LocaleSelect";

// E3: real-time voice conversation with U-Estate (ElevenLabs Agents, WebRTC).
// Lives in the root layout, so the conversation continues while the agent opens pages for you.
// The agent's tools are read-only (search, facts, fees, token unlocks, rules) and run through /api/agent-tools.

const TOOL_LABEL: Record<string, string> = {
  search_listings: "Searched listings",
  get_listing_facts: "Checked listing facts",
  compute_fees: "Calculated fees",
  check_token_unlocks: "Checked token unlocks (Tokenomist)",
  get_cobuy_rules: "Read co-buy rules",
  open_page: "Opened a page",
};
const SAFE_PATH = /^\/(?:$|listing\/[a-z0-9-]+(?:\/offers)?$|cobuy\/[a-z0-9-]+$|ledger$|partners$|sell$|assistant$)/;

type Line = { role: "user" | "agent" | "tool"; text: string };

// Opening line per language (sent as an override; the agent must allow "First message" + "Language" overrides).
const FIRST_MESSAGE: Record<Locale, (name: string) => string> = {
  en: (n) => `Hi ${n}, I'm U-Estate's assistant. What kind of home are you looking for?`,
  th: (n) => `สวัสดีค่ะคุณ${n} ฉันคือผู้ช่วยของ U-Estate กำลังมองหาบ้านแบบไหนอยู่คะ`,
  ar: (n) => `مرحبًا ${n}، أنا مساعد U-Estate. ما نوع المنزل الذي تبحث عنه؟`,
  "zh-Hant": (n) => `${n}您好，我是 U-Estate 的助理。您在找什麼樣的房子呢？`,
  es: (n) => `Hola ${n}, soy el asistente de U-Estate. ¿Qué tipo de vivienda buscas?`,
};

export function VoiceAgentDock({ userName }: { userName: string }) {
  return (
    <ConversationProvider>
      <Dock userName={userName} />
    </ConversationProvider>
  );
}

function Dock({ userName }: { userName: string }) {
  const { locale: uiLocale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(uiLocale);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const logRef = useRef<HTMLOListElement>(null);
  const add = (l: Line) => setLines((prev) => [...prev.slice(-40), l]);

  const serverTool = (name: string) => async (params: Record<string, unknown>) => {
    add({ role: "tool", text: TOOL_LABEL[name] ?? name });
    const r = await fetch("/api/agent-tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: name, input: params }) });
    const j = await r.json().catch(() => ({ message: "Tool failed" }));
    return JSON.stringify(r.ok ? j.result : { error: j.message ?? "Tool failed" });
  };

  const conversation = useConversation({
    clientTools: {
      search_listings: serverTool("search_listings"),
      get_listing_facts: serverTool("get_listing_facts"),
      compute_fees: serverTool("compute_fees"),
      check_token_unlocks: serverTool("check_token_unlocks"),
      get_cobuy_rules: serverTool("get_cobuy_rules"),
      open_page: (params: Record<string, unknown>) => {
        const path = String(params.path ?? "");
        if (!SAFE_PATH.test(path)) return "That page is not available.";
        add({ role: "tool", text: `${TOOL_LABEL.open_page}: ${path}` });
        router.push(path);
        return `Opened ${path}`;
      },
    },
    onMessage: (m) => add({ role: m.role === "user" ? "user" : "agent", text: m.message }),
    onError: (message) => setError(typeof message === "string" ? message : "The voice agent hit an error."),
  });
  const { sendContextualUpdate } = useConversationControls(); // stable reference
  const connected = conversation.status === "connected";

  // Tell the agent where the user is, so "this condo" makes sense.
  useEffect(() => {
    if (connected) sendContextualUpdate(`The user is now viewing ${pathname}`);
  }, [pathname, connected, sendContextualUpdate]);

  useEffect(() => {
    logRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [lines]);

  async function start() {
    setError("");
    const r = await fetch("/api/voice/agent-token", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) {
      setError(j.message ?? "Could not start the voice agent.");
      return;
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((t) => t.stop());
    } catch {
      setError("Microphone permission is needed for a voice conversation. You can use the typed chat instead.");
      return;
    }
    setLines([]);
    conversation.startSession({
      conversationToken: j.token,
      connectionType: "webrtc",
      dynamicVariables: { user_name: userName, locale_name: LOCALE_INFO[locale].english, current_page: pathname },
      ...(locale !== "en" ? { overrides: { agent: { language: LOCALE_INFO[locale].agent, firstMessage: FIRST_MESSAGE[locale](userName) } } } : {}),
    });
  }

  return (
    <div className="fixed bottom-4 end-4 z-50 flex flex-col items-end gap-2">
      {open && (
        <section aria-label="Talk to U-Estate" className="w-[min(92vw,380px)] rounded-xl border border-line bg-paper p-4 shadow-xl">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-bold">Talk to U-Estate <span className="rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-paper">AI</span></h2>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-sm underline">Close</button>
          </div>
          <p className="text-xs text-ink-soft">Live voice by ElevenLabs. It can search, explain prices and fees, check token unlocks and open pages. It cannot move money or sign anything. Not financial advice.</p>

          {!connected ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <LocaleSelect id="agent-lang" value={locale} onChange={setLocale} />
              <button type="button" onClick={start} disabled={conversation.status === "connecting"} className="rounded-lg bg-ink px-4 py-3 font-semibold text-paper disabled:opacity-60">
                {conversation.status === "connecting" ? "Connecting…" : "Start talking"}
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-teal-soft px-3 py-1 text-sm font-semibold text-teal" role="status">
                <span aria-hidden="true">●</span> {conversation.isSpeaking ? "U-Estate is speaking" : "Listening"}
              </span>
              <button type="button" onClick={() => conversation.setMuted(!conversation.isMuted)} aria-pressed={conversation.isMuted} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold">
                {conversation.isMuted ? "Unmute mic" : "Mute mic"}
              </button>
              <button type="button" onClick={() => conversation.endSession()} className="rounded-lg border border-red px-3 py-2 text-sm font-semibold text-red">End</button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 rounded bg-amber-soft p-2 text-sm text-amber">
              {error} <Link href="/assistant" className="underline">Use the typed chat</Link>
            </p>
          )}

          <ol ref={logRef} aria-live="polite" className="mt-3 grid max-h-64 gap-1 overflow-y-auto text-sm">
            {lines.map((l, i) => (
              <li key={i} dir="auto" className={l.role === "tool" ? "text-xs text-ink-soft" : l.role === "user" ? "rounded bg-mist p-2" : "rounded border border-line p-2"}>
                {l.role === "tool" ? `⚙ ${l.text}` : <><span className="font-semibold">{l.role === "user" ? "You" : "U-Estate"}:</span> {l.text}</>}
              </li>
            ))}
          </ol>

          {connected && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!typed.trim()) return;
                conversation.sendUserMessage(typed.trim());
                add({ role: "user", text: typed.trim() });
                setTyped("");
              }}
            >
              <label htmlFor="agent-typed" className="sr-only">Type to the agent</label>
              <input id="agent-typed" value={typed} onChange={(e) => { setTyped(e.target.value); conversation.sendUserActivity(); }} dir="auto" placeholder="…or type here" className="min-w-0 flex-1 rounded border border-line px-2 py-2" />
              <button type="submit" className="rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-paper">Send</button>
            </form>
          )}
        </section>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-full bg-ink px-5 py-3 font-semibold text-paper shadow-lg"
      >
        <span aria-hidden="true">🎙</span> {connected ? "In a call" : "Talk to U-Estate"}
      </button>
    </div>
  );
}
