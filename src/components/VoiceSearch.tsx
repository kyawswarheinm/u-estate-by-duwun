"use client";
import { useI18n } from "@/i18n/provider";
import { formatMoneyRef } from "@/i18n";

import Link from "next/link";
import { useRef, useState } from "react";
import { LOCALE_INFO, type Locale } from "@/lib/locale";
import type { ListingSummary, SearchFilters } from "@/lib/search";
import { LocaleSelect } from "./LocaleSelect";
import { speak, VOICE_SOURCE_NOTE } from "./speak";

type Result = { query: string; filters: SearchFilters; parser: "ai" | "keywords"; results: ListingSummary[]; summary: string };

type SpeechRecognitionLike = { lang: string; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onerror: (() => void) | null; onend: (() => void) | null; start: () => void };

// E2: speak (ElevenLabs Scribe) or type a request → filters → listings → spoken answer (E1).
export function VoiceSearch() {
  const { locale: uiLocale, currency, t } = useI18n();
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<Locale>(uiLocale);
  const [state, setState] = useState<"idle" | "recording" | "transcribing" | "searching">("idle");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  async function search(text: string) {
    if (!text.trim()) return;
    setState("searching");
    setStatus(t("Searching…"));
    try {
      const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: text, locale }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      const res = j as Result;
      setResult(res);
      const found = t("{count} result(s). Request read by {parser}; listings filtered by code.", { count: res.results.length, parser: res.parser === "ai" ? "AI" : t("keyword rules") });
      setStatus(found);
      setStatus(`${found} ${t(VOICE_SOURCE_NOTE[await speak(res.summary, locale, audioRef.current)])}`);
    } catch (e) {
      setStatus(e instanceof Error && e.message ? e.message : t("Search failed."));
    } finally {
      setState("idle");
    }
  }

  function browserRecognition() {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      setStatus(t("Voice input needs ElevenLabs or a browser with speech recognition. Please type instead."));
      return;
    }
    const rec = new Ctor();
    rec.lang = LOCALE_INFO[locale].speech;
    rec.onresult = (e) => {
      const text = e.results[0]?.[0]?.transcript ?? "";
      setQuery(text);
      void search(text);
    };
    rec.onerror = () => setStatus(t("Didn't catch that. Please try again or type."));
    rec.onend = () => setState((s) => (s === "recording" ? "idle" : s));
    setState("recording");
    setStatus(t("Listening (browser speech recognition)…"));
    rec.start();
  }

  async function toggleMic() {
    if (state === "recording" && recorder.current) {
      recorder.current.stop();
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus(t("Microphone permission was not given. You can type instead."));
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream);
    recorder.current = rec;
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setState("transcribing");
      setStatus(t("Transcribing with ElevenLabs Scribe…"));
      const form = new FormData();
      form.append("audio", new Blob(chunks, { type: rec.mimeType || "audio/webm" }), "speech.webm");
      form.append("language", LOCALE_INFO[locale].agent);
      try {
        const r = await fetch("/api/voice/stt", { method: "POST", body: form });
        if (r.status === 501) {
          setState("idle");
          browserRecognition();
          return;
        }
        const j = (await r.json()) as { text?: string; message?: string };
        if (!r.ok || !j.text) throw new Error(j.message ?? t("Didn't catch that. Please try again or type."));
        setQuery(j.text);
        await search(j.text);
      } catch (e) {
        setState("idle");
        setStatus(e instanceof Error ? e.message : t("Transcription failed."));
      }
    };
    rec.start();
    setState("recording");
    setStatus(t("Recording… press Stop when you finish speaking."));
    setTimeout(() => rec.state === "recording" && rec.stop(), 15_000);
  }

  return (
    <section aria-labelledby="voice-search-title" className="mb-10 rounded-[16px] border border-line bg-paper p-5 shadow-[var(--shadow)] sm:p-6">
      <h2 id="voice-search-title" className="text-xl font-bold">{t("Ask for a home, in your language")}</h2>
      <p className="text-sm text-ink-soft">{t("Say or type something like “a condo under 4 million in Sathorn” or “หาบ้านไม่เกิน 6 ล้าน”. Voice by ElevenLabs. We don't store recordings.")}</p>
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search(query);
        }}
      >
        <div className="grid min-w-0 basis-64 flex-1 gap-1">
          <label htmlFor="voice-query" className="font-semibold">{t("What are you looking for?")}</label>
          <input id="voice-query" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={300} dir="auto" className="rounded border border-line px-3 py-3" />
        </div>
        <LocaleSelect id="voice-lang" value={locale} onChange={setLocale} label={t("Answer in")} />
        <button type="button" onClick={toggleMic} disabled={state === "transcribing" || state === "searching"} aria-pressed={state === "recording"} className="rounded-lg border border-ink px-4 py-3 font-semibold disabled:opacity-60">
          <span aria-hidden="true">🎙</span> {state === "recording" ? t("Stop") : t("Speak")}
        </button>
        <button type="submit" disabled={state !== "idle"} className="rounded-lg bg-ink px-4 py-3 font-semibold text-paper disabled:opacity-60">{t("Search")}</button>
      </form>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-ink-soft">{status}</p>
      {result && (
        <div className="mt-3">
          <p lang={locale} dir={LOCALE_INFO[locale].dir} className="rounded-lg bg-mist p-3">{result.summary}</p>
          {result.results.length > 0 && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {result.results.map((l) => (
                <li key={l.listingId} className="rounded-lg border border-line p-3">
                  <Link href={l.url} className="font-semibold hover:underline">{l.title}</Link>
                  <p className="text-sm text-ink-soft">{l.type} · {l.district} · {l.areaSqm} m² · {formatMoneyRef(l.askingPriceThb, uiLocale, currency)}{l.cobuyEnabled ? ` · ${t("Co-buy available")}` : ""}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <audio ref={audioRef} className="sr-only" />
    </section>
  );
}
