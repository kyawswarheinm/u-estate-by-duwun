"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ConversationProvider, useConversation, useConversationControls } from "@elevenlabs/react";
import { useI18n } from "@/i18n/provider";
import type { MessageKey } from "@/i18n";
import { UPAL_UI } from "@/i18n/upal";
import { LOCALE_INFO, type Locale } from "@/lib/locale";
import { describeContext, pageKindFor, toHistory, type PageContext, type PageFacts } from "@/lib/upal";

// U-Pal state shared by the floating widget and the /assistant page: one conversation (typed and spoken) that survives
// page changes, the current page context, and the ElevenLabs voice session. Lives in the root layout.
// The voice agent's tools are read-only and run through /api/agent-tools. Tool names must match
// scripts/create-voice-agent.mjs and src/lib/assistant-tools.ts (D-36).

export type UPalMsg = { id: number; role: "user" | "assistant"; content: string; tools?: string[]; error?: boolean; via?: "voice" };

// English source text = dictionary keys, so the tool chips follow the page language.
export const TOOL_LABEL: Record<string, MessageKey> = {
  search_listings: "Searched listings",
  get_listing_facts: "Checked listing facts",
  compute_fees: "Calculated fees",
  check_token_unlocks: "Checked token unlocks (Tokenomist)",
  get_cobuy_rules: "Read co-buy rules",
  open_page: "Opened a page",
  search_market_listings: "Searched other websites' listings",
  get_market_stats: "Checked market asking prices",
  get_price_forecast: "Checked the price forecast",
  compare_to_market: "Compared with the market",
  search_real_listings: "Searched third-party listings",
};
const SAFE_PATH = /^\/(?:$|listing\/[a-z0-9-]+(?:\/offers)?$|market\/rl-[a-f0-9]{12}$|cobuy\/[a-z0-9-]+$|ledger$|sell$|assistant$|market(?:\?[A-Za-z0-9=&_%+-]*)?$)/;

// Opening line per language (sent as an override; the agent must allow "First message" + "Language" overrides).
const FIRST_MESSAGE: Record<Locale, (name: string) => string> = {
  en: (n) => `Hi ${n}, I'm U-Pal, U-Estate's assistant. What kind of home are you looking for?`,
  th: (n) => `สวัสดีค่ะคุณ${n} ฉันคือ U-Pal ผู้ช่วยของ U-Estate กำลังมองหาบ้านแบบไหนอยู่คะ`,
  ar: (n) => `مرحبًا ${n}، أنا U-Pal، مساعد U-Estate. ما نوع المنزل الذي تبحث عنه؟`,
  "zh-Hant": (n) => `${n}您好，我是 U-Pal，U-Estate 的助理。您在找什麼樣的房子呢？`,
  es: (n) => `Hola ${n}, soy U-Pal, el asistente de U-Estate. ¿Qué tipo de vivienda buscas?`,
};

export type VoiceStatus = "disconnected" | "connecting" | "connected" | "disconnecting";
type UPalValue = {
  messages: UPalMsg[];
  busy: boolean;
  send: (text: string) => Promise<void>;
  locale: Locale;
  setLocale: (l: Locale) => void;
  page: PageContext;
  setFacts: (path: string, facts: PageFacts | null) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  voice: {
    status: VoiceStatus;
    isSpeaking: boolean;
    isMuted: boolean;
    notice: string;
    start: () => Promise<void>;
    end: () => void;
    setMuted: (muted: boolean) => void;
  };
};

const UPalContext = createContext<UPalValue | null>(null);

export function useUPal() {
  const value = useContext(UPalContext);
  if (!value) throw new Error("useUPal must be used inside <UPalProvider>");
  return value;
}

export function UPalProvider({ userName, children }: { userName: string; children: ReactNode }) {
  return (
    <ConversationProvider>
      <Inner userName={userName}>{children}</Inner>
    </ConversationProvider>
  );
}

