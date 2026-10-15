import { aiConfigured, parseSearchQuery } from "@/lib/ai";
import { asLocale } from "@/lib/locale";
import { rateLimit } from "@/lib/ratelimit";
import { parseQueryFallback, searchListings, spokenSummary } from "@/lib/search";
import { readDb } from "@/lib/store";

// E2: voice/typed search. AI (if connected) only reads the sentence into filters; code filters and writes the answer.
export async function POST(req: Request) {
  const limited = rateLimit(req, "search", 20);
  if (limited) return limited;
  const body = (await req.json().catch(() => ({}))) as { query?: string; locale?: string };
  const query = String(body.query ?? "").trim().slice(0, 300);
  if (!query) return Response.json({ code: "VALIDATION", message: "Say or type what you are looking for." }, { status: 400 });
  const locale = asLocale(body.locale);

  const db = await readDb();
  const districts = [...new Set(db.properties.map((p) => p.district))];
  let filters = null;
  let parser: "ai" | "keywords" = "keywords";
  if (aiConfigured()) {
    try {
      filters = await parseSearchQuery(query, districts);
      if (filters) parser = "ai";
    } catch {
      // fall back to the keyword parser so search never breaks
    }
  }
  filters ??= parseQueryFallback(query, districts);
  const results = searchListings(db, filters);
  return Response.json({ query, filters, parser, results, summary: spokenSummary(results, locale) });
}
