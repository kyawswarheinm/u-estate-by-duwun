import { ELEVENLABS } from "@/lib/partners";
import { rateLimit } from "@/lib/ratelimit";

// E3: short-lived WebRTC conversation token for the ElevenLabs voice agent.
// The API key stays on the server; the browser only gets a one-conversation token.
export async function GET(req: Request) {
  const key = ELEVENLABS.apiKey();
  const agentId = ELEVENLABS.agentId();
  if (!key || !agentId) {
    return Response.json({ code: "AGENT_NOT_CONFIGURED", message: "Voice is not available right now. You can keep typing." }, { status: 501 });
  }
  const limited = rateLimit(req, "agent-token", 6);
  if (limited) return limited;

  const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return Response.json({ code: "UPSTREAM", message: `ElevenLabs error ${r.status}` }, { status: 502 });
  const j = (await r.json()) as { token: string };
  return Response.json({ token: j.token }, { headers: { "Cache-Control": "no-store" } });
}
