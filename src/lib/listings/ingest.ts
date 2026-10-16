// Import and refresh for real listings (scripts/import-listings.ts). Pure apart from the injected link checker,
// so it is unit-tested. Rules: validate every row, keep unknown facts null, never invent coordinates, merge duplicates,
// check source links, flag stale rows, and log every problem instead of guessing.
import { createHash } from "node:crypto";
import { z } from "zod";
import { AMENITIES, FURNISHING, isStale, PropertyType, RealListing, type RealListing as Row } from "./schema";

const text = (max: number) => z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v ?? null), z.string().max(max).nullable());
const number = z.preprocess((v) => (v === "" || v == null ? null : typeof v === "string" ? Number(v.replace(/[,\s฿]/g, "")) : v), z.number().finite().nullable());
const date = z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v ?? null), z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable());

/** What a person fills in (JSON array or CSV via the script). Lenient on format, strict on meaning. */
export const CandidateRow = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : v), PropertyType),
  kind: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.enum(["sale", "rent"])),
  price_thb: number.pipe(z.number().positive()),
  province: z.string().trim().min(1).max(60),
  district: z.string().trim().min(1).max(60),
  neighborhood: text(80).optional(),
  address_or_project: text(200).optional(),
  lat: number.optional(),
  lng: number.optional(),
  geo_precision: z.enum(["exact", "project", "district", "none"]).optional(),
  bedrooms: number.optional(),
  bathrooms: number.optional(),
  area_sqm: number.optional(),
  furnishing: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") || null : v ?? null), z.enum(FURNISHING).nullable()).optional(),
  amenities: z.preprocess((v) => (typeof v === "string" ? v.split(/[;,|]/).map((x) => x.trim().toLowerCase().replace(/[\s-]+/g, "_")).filter(Boolean) : v ?? []), z.array(z.enum(AMENITIES))).optional(),
  photos: z.array(z.object({ url: z.url(), credit: z.string().min(1), license: z.string().min(1) })).optional(),
  source_name: z.string().trim().min(1).max(80),
  source_kind: z.enum(["owner", "agency", "licensed_feed"]),
  source_url: z.preprocess((v) => (typeof v === "string" ? v.trim() || null : v ?? null), z.url().nullable()).optional(),
  permission: z.string().trim().min(1, "permission: who allowed U-Estate to publish this listing").max(200),
  retrieved_at: date.optional(),
  last_verified_at: date.optional(),
  availability: z.enum(["available", "unconfirmed", "unavailable"]).optional(),
});
export type CandidateRow = z.input<typeof CandidateRow>;

export type LogEntry = { level: "error" | "warning" | "info"; row: number | string; message: string };
/** "unchecked" = the site would not say (401/403/429, timeouts): not proof the page is gone. */
export type LinkCheck = (url: string) => Promise<"ok" | "broken" | "unchecked">;

/** Canonical form of a source URL for duplicate detection: no query, hash or trailing slash; lower-case host. */
export function canonicalUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim();
  }
}

