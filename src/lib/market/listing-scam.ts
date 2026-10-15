// Runs the scam rules (R11) for one listing on the current data store. Pure: pass in the DB snapshot.
// Photos and chat arrive with the Supabase wiring (T37, T06); until then those rules have no input and stay quiet.
import type { DB } from "../types";
import { valueProperty } from "../valuation";
import { assessListing, type ListingScamResult } from "./scam";

// The deed check (api/check-document) writes this critical flag text when the deed owner differs from the seller.
const DEED_MISMATCH = /does not match the seller/i;

export function scamCheckForListing(db: DB, listingId: string, now = new Date()): ListingScamResult | null {
  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing) return null;
  const property = db.properties.find((p) => p.id === listing.propertyId);
  if (!property) return null;

  const valuation = listing.kind === "sale" ? valueProperty(property, listing.askingPriceThb) : null;
  const likelyThb = valuation?.estimate.available ? valuation.estimate.likelyThb : null;

  const lastCheck = db.documentChecks.filter((d) => d.listingId === listingId).at(-1);
  const sellerListings = db.listings.filter((l) => l.sellerId === listing.sellerId && l.status === "active");
  const seller = db.profiles.find((p) => p.id === listing.sellerId);

  return assessListing({
    askingThb: listing.askingPriceThb,
    likelyThb,
    photoHashes: [],
    otherPhotos: [],
    sellerId: listing.sellerId,
    deedOwnerMismatch: Boolean(lastCheck?.flags.some((f) => f.severity === "critical" && DEED_MISMATCH.test(f.message))),
    seller: {
      // Seeded personas have no creation date: they count as established accounts.
      accountCreatedAt: seller?.createdAt ?? "2000-01-01T00:00:00Z",
      activeListings: sellerListings.length,
      maxListingPriceThb: Math.max(0, ...sellerListings.map((l) => l.askingPriceThb)),
    },
    description: "",
    chatFlags: [],
    now,
  });
}
