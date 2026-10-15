"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors } from "@/lib/auth-rules";
import { requireUser } from "@/lib/session";
import { newId, readDb, updateDb } from "@/lib/store";
import type { AuthState } from "@/app/auth/actions";
import { DEED_TYPES } from "@/lib/listing-options";


const clean = (v: string) => v.replace(/[,฿\s]/g, "");
const num = (min: number, max: number, msg: string) =>
  z.string().transform((v) => Number(clean(v))).pipe(z.number({ message: msg }).min(min, { message: msg }).max(max, { message: msg }));
const optionalNum = (min: number, max: number, msg: string) =>
  z
    .string()
    .optional() // fields that are hidden for this property type are not sent at all
    .transform((v = ""): "" | number => (clean(v) === "" ? "" : Number(clean(v))))
    .pipe(z.union([z.literal(""), z.number({ message: msg }).min(min, { message: msg }).max(max, { message: msg })]));

const ListingSchema = z
  .object({
    kind: z.enum(["sale", "rent"]),
    type: z.enum(["condo", "house", "townhouse", "land"], { message: "Choose a property type." }),
    title: z.string().trim().min(5, { message: "Write a short title, e.g. “2-bed condo near MRT, Huai Khwang”." }).max(80),
    district: z.string().trim().min(2, { message: "Enter the district." }).max(40),
    province: z.string().trim().min(2, { message: "Enter the province." }).max(40),
    areaSqm: num(10, 100_000, "Enter the size in m² (10 or more)."),
    askingPriceThb: num(1_000, 2_000_000_000, "Enter the price in baht."),
    buildYear: optionalNum(1950, new Date().getFullYear() + 3, "Enter a year between 1950 and next year, or leave it empty."),
    deedType: z.enum(DEED_TYPES),
    appraisalThb: optionalNum(10_000, 2_000_000_000, "Enter the official appraisal in baht, or leave it empty."),
    cobuyEnabled: z.string().optional(),
    buildingName: z.string().trim().max(80).optional(),
    buildingTotalSqm: optionalNum(100, 5_000_000, "Enter the building's total floor area in m², or leave it empty."),
    buildingForeignSqm: optionalNum(0, 5_000_000, "Enter the foreign-owned floor area in m² (0 if unknown)."),
  })
  .refine((v) => !(v.type === "condo" && v.cobuyEnabled === "on" && v.buildingTotalSqm === ""), {
    message: "Co-buy on a condo needs the building's total floor area (for the 49% foreign quota).",
    path: ["buildingTotalSqm"],
  });

/** An account owner lists their own property for sale or rent. */
export async function createListing(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const me = await requireUser("/sell");
  const raw = Object.fromEntries([...formData.entries()].map(([k, v]) => [k, String(v)]));
  const parsed = ListingSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error.issues), values: raw };
  const v = parsed.data;
  if (v.kind === "rent" && v.askingPriceThb > 2_000_000) {
    return { ok: false, message: "For rent, enter the monthly rent.", fieldErrors: { askingPriceThb: "Monthly rent looks too high." }, values: raw };
  }

  const now = new Date().toISOString();
  const listingId = newId("l");
  await updateDb((db) => {
    let buildingId: string | undefined;
    if (v.type === "condo" && v.buildingTotalSqm !== "") {
      buildingId = newId("b");
      db.buildings.push({
        id: buildingId,
        name: v.buildingName || `${v.title} (building)`,
        totalFloorAreaSqm: v.buildingTotalSqm,
        foreignAreaUsedSqm: v.buildingForeignSqm === "" ? 0 : v.buildingForeignSqm,
      });
    }
    const propertyId = newId("p");
    db.properties.push({
      id: propertyId,
      type: v.type,
      title: v.title,
      province: v.province,
      district: v.district,
      areaSqm: v.areaSqm,
      buildingId,
      buildYear: v.buildYear === "" ? undefined : v.buildYear,
      deedType: v.deedType,
      officialAppraisalThb: v.appraisalThb === "" ? 0 : v.appraisalThb,
      appraisalSource: v.appraisalThb === "" ? "Not provided yet" : "Entered by the seller (not yet checked)",
      appraisalDate: now.slice(0, 7),
      indexSeries: v.type === "condo" ? "condo_bkk" : "house_bkk",
    });
    db.listings.push({
      id: listingId,
      propertyId,
      sellerId: me.id,
      kind: v.kind,
      askingPriceThb: v.askingPriceThb,
      status: "active",
      verificationStatus: "unverified",
      verificationReasons: [],
      cobuyEnabled: v.cobuyEnabled === "on" && v.kind === "sale",
      createdAt: now,
    });
  });
  revalidatePath("/", "layout");
  redirect(`/listing/${listingId}?created=1`);
}

/** The owner opens a FairOffer room with weights published before any offer arrives (R10). */
export async function openOfferRound(formData: FormData) {
  const listingId = String(formData.get("listingId") ?? "");
  const me = await requireUser(`/listing/${listingId}`);
  const db = await readDb();
  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing || listing.sellerId !== me.id || listing.kind !== "sale") redirect(`/listing/${listingId}`);
  if (!db.offerRounds.some((r) => r.listingId === listingId)) {
    await updateDb((d) => {
      d.offerRounds.push({
        id: newId("r"),
        listingId,
        criteria: [
          { key: "price", label: "Offered price", weight: 50 },
          { key: "funding", label: "Funding readiness", weight: 25 },
          { key: "closing", label: "Faster closing", weight: 15 },
          { key: "conditions", label: "Fewer conditions", weight: 10 },
        ],
        rulesPublishedAt: new Date().toISOString(),
        closesAt: new Date(Date.now() + 72 * 3600_000).toISOString(),
        status: "open",
      });
    });
  }
  redirect(`/listing/${listingId}/offers`);
}
