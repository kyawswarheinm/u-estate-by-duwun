import { describe, expect, it } from "vitest";
import { coOwnerShares, scoreOffers, sellerFee, validateJoin, rentalPlacementFee } from "./rules";
import { seed } from "./seed";
import type { CobuyGroup, CobuyParticipant } from "./types";

const db = seed(new Date("2026-10-15T10:00:00Z"));
const byId = <T extends { id: string }>(arr: T[], id: string) => arr.find((x) => x.id === id)!;
const condo = byId(db.properties, "p-condo");
const house = byId(db.properties, "p-house");
const building = db.buildings[0];
const group = (target: number): CobuyGroup => ({ id: "g1", listingId: "l", targetThb: target, deadline: "", status: "forming", createdBy: "u-somchai", createdAt: "" });

describe("fees (R1)", () => {
  it("charges 1.5% standard and 0.75% for members", () => {
    expect(sellerFee(4_000_000, false)).toBe(60_000);
    expect(sellerFee(4_000_000, true)).toBe(30_000);
  });
  it("rental placement is 50% / 25% of one month", () => {
    expect(rentalPlacementFee(20_000, false)).toBe(10_000);
    expect(rentalPlacementFee(20_000, true)).toBe(5_000);
  });
});

describe("co-buy rules", () => {
  it("R2: non-members cannot join", () => {
    const r = validateJoin({ profile: byId(db.profiles, "u-narin"), property: condo, building, group: group(4_000_000), participants: [], lane: "co_owner", amountThb: 1_000_000 });
    expect(r.ok).toBe(false);
  });
  it("R4: foreigners cannot co-own land, but can lend", () => {
    const daniel = byId(db.profiles, "u-daniel");
    expect(validateJoin({ profile: daniel, property: house, group: group(6_000_000), participants: [], lane: "co_owner", amountThb: 1_000_000 }).ok).toBe(false);
    expect(validateJoin({ profile: daniel, property: house, group: group(6_000_000), participants: [], lane: "lender", amountThb: 1_000_000, interestRatePct: 7 }).ok).toBe(true);
  });
  it("R7: lender interest above 15% is rejected", () => {
    const r = validateJoin({ profile: byId(db.profiles, "u-daniel"), property: house, group: group(6_000_000), participants: [], lane: "lender", amountThb: 1_000_000, interestRatePct: 16 });
    expect(r.ok).toBe(false);
  });
  it("R5: condo foreign quota is enforced by floor area and FET is flagged", () => {
    const ok = validateJoin({ profile: byId(db.profiles, "u-aiko"), property: condo, building, group: group(4_000_000), participants: [], lane: "co_owner", amountThb: 1_000_000 });
    expect(ok.ok).toBe(true);
    expect(ok.derived.fetRequired).toBe(true);
    expect(ok.derived.areaSqmAttributed).toBe(10);
    const full = { ...building, foreignAreaUsedSqm: 5875 }; // limit 5880 m²
    const blocked = validateJoin({ profile: byId(db.profiles, "u-aiko"), property: condo, building: full, group: group(4_000_000), participants: [], lane: "co_owner", amountThb: 1_000_000 });
    expect(blocked.ok).toBe(false);
  });
  it("cannot over-commit beyond the target", () => {
    const parts: CobuyParticipant[] = [{ id: "a", groupId: "g1", userId: "u-somchai", lane: "co_owner", amountThb: 3_500_000, fetRequired: false, joinedAt: "" }];
    const r = validateJoin({ profile: byId(db.profiles, "u-ploy"), property: condo, building, group: group(4_000_000), participants: parts, lane: "co_owner", amountThb: 1_000_000 });
    expect(r.ok).toBe(false);
  });
  it("lenders hold loans, not shares", () => {
    const parts: CobuyParticipant[] = [
      { id: "a", groupId: "g1", userId: "u-somchai", lane: "co_owner", amountThb: 3_000_000, fetRequired: false, joinedAt: "" },
      { id: "b", groupId: "g1", userId: "u-ploy", lane: "co_owner", amountThb: 1_000_000, fetRequired: false, joinedAt: "" },
      { id: "c", groupId: "g1", userId: "u-daniel", lane: "lender", amountThb: 2_000_000, interestRatePct: 7, fetRequired: false, joinedAt: "" },
    ];
    expect(coOwnerShares(parts)).toEqual([{ userId: "u-somchai", sharePct: 75 }, { userId: "u-ploy", sharePct: 25 }]);
  });
});

describe("FairOffer scoring (R10)", () => {
  it("ranks by the published criteria only", () => {
    const round = db.offerRounds[0];
    const ranked = scoreOffers(db.offers, round.criteria);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});
