import { ELEVENLABS } from "@/lib/partners";
import { rateLimit } from "@/lib/ratelimit";

// E2: ElevenLabs Scribe speech-to-text (model scribe_v2). The recording is forwarded once and never stored.
// Without a key → 501, and the client falls back to the browser's speech recognition or typing.
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const key = ELEVENLABS.apiKey();
  if (!key) return Response.json({ code: "VOICE_NOT_CONFIGURED", message: "ElevenLabs is not connected." }, { status: 501 });
  const limited = rateLimit(req, "stt", 12);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ code: "VALIDATION", message: "No audio received." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ code: "FILE_SIZE", message: "Recording is too long." }, { status: 400 });
  if (!/^(audio|video)\//.test(audio.type || "audio/webm")) return Response.json({ code: "FILE_TYPE", message: "Not an audio file." }, { status: 400 });

  const body = new FormData();
  body.append("file", audio, "speech.webm");
  body.append("model_id", ELEVENLABS.sttModel());
  const lang = form?.get("language");
  if (typeof lang === "string" && /^[a-z]{2,3}$/.test(lang)) body.append("language_code", lang);

  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return Response.json({ code: "UPSTREAM", message: `ElevenLabs error ${r.status}` }, { status: 502 });
  const j = (await r.json()) as { text?: string; language_code?: string; language_probability?: number };
  return Response.json({ text: (j.text ?? "").trim(), lang: j.language_code ?? null, confidence: j.language_probability ?? null });
}
