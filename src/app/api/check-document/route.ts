import { imageExtension } from "@/lib/upload";
import { aiConfigured, checkDeed, type DeedResult } from "@/lib/ai";
import { newId, nextLedgerId, readDb, updateDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import type { DeedFlag, VerificationStatus } from "@/lib/types";
import { usesSupabase } from "@/lib/db/runtime";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/ratelimit";
import { randomUUID } from "node:crypto";

const TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_BYTES = 5 * 1024 * 1024;
const WEAK = new Set(["nor_sor_3"]);
const NOT_ACCEPTABLE = new Set(["sor_por_kor_4_01", "sor_kor_1", "por_bor_tor_5", "unknown"]);

function normalise(s: string) {
  return s.toLowerCase().replace(/^(khun|mr\.?|mrs\.?|ms\.?|นาย|นาง|นางสาว|คุณ)\s*/u, "").replace(/\s+/g, " ").trim();
}

export async function POST(req: Request) {
  const limited = rateLimit(req, "check-document", 6);
  if (limited) return limited;
  const me = await currentUser();
  if (!me) return Response.json({ error: "Sign in to check a deed." }, { status: 401 });
  if (!aiConfigured()) {
    return Response.json({ error: "The document check is not available right now. Try again later." }, { status: 503 });
  }
  const form = await req.formData();
  const file = form.get("deed");
  const listingId = String(form.get("listingId") ?? "");
  if (!(file instanceof File)) return Response.json({ error: "Attach a deed image." }, { status: 400 });
  if (!TYPES.includes(file.type as (typeof TYPES)[number])) return Response.json({ error: "Use a JPG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });

  const db = await readDb();
  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing || listing.sellerId !== me.id) return Response.json({ error: "You can only check deeds for your own listings." }, { status: 403 });
  const seller = me;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!imageExtension(bytes, file.type)) return Response.json({ error: "Invalid image content." }, { status: 400 });

  let result: DeedResult | null;
  try {
    result = await checkDeed(Buffer.from(bytes).toString("base64"), file.type as (typeof TYPES)[number]);
  } catch (e) {
    return Response.json({ error: `AI check failed: ${(e as Error).message}` }, { status: 502 });
  }
  if (!result) return Response.json({ error: "The AI could not read this document. It needs human review." }, { status: 422 });

  // Deterministic checks on top of the AI extraction.
  const flags: DeedFlag[] = [...result.flags];
  if (NOT_ACCEPTABLE.has(result.deed_type)) flags.push({ severity: "critical", message: "This document type cannot be accepted as title for a sale or as loan security." });
  if (WEAK.has(result.deed_type)) flags.push({ severity: "warning", message: "Weaker title (unsurveyed). Extra checks needed." });
  if (result.encumbrance_entry_visible) flags.push({ severity: "warning", message: "A registration entry (e.g. mortgage or khai fak) is visible. It must be cleared or disclosed." });
  if (seller && result.owner_name && !normalise(result.owner_name).includes(normalise(seller.name).split(" ")[0]))
    flags.push({ severity: "critical", message: `Owner name on the deed ("${result.owner_name}") does not match the seller (${seller.name}).` });
  if (result.confidence === "low") flags.push({ severity: "warning", message: "Low reading confidence. A person must review the original." });
  flags.push({ severity: "info", message: "No mortgage entry visible on the uploaded page does not prove there is none. Confirm at the Land Office before any money moves." });

  const outcome: VerificationStatus = flags.some((f) => f.severity === "critical" || f.severity === "warning") ? "needs_review" : "verified_sample";

  if (usesSupabase()) {
    const client = await supabaseServer();
    // Re-check ownership using the authenticated session before privileged write-back.
    const owned = await client.from("listings").select("id").eq("id", listing.id).eq("seller_id", me.id).single();
    if (owned.error) return Response.json({ error: "Listing ownership changed. Please refresh." }, { status: 403 });
    const storagePath = `${me.id}/${listing.id}/${randomUUID()}.${file.type.split("/")[1]}`;
    const upload = await client.storage.from("deeds").upload(storagePath, file, { contentType: file.type });
    if (upload.error) return Response.json({ error: "Private deed upload failed. Please try again." }, { status: 502 });
    const admin = supabaseAdmin();
    const saved = await admin.rpc("save_document_check", { p_owner: me.id, p_listing: listing.id, p_path: storagePath, p_extraction: result, p_flags: flags, p_outcome: outcome });
    if (saved.error) {
      await admin.storage.from("deeds").remove([storagePath]);
      return Response.json({ error: "Could not save the deed check. No verification status was changed; please retry." }, { status: 502 });
    }
  } else await updateDb((d) => {
    d.documentChecks.push({
      id: newId("dc"), listingId: listing?.id, fileName: file.name, createdAt: new Date().toISOString(),
      extraction: result as unknown as Record<string, unknown>, flags, outcome, humanReview: "pending",
    });
    const l = d.listings.find((x) => x.id === listingId);
    if (l) {
      l.verificationStatus = outcome;
      l.verificationReasons = flags.filter((f) => f.severity !== "info").map((f) => f.message);
    }
    d.ledger.push({
      id: nextLedgerId(d), createdAt: new Date().toISOString(), userId: seller?.id ?? "unknown", entryType: "document_checked",
      listingId: listing?.id, details: `Deed checked by AI: ${result.deed_type_label} → ${outcome === "verified_sample" ? "verified (sample)" : "needs human review"}`, isSimulated: true,
    });
  });

  return Response.json({ result, flags, outcome });
}
