"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useI18n } from "@/i18n/provider";
import { UPAL_COPY, UPAL_UI } from "@/i18n/upal";
import { LOCALE_INFO } from "@/lib/locale";
import { LocaleSelect } from "../LocaleSelect";
import { speak, VOICE_SOURCE_NOTE } from "../speak";
import { TOOL_LABEL, useUPal } from "./UPalProvider";
import { MicIcon, SendIcon, UPalAvatar } from "./icons";

/** Makes /listing/… and /cobuy/… paths in AI text clickable. */
function withLinks(text: string) {
  return text.split(/(\/(?:listing|cobuy)\/[a-z0-9-]+(?:\/offers)?)/g).map((part, i) =>
    i % 2 ? <Link key={i} href={part} className="font-semibold underline">{part}</Link> : part,
  );
}

/** The U-Pal conversation: greeting, suggestions, messages, voice controls and composer. Shared by the widget and /assistant. */
export function UPalChat({ variant, inputRef, initialQuestion = "" }: { variant: "panel" | "page"; inputRef?: RefObject<HTMLInputElement | null>; initialQuestion?: string }) {
  const { t } = useI18n();
  const { messages, busy, send, locale, setLocale, page, voice } = useUPal();
  const [input, setInput] = useState(initialQuestion);
  const [status, setStatus] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ui = UPAL_UI[locale];
  const copy = UPAL_COPY[locale];
  const suggestions = copy.suggestions[page.kind];
  const inCall = voice.status === "connected";
  const voiceBusy = voice.status === "connecting" || voice.status === "disconnecting";
  const last = messages.at(-1);
  const waiting = (busy && last?.role === "assistant" && !last.content) || (last?.via === "voice" && last.role === "assistant" && !last.content);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, waiting]);

  function submit(text: string) {
    if (!text.trim()) return;
    void send(text);
    setInput("");
  }

  return (
    <div className={`upal-chat upal-chat--${variant}`} dir={LOCALE_INFO[locale].dir}>
      {variant === "page" && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <LocaleSelect id="chat-lang" value={locale} onChange={setLocale} label="Reply in" />
        </div>
      )}

      <div ref={threadRef} className="upal-thread" aria-live="polite">
        {messages.length === 0 && (
          <>
            <div className="upal-row">
              <UPalAvatar size={28} />
              <p className="upal-bubble upal-bubble--ai" lang={locale}>{copy.greeting[page.kind]}</p>
            </div>
            <ul className="upal-chips upal-chips--stack" aria-label={ui.suggested}>
              {suggestions.map((q) => (
                <li key={q}><button type="button" className="upal-chip" onClick={() => submit(q)} disabled={busy}>{q}</button></li>
              ))}
            </ul>
          </>
        )}

        <ol className="grid gap-3">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "upal-row upal-row--user" : "upal-row"}>
              {m.role === "assistant" && <UPalAvatar size={28} />}
              <div className="grid min-w-0 gap-1.5">
                {m.role === "assistant" && (m.tools?.length ?? 0) > 0 && (
                  <p className="flex flex-wrap gap-1.5">
                    {m.tools!.map((name, k) => <span key={k} className="upal-tool">⚙ {TOOL_LABEL[name] ? t(TOOL_LABEL[name]) : name}</span>)}
                  </p>
                )}
                {(m.content || m.role === "user") && (
                  <p dir="auto" lang={m.role === "assistant" ? locale : undefined} className={`upal-bubble ${m.role === "user" ? "upal-bubble--user" : m.error ? "upal-bubble--error" : "upal-bubble--ai"}`}>
                    {m.error && <span className="sr-only">Error: </span>}
                    {m.role === "assistant" ? withLinks(m.content) : m.content}
                  </p>
                )}
                {m.role === "assistant" && m.content && !m.error && m.via !== "voice" && !(busy && m.id === last?.id) && (
                  <button type="button" className="upal-listen" onClick={async () => setStatus(VOICE_SOURCE_NOTE[await speak(m.content, locale, audioRef.current)])}>
                    <span aria-hidden="true">🔊</span> {ui.listen}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>

        {waiting && (
          <div className="upal-row" role="status">
            <UPalAvatar size={28} />
            <span className="upal-typing" aria-label={ui.thinking}><i /><i /><i /></span>
          </div>
        )}
      </div>

      {messages.length > 0 && !busy && (
        <ul className="upal-chips upal-chips--row" aria-label={ui.suggested}>
          {suggestions.map((q) => (
            <li key={q}><button type="button" className="upal-chip" onClick={() => submit(q)}>{q}</button></li>
          ))}
        </ul>
      )}

      {(inCall || voiceBusy) && (
        <div className="upal-voicebar" role="status">
          <span className={`upal-live ${voice.isSpeaking ? "is-speaking" : ""}`}>
            <span aria-hidden="true" className="upal-live-dot" />
            {voice.status === "connecting" ? ui.connecting : voice.isSpeaking ? ui.speaking : ui.listening}
          </span>
          {inCall && (
            <>
              <button type="button" className="upal-pillbtn" aria-pressed={voice.isMuted} onClick={() => voice.setMuted(!voice.isMuted)}>{voice.isMuted ? ui.unmute : ui.mute}</button>
              <button type="button" className="upal-pillbtn upal-pillbtn--end" onClick={voice.end}>{ui.endVoice}</button>
            </>
          )}
        </div>
      )}
      {voice.notice && <p role="alert" className="upal-notice">{voice.notice}</p>}

      <form
        className="upal-composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
      >
        <label htmlFor={`upal-input-${variant}`} className="sr-only">{ui.placeholder}</label>
        <input
          ref={inputRef}
          id={`upal-input-${variant}`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          dir="auto"
          placeholder={ui.placeholder}
          autoComplete="off"
          className="upal-input"
        />
        <button
          type="button"
          className={`upal-iconbtn ${inCall ? "is-active" : ""}`}
          onClick={inCall ? voice.end : voice.start}
          disabled={voiceBusy}
          aria-pressed={inCall}
          aria-label={inCall ? ui.endVoice : ui.startVoice}
          title={inCall ? ui.endVoice : ui.startVoice}
        >
          <MicIcon />
        </button>
        <button type="submit" className="upal-iconbtn upal-iconbtn--send" disabled={busy || !input.trim()} aria-label={ui.send} title={ui.send}>
          <SendIcon />
        </button>
      </form>
      <p role="status" className="sr-only">{busy ? ui.thinking : status}</p>
      {status && <p className="upal-fineprint">{status}</p>}
      <p className="upal-fineprint">{ui.disclaimer}</p>
      <audio ref={audioRef} className="sr-only" />
    </div>
  );
}
