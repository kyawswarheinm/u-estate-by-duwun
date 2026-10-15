import "server-only";

// Simple in-memory sliding-window limiter for paid partner endpoints (AI, voice, Tokenomist, Avalanche).
// Per server instance only: good enough for a demo. Production: Postgres counter or Vercel KV (TRD §8).
const hits = new Map<string, number[]>();

export function clientKey(req: Request, route: string) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return `${route}:${ip}`;
}

/** Returns null when allowed, or a 429 Response when the caller is over the limit. */
export function rateLimit(req: Request, route: string, limit: number, windowMs = 60_000): Response | null {
  const key = clientKey(req, route);
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return Response.json(
      { code: "RATE_LIMITED", message: "Too many requests. Please wait a minute and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } },
    );
  }
  recent.push(now);
  hits.set(key, recent);
  return null;
}
