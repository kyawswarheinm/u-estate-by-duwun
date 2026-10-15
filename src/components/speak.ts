"use client";

import { LOCALE_INFO, type Locale } from "@/lib/locale";

/** E1: speak text with the ElevenLabs voice (server route), or the browser voice if ElevenLabs isn't connected. */
export async function speak(text: string, locale: Locale, audio: HTMLAudioElement | null): Promise<"elevenlabs" | "browser" | "none"> {
  if (!text) return "none";
  try {
    const r = await fetch("/api/voice/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    if (r.ok && audio) {
      if (audio.src) URL.revokeObjectURL(audio.src);
      audio.src = URL.createObjectURL(await r.blob());
      await audio.play();
      return "elevenlabs";
    }
  } catch {
    /* fall back below */
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LOCALE_INFO[locale].speech;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    return "browser";
  }
  return "none";
}

export const VOICE_SOURCE_NOTE = {
  elevenlabs: "Playing: ElevenLabs voice.",
  browser: "Playing: built-in browser voice (ElevenLabs not connected).",
  none: "Voice is not available in this browser.",
} as const;