function Inner({ userName, children }: { userName: string; children: ReactNode }) {
  const { locale: uiLocale } = useI18n();
  const router = useRouter();
  const pathname = usePathname() || "/";
  const [messages, setMessages] = useState<UPalMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [locale, setLocale] = useState<Locale>(uiLocale);
  const [open, setOpen] = useState(false);
  const [facts, setFactsState] = useState<{ path: string; facts: PageFacts } | null>(null);
  const [notice, setNotice] = useState("");
  const nextId = useRef(1);
  const messagesRef = useRef(messages);
  const busyRef = useRef(false);
  const endedByUser = useRef(false);
  const ui = UPAL_UI[locale];

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Follow the site language until the user picks a reply language themselves.
  const [lastUiLocale, setLastUiLocale] = useState(uiLocale);
  if (lastUiLocale !== uiLocale) {
    setLastUiLocale(uiLocale);
    setLocale(uiLocale);
  }

  const page = useMemo<PageContext>(() => {
    const pageFacts = facts?.path === pathname ? facts.facts : undefined;
    const base = pageKindFor(pathname);
    return { kind: base === "market" && pageFacts?.mode === "rent" ? "rent" : base, path: pathname, facts: pageFacts };
  }, [pathname, facts]);
  const pageRef = useRef(page);
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const setFacts = useCallback((path: string, next: PageFacts | null) => {
    setFactsState((prev) => (next ? { path, facts: next } : prev?.path === path ? null : prev));
  }, []);

  const push = useCallback((m: Omit<UPalMsg, "id">) => {
    const msg = { ...m, id: nextId.current++ };
    setMessages((all) => [...all.slice(-80), msg]);
    return msg.id;
  }, []);
  const patch = useCallback((id: number, fn: (m: UPalMsg) => UPalMsg) => setMessages((all) => all.map((m) => (m.id === id ? fn(m) : m))), []);

  // ---- Voice (ElevenLabs Agents over WebRTC) ----
  const addVoiceTool = (name: string) =>
    setMessages((all) => {
      const last = all.at(-1);
      if (last?.role === "assistant" && last.via === "voice" && !last.content) return [...all.slice(0, -1), { ...last, tools: [...(last.tools ?? []), name] }];
      return [...all, { id: nextId.current++, role: "assistant", content: "", tools: [name], via: "voice" }];
    });

  const serverTool = (name: string) => async (params: Record<string, unknown>) => {
    addVoiceTool(name);
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
      search_market_listings: serverTool("search_market_listings"),
      get_market_stats: serverTool("get_market_stats"),
      get_price_forecast: serverTool("get_price_forecast"),
      compare_to_market: serverTool("compare_to_market"),
      search_real_listings: serverTool("search_real_listings"),
      open_page: (params: Record<string, unknown>) => {
        const path = String(params.path ?? "");
        if (!SAFE_PATH.test(path)) return "That page is not available.";
        addVoiceTool("open_page");
        router.push(path);
        return `Opened ${path}`;
      },
    },
    onMessage: (m) => {
      if (m.role === "user") {
        push({ role: "user", content: m.message, via: "voice" });
        return;
      }
      setMessages((all) => {
        const last = all.at(-1);
        if (last?.role === "assistant" && last.via === "voice" && !last.content) return [...all.slice(0, -1), { ...last, content: m.message }];
        return [...all, { id: nextId.current++, role: "assistant", content: m.message, via: "voice" }];
      });
    },
    onConnect: () => setNotice(""),
    onDisconnect: (details) => {
      if (!endedByUser.current) setNotice(details?.reason === "error" ? ui.voiceError : ui.disconnected);
      endedByUser.current = false;
    },
    onError: () => setNotice(ui.voiceError),
  });
  const { sendContextualUpdate } = useConversationControls(); // stable reference
  const voiceStatus = conversation.status as VoiceStatus;
  const connected = voiceStatus === "connected";

  // Tell the agent what the user is looking at, once per change, without restarting the session.
  const pageDescription = describeContext(page);
  useEffect(() => {
    if (connected) sendContextualUpdate(pageDescription);
  }, [pageDescription, connected, sendContextualUpdate]);

  async function startVoice() {
    setNotice("");
    const r = await fetch("/api/voice/agent-token", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token) {
      setNotice(j.message ?? ui.voiceError);
      return;
    }
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((track) => track.stop());
    } catch {
      setNotice(ui.micDenied);
      return;
    }
    endedByUser.current = false;
    conversation.startSession({
      conversationToken: j.token,
      connectionType: "webrtc",
      dynamicVariables: { user_name: userName, locale_name: LOCALE_INFO[locale].english, current_page: pageRef.current.path },
      ...(locale !== "en" ? { overrides: { agent: { language: LOCALE_INFO[locale].agent, firstMessage: FIRST_MESSAGE[locale](userName) } } } : {}),
    });
  }
  function endVoice() {
    endedByUser.current = true;
    conversation.endSession();
  }

  // ---- Typed chat (streams NDJSON from /api/assistant) ----
  async function send(text: string) {
    const question = text.trim();
    if (!question || busyRef.current) return;
    if (connected) {
      // During a call, typed messages go to the voice agent so both stay one conversation.
      push({ role: "user", content: question, via: "voice" });
      conversation.sendUserMessage(question);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const history = toHistory([...messagesRef.current, { role: "user", content: question }]);
    push({ role: "user", content: question });
    const id = push({ role: "assistant", content: "", tools: [] });
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, messages: history, context: pageRef.current }),
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
          if (ev.type === "text") patch(id, (m) => ({ ...m, content: m.content + ev.text }));
          if (ev.type === "tool") patch(id, (m) => ({ ...m, tools: [...(m.tools ?? []), ev.name!] }));
          if (ev.type === "error") throw new Error(ev.message);
        }
      }
    } catch (e) {
      patch(id, (m) => ({ ...m, error: !m.content, content: m.content || (e instanceof Error ? e.message : "Something went wrong.") }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const value: UPalValue = {
    messages,
    busy,
    send,
    locale,
    setLocale,
    page,
    setFacts,
    open,
    setOpen,
    voice: {
      status: voiceStatus,
      isSpeaking: conversation.isSpeaking,
      isMuted: conversation.isMuted,
      notice,
      start: startVoice,
      end: endVoice,
      setMuted: (muted) => conversation.setMuted(muted),
    },
  };
  return <UPalContext.Provider value={value}>{children}</UPalContext.Provider>;
}

/** Pages render this with facts from their own server data, so U-Pal knows what is on screen. Renders nothing. */
export function UPalPageContext({ facts }: { facts: PageFacts }) {
  const { setFacts } = useUPal();
  const pathname = usePathname() || "/";
  const key = JSON.stringify(facts);
  useEffect(() => {
    setFacts(pathname, JSON.parse(key) as PageFacts);
    return () => setFacts(pathname, null);
  }, [pathname, key, setFacts]);
  return null;
}