export function listingId(r: { source_url?: string | null; name: string; district: string; kind: string; area_sqm?: number | null }) {
  const key = r.source_url ? canonicalUrl(r.source_url) : [r.name, r.district, r.kind, r.area_sqm ?? ""].join("|").toLowerCase();
  return `rl-${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** One candidate → a listing row, or the reasons it was rejected. */
export function normalizeRow(raw: unknown, rowNo: number, today: string): { row: Row | null; log: LogEntry[] } {
  const log: LogEntry[] = [];
  // An empty CSV cell means "not provided", the same as a missing key.
  const cleaned = raw && typeof raw === "object" && !Array.isArray(raw)
    ? Object.fromEntries(Object.entries(raw).filter(([, v]) => !(typeof v === "string" && v.trim() === "")))
    : raw;
  const parsed = CandidateRow.safeParse(cleaned);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) log.push({ level: "error", row: rowNo, message: `${issue.path.join(".") || "row"}: ${issue.message}` });
    return { row: null, log };
  }
  const c = parsed.data;

  // Coordinates: both or neither, inside Thailand, with a stated precision. Otherwise none, never a guess.
  let lat = c.lat ?? null;
  let lng = c.lng ?? null;
  let precision = c.geo_precision ?? (lat != null && lng != null ? "exact" : "none");
  if ((lat == null) !== (lng == null)) {
    log.push({ level: "warning", row: rowNo, message: "only one coordinate given; coordinates dropped" });
    lat = lng = null;
  }
  if (lat != null && lng != null && (lat < 5 || lat > 21 || lng < 97 || lng > 106)) {
    log.push({ level: "warning", row: rowNo, message: `coordinates ${lat},${lng} are outside Thailand (swapped?); coordinates dropped` });
    lat = lng = null;
  }
  if (lat == null) precision = precision === "district" ? "district" : "none";
  for (const [field, v] of [["bedrooms", c.bedrooms], ["bathrooms", c.bathrooms]] as const) {
    if (v != null && (!Number.isInteger(v) || v < 0 || v > 50)) log.push({ level: "warning", row: rowNo, message: `${field} ${v} is not a plausible count; left empty` });
  }
  const count = (v: number | null | undefined) => (v != null && Number.isInteger(v) && v >= 0 && v <= 50 ? v : null);
  const area = c.area_sqm != null && c.area_sqm > 0 ? c.area_sqm : null;
  if (c.area_sqm != null && area === null) log.push({ level: "warning", row: rowNo, message: "area_sqm must be positive; left empty" });
  if (c.kind === "rent" && c.price_thb > 2_000_000) log.push({ level: "warning", row: rowNo, message: `monthly rent ${c.price_thb} looks like a sale price; check kind` });

  const row = {
    id: listingId({ source_url: c.source_url, name: c.name, district: c.district, kind: c.kind, area_sqm: area }),
    name: c.name,
    type: c.type,
    kind: c.kind,
    price_thb: Math.round(c.price_thb),
    currency: "THB" as const,
    province: c.province,
    district: c.district,
    neighborhood: c.neighborhood ?? null,
    address_or_project: c.address_or_project ?? null,
    lat: lat == null ? null : round(lat, 5),
    lng: lng == null ? null : round(lng, 5),
    geo_precision: precision,
    bedrooms: count(c.bedrooms),
    bathrooms: count(c.bathrooms),
    area_sqm: area,
    furnishing: c.furnishing ?? null,
    amenities: [...new Set(c.amenities ?? [])],
    photos: c.photos ?? [],
    source: { name: c.source_name, kind: c.source_kind, url: c.source_url ?? null, permission: c.permission },
    retrieved_at: c.retrieved_at ?? today,
    last_verified_at: c.last_verified_at ?? null,
    availability: c.availability ?? "unconfirmed",
    verification: "third_party" as const, // only a U-Estate check may change this, never an import
    link_status: "unchecked" as const,
  };
  const valid = RealListing.safeParse(row);
  if (!valid.success) {
    for (const issue of valid.error.issues) log.push({ level: "error", row: rowNo, message: `${issue.path.join(".")}: ${issue.message}` });
    return { row: null, log };
  }
  return { row: valid.data, log };
}

/**
 * Merges imported rows into the existing file: same id (same source URL, or same name/district/kind/size) updates the
 * row and keeps its first retrieval date and any U-Estate verification. Then checks links and flags stale rows.
 */
export async function ingest(existing: Row[], candidates: unknown[], opts: { today: string; checkLink?: LinkCheck; now?: Date }) {
  const log: LogEntry[] = [];
  const byId = new Map(existing.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  const seenInImport = new Set<string>();
  candidates.forEach((raw, i) => {
    const { row, log: rowLog } = normalizeRow(raw, i + 1, opts.today);
    log.push(...rowLog);
    if (!row) return;
    if (seenInImport.has(row.id)) {
      log.push({ level: "warning", row: i + 1, message: `duplicate of an earlier row in this import (${row.id}); skipped` });
      return;
    }
    seenInImport.add(row.id);
    const prev = byId.get(row.id);
    if (prev) {
      byId.set(row.id, { ...row, retrieved_at: prev.retrieved_at, verification: prev.verification, last_verified_at: row.last_verified_at ?? prev.last_verified_at });
      updated++;
    } else {
      byId.set(row.id, row);
      added++;
    }
  });
  const listings = await refresh([...byId.values()], { ...opts, log });
  return { listings, added, updated, log };
}

/** Rechecks source links and reports stale rows. A broken link makes availability unconfirmed. */
export async function refresh(rows: Row[], opts: { checkLink?: LinkCheck; now?: Date; log?: LogEntry[] }) {
  const log = opts.log ?? [];
  const out: Row[] = [];
  for (const r of rows) {
    let next = r;
    if (opts.checkLink && r.source.url) {
      const status = await opts.checkLink(r.source.url).catch(() => "unchecked" as const);
      next = { ...next, link_status: status };
      if (status === "unchecked") log.push({ level: "info", row: r.id, message: `source link could not be checked: ${r.source.url}` });
      if (status === "broken") {
        next = { ...next, availability: next.availability === "unavailable" ? "unavailable" : "unconfirmed" };
        log.push({ level: "warning", row: r.id, message: `source link broken: ${r.source.url}` });
      }
    }
    if (isStale(next, opts.now)) log.push({ level: "info", row: r.id, message: next.last_verified_at ? `stale: last verified ${next.last_verified_at}; needs review` : "never verified; needs review" });
    out.push(next);
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
