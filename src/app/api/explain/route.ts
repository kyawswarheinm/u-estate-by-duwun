import { aiConfigured, explainNumbers } from "@/lib/ai";
import { pricePanel } from "@/lib/price";
import { readDb } from "@/lib/store";
import { thb } from "@/lib/rules";
import { asLocale } from "@/lib/locale";
import { rateLimit } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const limited = rateLimit(req, "explain", 20);
  if (limited) return limited;
  const body = (await req.json()) as { listingId: string; lang?: string };
  const listingId = body.listingId;
  const lang = asLocale(body.lang);
  const db = await readDb();
  const listing = db.listings.find((l) => (l.id === listingId || l.code === listingId));
  if (!listing) return Response.json({ error: "Listing not found" }, { status: 404 });
  const property = db.properties.find((p) => p.id === listing.propertyId)!;
  const p = pricePanel(listing, property, []);

  const facts = [
    `Property: ${property.title}, ${property.areaSqm} m², ${property.district}, ${property.province}.`,
    `Asking price: ${thb(p.askingThb)}.`,
    p.appraisal.thb > 0 ? `Official appraisal: ${thb(p.appraisal.thb)} (${p.appraisal.source}, ${p.appraisal.date}).` : "Official appraisal: not provided yet.",
    p.estimate.thb !== null
      ? `Index-adjusted estimate: ${thb(p.estimate.thb)} (range ${thb(p.estimate.lowThb)}–${thb(p.estimate.highThb)}); ${p.estimate.basis}. Index source: ${p.index.source}${p.index.isSample ? " — SAMPLE data, not real" : ""}, latest ${p.index.latestMonth}.`
      : `Index-adjusted estimate: not available (${p.estimate.reason}).`,
    p.askingVsEstimatePct !== null ? `Asking price vs estimate: ${p.askingVsEstimatePct}%.` : "",
    `Risk checklist: ${p.risks.map((r) => `${r.label}: ${r.detail}`).join(" ")}`,
  ].join("\n");

  if (aiConfigured()) {
    try {
      const text = await explainNumbers(facts, lang);
      if (text) return Response.json({ text, source: "ai" });
    } catch {
      // fall through to the template so the demo never breaks
    }
  }
  return Response.json({ text: facts.replace(/\n/g, " "), source: "template" });
}
