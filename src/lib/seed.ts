import type { DB } from "./types";

// All people, properties and numbers below are SAMPLE data for the hackathon demo.
export function seed(now = new Date()): DB {
  const iso = (d: Date) => d.toISOString();
  const inHours = (h: number) => iso(new Date(now.getTime() + h * 3600_000));

  return {
    profiles: [
      { id: "u-malee", isDemoPersona: true, name: "Khun Malee", nationality: "Thai", isThai: true, utopiaMember: false, roles: ["seller", "landlord"] },
      { id: "u-somchai", isDemoPersona: true, name: "Somchai", nationality: "Thai", isThai: true, utopiaMember: true, roles: ["buyer", "co-buyer"] },
      { id: "u-ploy", isDemoPersona: true, name: "Ploy", nationality: "Thai", isThai: true, utopiaMember: true, roles: ["co-buyer"] },
      { id: "u-daniel", isDemoPersona: true, name: "Daniel", nationality: "Australian", isThai: false, utopiaMember: true, roles: ["co-buyer", "lender"] },
      { id: "u-aiko", isDemoPersona: true, name: "Aiko", nationality: "Japanese", isThai: false, utopiaMember: true, roles: ["co-buyer"] },
      { id: "u-narin", isDemoPersona: true, name: "Narin", nationality: "Thai", isThai: true, utopiaMember: false, roles: ["buyer"] },
      { id: "u-manager", isDemoPersona: true, name: "Prop Manager Co.", nationality: "Thai", isThai: true, utopiaMember: false, roles: ["property manager"] },
    ],
    buildings: [
      // Foreign quota: 49% of total floor area. 35% used, so two foreign co-owners can still fit.
      { id: "b-riverside", name: "Riverside Sathorn (sample)", totalFloorAreaSqm: 12000, foreignAreaUsedSqm: 4200 },
    ],
    properties: [
      {
        id: "p-condo",
        type: "condo",
        title: "1-bed condo near BTS, Sathorn",
        province: "Bangkok",
        district: "Sathorn",
        areaSqm: 40,
        buildingId: "b-riverside",
        buildYear: 2016,
        deedType: "Condominium title (อ.ช.2)",
        officialAppraisalThb: 3_200_000,
        appraisalSource: "Treasury Department appraisal (sample value)",
        appraisalDate: "2025-01",
        lastSalePriceThb: 3_400_000,
        lastSaleDate: "2021-06",
        indexSeries: "condo_bkk",
      },
      {
        id: "p-house",
        type: "house",
        title: "3-bed detached house, Nonthaburi",
        province: "Nonthaburi",
        district: "Bang Yai",
        areaSqm: 160,
        buildYear: 2012,
        deedType: "Chanote (โฉนด น.ส.4 จ.)",
        officialAppraisalThb: 4_800_000,
        appraisalSource: "Treasury Department appraisal (sample value)",
        appraisalDate: "2025-01",
        lastSalePriceThb: 5_300_000,
        lastSaleDate: "2020-03",
        indexSeries: "house_bkk",
      },
      {
        id: "p-condo2",
        type: "condo",
        title: "Studio condo, Bang Na (comparable)",
        province: "Bangkok",
        district: "Bang Na",
        areaSqm: 30,
        buildYear: 2018,
        deedType: "Condominium title (อ.ช.2)",
        officialAppraisalThb: 2_300_000,
        appraisalSource: "Treasury Department appraisal (sample value)",
        appraisalDate: "2025-01",
        indexSeries: "condo_bkk",
      },
      // More SAMPLE property types for the market page and the home page (same ids as scripts/db/demo-data.mjs).
      ...([
        ["p-lux", "condo", "Luxury 3-bed condo, Pathum Wan", "Bangkok", "Pathum Wan", 120, 2021, "Condominium title (อ.ช.2)", 13_500_000, "condo_bkk"],
        ["p-condo3", "condo", "2-bed condo near BTS Thong Lo, Watthana", "Bangkok", "Watthana", 65, 2019, "Condominium title (อ.ช.2)", 6_900_000, "condo_bkk"],
        ["p-rent", "condo", "1-bed condo for rent, Chatuchak", "Bangkok", "Chatuchak", 34, 2017, "Condominium title (อ.ช.2)", 2_400_000, "condo_bkk"],
        ["p-town", "townhouse", "3-bed townhouse, Bang Kapi", "Bangkok", "Bang Kapi", 140, 2015, "Chanote (โฉนด น.ส.4 จ.)", 4_700_000, "house_bkk"],
        ["p-apartment", "building", "24-unit apartment building, Huai Khwang", "Bangkok", "Huai Khwang", 1_200, 2010, "Chanote (โฉนด น.ส.4 จ.)", 30_000_000, "house_bkk"],
        ["p-office", "building", "6-floor office building, Khlong Toei", "Bangkok", "Khlong Toei", 2_400, 2008, "Chanote (โฉนด น.ส.4 จ.)", 78_000_000, "house_bkk"],
      ] as const).map(([id, type, title, province, district, areaSqm, buildYear, deedType, appraisal, indexSeries]) => ({
        id, type, title, province, district, areaSqm, buildYear, deedType,
        officialAppraisalThb: appraisal, appraisalSource: "Treasury Department appraisal (sample value)", appraisalDate: "2025-01", indexSeries,
      })),
    ],
    listings: [
      {
        id: "l-condo",
        propertyId: "p-condo",
        sellerId: "u-malee",
        kind: "sale",
        askingPriceThb: 4_000_000,
        status: "active",
        verificationStatus: "unverified",
        verificationReasons: [],
        cobuyEnabled: true,
        createdAt: iso(now),
      },
      {
        id: "l-house",
        propertyId: "p-house",
        sellerId: "u-malee",
        kind: "sale",
        askingPriceThb: 6_000_000,
        status: "active",
        verificationStatus: "unverified",
        verificationReasons: [],
        cobuyEnabled: true,
        createdAt: iso(now),
      },
      {
        id: "l-condo2",
        propertyId: "p-condo2",
        sellerId: "u-malee",
        kind: "sale",
        askingPriceThb: 2_900_000,
        status: "active",
        verificationStatus: "unverified",
        verificationReasons: [],
        cobuyEnabled: false,
        createdAt: iso(now),
      },
      ...([
        ["l-lux", "p-lux", "sale", 16_500_000],
        ["l-condo3", "p-condo3", "sale", 8_000_000],
        ["l-rent", "p-rent", "rent", 18_000],
        ["l-town", "p-town", "sale", 5_900_000],
        ["l-apartment", "p-apartment", "sale", 38_000_000],
        ["l-office", "p-office", "sale", 95_000_000],
      ] as const).map(([id, propertyId, kind, askingPriceThb]) => ({
        id, propertyId, sellerId: "u-malee", kind, askingPriceThb, status: "active" as const,
        verificationStatus: "unverified" as const, verificationReasons: [], cobuyEnabled: false, createdAt: iso(now),
      })),
    ],
    documentChecks: [],
    offerRounds: [
      {
        id: "r-condo",
        listingId: "l-condo",
        criteria: [
          { key: "price", label: "Offered price", weight: 50 },
          { key: "funding", label: "Funding readiness", weight: 25 },
          { key: "closing", label: "Faster closing", weight: 15 },
          { key: "conditions", label: "Fewer conditions", weight: 10 },
        ],
        rulesPublishedAt: iso(now),
        closesAt: inHours(24),
        status: "open",
      },
    ],
    offers: [
      { id: "o-1", roundId: "r-condo", buyerId: "u-narin", priceThb: 3_900_000, funding: "pre_approved", closingDays: 30, conditions: "Subject to inspection", submittedAt: iso(now), status: "submitted" },
      { id: "o-2", roundId: "r-condo", buyerId: "u-ploy", priceThb: 4_050_000, funding: "declared", closingDays: 60, conditions: "Subject to bank loan approval; subject to inspection", submittedAt: iso(now), status: "submitted" },
    ],
    cobuyGroups: [],
    cobuyParticipants: [],
    ledger: [],
    anchors: [],
    accounts: [],
    sessions: [],
    // Every persona starts with ฿5,000,000 of test money (no real funds anywhere in the demo).
    walletTxns: ["u-malee", "u-somchai", "u-ploy", "u-daniel", "u-aiko", "u-narin"].map((userId) => ({
      id: `w-${userId}`, userId, kind: "demo_grant" as const, amountThb: 5_000_000, note: "Demo test-money grant", createdAt: iso(now),
    })),
  };
}
