import { createHash } from "node:crypto";
import { ELEVENLABS } from "@/lib/partners";
import { rateLimit } from "@/lib/ratelimit";

// E1: ElevenLabs text-to-speech. Eleven v3 speaks all five UI languages, including Thai
// (Multilingual v2 and Flash v2.5 do not). Without a key the client uses the browser voice (501).
// Audio is cached in memory so a repeated demo is instant and doesn't spend credits twice.
const cache = new Map<string, ArrayBuffer>();
const MAX_CACHE = 60;

export async function POST(req: Request) {
  const key = ELEVENLABS.apiKey();
  if (!key) return Response.json({ code: "VOICE_NOT_CONFIGURED", message: "ElevenLabs is not connected." }, { status: 501 });
  const limited = rateLimit(req, "tts", 20);
  if (limited) return limited;

  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text || text.length > 2000) return Response.json({ code: "VALIDATION", message: "Text missing or too long." }, { status: 400 });

  const voiceId = ELEVENLABS.voiceId();
  const model = ELEVENLABS.ttsModel();
  const cacheKey = createHash("sha256").update(`${voiceId}|${model}|${text}`).digest("hex");
  const hit = cache.get(cacheKey);
  if (hit) return new Response(hit.slice(0), { headers: { "Content-Type": "audio/mpeg", "X-Cache": "hit" } });

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: model }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) return Response.json({ code: "UPSTREAM", message: `ElevenLabs error ${r.status}` }, { status: 502 });
  const audio = await r.arrayBuffer();
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(cacheKey, audio);
  return new Response(audio.slice(0), { headers: { "Content-Type": "audio/mpeg", "X-Cache": "miss" } });
}
