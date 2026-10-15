"use client";
import { useI18n } from "@/i18n/provider";

import { useRef, useState } from "react";
import { LOCALE_INFO, type Locale } from "@/lib/locale";
import { LocaleSelect } from "./LocaleSelect";
import { speak, VOICE_SOURCE_NOTE } from "./speak";

// E1: "Explain this price" in five languages, read aloud by ElevenLabs (browser voice as fallback).
export function ExplainVoice({ listingId }: { listingId: string }) {
  const { locale: uiLocale } = useI18n();
  const [text, setText] = useState("");
  const [lang, setLang] = useState<Locale>(uiLocale);
  const [shownLang, setShownLang] = useState<Locale>(uiLocale);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function explain() {
    setBusy(true);
    setStatus("Explaining…");
    try {
      const r = await fetch("/api/explain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listingId, lang }) });
      const j = (await r.json()) as { text?: string; source?: string; message?: string };
      if (!r.ok) throw new Error(j.message);
      setText(j.text ?? "");
      setShownLang(lang);
      setStatus(j.source === "ai" ? `Explained by AI in ${LOCALE_INFO[lang].english}, using only the numbers above.` : "AI not connected: showing the raw facts (English) instead.");
    } catch (e) {
      setStatus(e instanceof Error && e.message ? e.message : "Could not load the explanation.");
    } finally {
      setBusy(false);
    }
  }

  async function listen() {
    setStatus("Preparing voice…");
    setStatus(VOICE_SOURCE_NOTE[await speak(text, shownLang, audioRef.current)]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <LocaleSelect id={`explain-lang-${listingId}`} value={lang} onChange={setLang} />
        <button type="button" onClick={explain} disabled={busy} className="rounded-lg bg-ink px-4 py-3 font-semibold text-paper disabled:opacity-60">
          Explain this price
        </button>
        <button type="button" onClick={listen} disabled={!text || busy} className="rounded-lg border border-line px-4 py-3 font-semibold disabled:opacity-60">
          <span aria-hidden="true">🔊</span> Listen
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-soft">{status}</p>
      {text && (
        <p lang={shownLang} dir={LOCALE_INFO[shownLang].dir} className="mt-2 rounded-lg bg-mist p-4">
          <span className="me-2 rounded bg-ink px-1.5 py-0.5 text-xs font-semibold text-paper">AI</span>{text}
          <span className="mt-1 block text-xs text-ink-soft">Estimate, not financial advice.</span>
        </p>
      )}
      <audio ref={audioRef} className="sr-only" />
    </div>
  );
}
