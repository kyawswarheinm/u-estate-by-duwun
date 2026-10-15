// E2 voice search: spoken or typed request → filters → listings. Code filters; AI (optional) only reads the sentence.
import { z } from "zod";
import type { DB, PropertyType } from "./types";
import type { Locale } from "./locale";

export const SearchFiltersSchema = z.object({
  type: z.enum(["condo", "house", "land", "townhouse", "building"]).nullable(),
  kind: z.enum(["sale", "rent"]).nullable(),
  maxPriceThb: z.number().positive().nullable().describe("Budget ceiling in Thai baht; convert 'five million' to 5000000"),
  minSizeSqm: z.number().positive().nullable(),
  district: z.string().nullable().describe("District or area name exactly as the user said it, in English if known"),
  cobuy: z.boolean().nullable().describe("True if the user wants to buy together with others"),
});
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;

const TYPE_WORDS: [PropertyType, RegExp][] = [
  ["condo", /condo|apartment|คอนโด|ห้องชุด|شقة|شقق|公寓|大廈|condominio|apartamento|piso/i],
  ["townhouse", /townhouse|town house|ทาวน์เฮาส์|ทาวน์โฮม|تاون هاوس|聯排|casa adosada/i],
  ["house", /house|home|villa|บ้าน|منزل|بيت|فيلا|房子|住宅|透天|casa|chalet/i],
  ["land", /\bland\b|plot|ที่ดิน|أرض|土地|terreno|solar/i],
];
const RENT_WORDS = /\brent|rental|lease|เช่า|إيجار|استئجار|租|alquil/i;
const COBUY_WORDS = /co-?buy|together|share|ซื้อร่วม|ร่วมกัน|مشترك|一起買|合買|共同|compartid|juntos/i;

const MILLION = /(\d+(?:[.,]\d+)?)\s*(?:m\b|mil+ion|ล้าน|مليون|millones|millón|百萬|百万)/i;
const TEN_THOUSAND = /(\d+(?:[.,]\d+)?)\s*(?:萬|万)/;
const PLAIN_BIG = /(\d{1,3}(?:[,\s]\d{3}){1,3}|\d{6,})/;
const SIZE = /(\d+(?:[.,]\d+)?)\s*(?:m2|m²|sqm|sq\.?\s*m|square met|ตร\.?\s*ม|ตารางเมตร|متر|平方米|平方公尺|metros)/i;

const num = (s: string) => Number(s.replace(/[,\s]/g, ""));

/** Keyword parser used when the AI is not connected. Works for the five UI languages' common words. */
export function parseQueryFallback(text: string, knownDistricts: string[] = []): SearchFilters {
  const t = text.normalize("NFKC");
  const type = TYPE_WORDS.find(([, re]) => re.test(t))?.[0] ?? null;
  let maxPriceThb: number | null = null;
  const sizeMatch = SIZE.exec(t);
  const withoutSize = sizeMatch ? t.replace(sizeMatch[0], " ") : t;
  const m = MILLION.exec(withoutSize);
  const w = TEN_THOUSAND.exec(withoutSize);
  const p = PLAIN_BIG.exec(withoutSize);
  if (m) maxPriceThb = Math.round(num(m[1].replace(",", ".")) * 1_000_000);
  else if (w) maxPriceThb = Math.round(num(w[1]) * 10_000);
  else if (p) maxPriceThb = num(p[1]);
  const district = knownDistricts.find((d) => t.toLowerCase().includes(d.toLowerCase())) ?? null;
  return {
    type,
    kind: RENT_WORDS.test(t) ? "rent" : null,
    maxPriceThb,
    minSizeSqm: sizeMatch ? num(sizeMatch[1]) : null,
    district,
    cobuy: COBUY_WORDS.test(t) ? true : null,
  };
}

export interface ListingSummary {
  listingId: string;
  title: string;
  type: PropertyType;
  kind: "sale" | "rent";
  district: string;
  province: string;
  areaSqm: number;
  askingPriceThb: number;
  verification: string;
  cobuyEnabled: boolean;
  url: string;
}

export function searchListings(db: DB, f: SearchFilters, limit = 5): ListingSummary[] {
  return db.listings
    .filter((l) => l.status === "active")
    .map((l) => ({ l, p: db.properties.find((x) => x.id === l.propertyId)! }))
    .filter(({ l, p }) =>
      (!f.type || p.type === f.type) &&
      (!f.kind || l.kind === f.kind) &&
      (!f.maxPriceThb || l.askingPriceThb <= f.maxPriceThb) &&
      (!f.minSizeSqm || p.areaSqm >= f.minSizeSqm) &&
      (!f.district || `${p.district} ${p.province}`.toLowerCase().includes(f.district.toLowerCase())) &&
      (!f.cobuy || l.cobuyEnabled),
    )
    .sort((a, b) => a.l.askingPriceThb - b.l.askingPriceThb)
    .slice(0, Math.min(limit, 5))
    .map(({ l, p }) => ({
      listingId: l.id, title: p.title, type: p.type, kind: l.kind, district: p.district, province: p.province,
      areaSqm: p.areaSqm, askingPriceThb: l.askingPriceThb, verification: l.verificationStatus, cobuyEnabled: l.cobuyEnabled,
      url: `/listing/${l.id}`,
    }));
}

const fmt = (n: number) => `${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Short spoken answer written by code (no AI), so numbers are always right. */
export function spokenSummary(results: ListingSummary[], locale: Locale) {
  if (results.length === 0) {
    return {
      en: "No listings match. Try a higher budget or another area.",
      th: "ยังไม่มีรายการที่ตรงกัน ลองเพิ่มงบหรือเปลี่ยนทำเลดูนะคะ",
      ar: "لا توجد عقارات مطابقة. جرّب ميزانية أعلى أو منطقة أخرى.",
      "zh-Hant": "沒有符合的物件。請試試提高預算或換個區域。",
      es: "No hay anuncios que coincidan. Prueba con más presupuesto u otra zona.",
    }[locale];
  }
  const first = results[0];
  const lines = {
    en: `I found ${results.length} listing${results.length > 1 ? "s" : ""}. The first is ${first.title} in ${first.district}, ${first.areaSqm} square metres, asking ${fmt(first.askingPriceThb)} million baht.`,
    th: `พบ ${results.length} รายการ รายการแรกคือ ${first.title} ย่าน${first.district} ขนาด ${first.areaSqm} ตารางเมตร ราคาเสนอขาย ${fmt(first.askingPriceThb)} ล้านบาท`,
    ar: `وجدت ${results.length} عقارات. الأول هو ${first.title} في ${first.district}، بمساحة ${first.areaSqm} متر مربع، والسعر المطلوب ${fmt(first.askingPriceThb)} مليون بات.`,
    "zh-Hant": `找到 ${results.length} 個物件。第一個是位於 ${first.district} 的 ${first.title}，${first.areaSqm} 平方公尺，開價 ${fmt(first.askingPriceThb)} 百萬泰銖。`,
    es: `Encontré ${results.length} anuncio${results.length > 1 ? "s" : ""}. El primero es ${first.title} en ${first.district}, ${first.areaSqm} metros cuadrados, por ${fmt(first.askingPriceThb)} millones de baht.`,
  };
  return lines[locale];
}
