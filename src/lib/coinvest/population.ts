// The demo population (D-44): 90 fictional members (50 standard, 40 premium) and six SAMPLE Co-Invest properties,
// with a deterministic trading history. One plan feeds both the offline seed (src/lib/seed.ts) and the hosted seed
// (scripts/db/seed-population.ts), so both databases hold the same story. Every name is invented; every email
// uses example.com; the activity is test money and is never presented as real adoption or real investment.
import type { PropertyType } from "../types";

export type Tier = "standard" | "premium";
export type PopUser = { n: number; key: string; name: string; nationality: string; isThai: boolean; locale: "en" | "th" | "ar" | "zh-Hant" | "es"; tier: Tier; topUps: number; premiumAt?: string };
export type PopBuilding = { key: string; name: string; district: string; province: string; totalFloorAreaSqm: number; foreignAreaUsedSqm: number; buildYear: number };
export type PopProperty = { key: string; type: PropertyType; title: string; district: string; province: string; areaSqm: number; buildingKey?: string; buildYear: number; deedType: string; appraisalThb: number; indexSeries: "condo_bkk" | "house_bkk" };
export type PopOffering = { key: string; code: string; propertyKey: string; totalUnits: number; unitParThb: number; baseMonth: string; grossYieldPct: number; opensAt: string };
export type PopTrade = { seq: number; userKey: string; offeringKey: string; side: "buy" | "sell"; units: number; at: string };

export const POP_BUILDINGS: PopBuilding[] = [
  { key: "lumpini", name: "Lumpini Park Residence (sample)", district: "Pathum Wan", province: "Bangkok", totalFloorAreaSqm: 18000, foreignAreaUsedSqm: 6000, buildYear: 2019 },
  { key: "ari", name: "Ari Garden Condominium (sample)", district: "Phaya Thai", province: "Bangkok", totalFloorAreaSqm: 9000, foreignAreaUsedSqm: 2500, buildYear: 2021 },
  { key: "ratchada", name: "Ratchada Skyline (sample)", district: "Huai Khwang", province: "Bangkok", totalFloorAreaSqm: 15000, foreignAreaUsedSqm: 5200, buildYear: 2018 },
];

const CONDO_DEED = "Condominium title (อ.ช.2)";
const LAND_DEED = "Chanote (โฉนด น.ส.4 จ.)";
export const POP_PROPERTIES: PopProperty[] = [
  { key: "lumpini", type: "condo", title: "2-bed condo, Lumpini Park Residence (sample)", district: "Pathum Wan", province: "Bangkok", areaSqm: 72, buildingKey: "lumpini", buildYear: 2019, deedType: CONDO_DEED, appraisalThb: 9_100_000, indexSeries: "condo_bkk" },
  { key: "ari", type: "condo", title: "1-bed condo, Ari Garden (sample)", district: "Phaya Thai", province: "Bangkok", areaSqm: 45, buildingKey: "ari", buildYear: 2021, deedType: CONDO_DEED, appraisalThb: 4_300_000, indexSeries: "condo_bkk" },
  { key: "ratchada", type: "condo", title: "3-bed condo, Ratchada Skyline (sample)", district: "Huai Khwang", province: "Bangkok", areaSqm: 110, buildingKey: "ratchada", buildYear: 2018, deedType: CONDO_DEED, appraisalThb: 11_600_000, indexSeries: "condo_bkk" },
  { key: "bangkapi", type: "townhouse", title: "3-bed townhouse, Bang Kapi (sample)", district: "Bang Kapi", province: "Bangkok", areaSqm: 160, buildYear: 2016, deedType: LAND_DEED, appraisalThb: 6_200_000, indexSeries: "house_bkk" },
  { key: "ladprao", type: "house", title: "4-bed house, Lat Phrao (sample)", district: "Lat Phrao", province: "Bangkok", areaSqm: 220, buildYear: 2014, deedType: LAND_DEED, appraisalThb: 7_700_000, indexSeries: "house_bkk" },
  { key: "ari-studio", type: "condo", title: "Studio condo, Ari Garden (sample)", district: "Phaya Thai", province: "Bangkok", areaSqm: 32, buildingKey: "ari", buildYear: 2021, deedType: CONDO_DEED, appraisalThb: 2_900_000, indexSeries: "condo_bkk" },
];

// Funded offerings started in the past (their value has moved with the index since); the last three are still funding.
export const POP_OFFERINGS: PopOffering[] = [
  { key: "lumpini", code: "ci-lumpini", propertyKey: "lumpini", totalUnits: 1000, unitParThb: 9_800, baseMonth: "2024-03", grossYieldPct: 4.1, opensAt: "2024-02-05T03:00:00.000Z" },
  { key: "ratchada", code: "ci-ratchada", propertyKey: "ratchada", totalUnits: 1000, unitParThb: 12_400, baseMonth: "2023-09", grossYieldPct: 4.4, opensAt: "2023-08-07T03:00:00.000Z" },
  { key: "ladprao", code: "ci-ladprao", propertyKey: "ladprao", totalUnits: 1000, unitParThb: 8_200, baseMonth: "2024-11", grossYieldPct: 3.6, opensAt: "2024-10-07T03:00:00.000Z" },
  { key: "ari", code: "ci-ari", propertyKey: "ari", totalUnits: 500, unitParThb: 9_200, baseMonth: "2026-08", grossYieldPct: 4.8, opensAt: "2026-09-15T03:00:00.000Z" },
  { key: "bangkapi", code: "ci-bangkapi", propertyKey: "bangkapi", totalUnits: 500, unitParThb: 13_600, baseMonth: "2026-08", grossYieldPct: 3.9, opensAt: "2026-09-20T03:00:00.000Z" },
  { key: "ari-studio", code: "ci-ari-studio", propertyKey: "ari-studio", totalUnits: 250, unitParThb: 12_400, baseMonth: "2026-08", grossYieldPct: 5.2, opensAt: "2026-10-01T03:00:00.000Z" },
];

// ---- people (fictional) ----
const THAI_FIRST = ["Anong", "Busaba", "Chanin", "Daeng", "Ekkachai", "Fah", "Kanya", "Jirayu", "Kittipong", "Lamai", "Manee", "Nattapong", "Orathai", "Pakorn", "Rattana", "Sakda", "Thanawat", "Ubon", "Waraporn", "Yupin", "Arthit", "Benjamas", "Chalerm", "Duangjai", "Kamon", "Kwanjai", "Mali", "Nopadol", "Pimchanok", "Sirin", "Tanapat", "Wichai", "Achara", "Boonmee", "Chutima", "Kesorn", "Nisa", "Prasert", "Saowanee", "Thida", "Wanida", "Yodsak", "Apinya", "Chaiwat", "Jintana", "Krit", "Nuntaporn", "Pornthip", "Somkiat", "Veera"];
const INITIALS = "BCDJKLMNPRSTW";
const FOREIGN: { first: string; nationality: string; locale: PopUser["locale"] }[] = [
  { first: "Haruto", nationality: "Japanese", locale: "en" }, { first: "Mei", nationality: "Taiwanese", locale: "zh-Hant" },
  { first: "Lucas", nationality: "German", locale: "en" }, { first: "Amira", nationality: "Emirati", locale: "ar" },
  { first: "Sofia", nationality: "Spanish", locale: "es" }, { first: "Oliver", nationality: "British", locale: "en" },
  { first: "Ji-woo", nationality: "Korean", locale: "en" }, { first: "Wei", nationality: "Singaporean", locale: "en" },
  { first: "Camille", nationality: "French", locale: "en" }, { first: "Diego", nationality: "Mexican", locale: "es" },
  { first: "Priya", nationality: "Indian", locale: "en" }, { first: "Noah", nationality: "Australian", locale: "en" },
  { first: "Yuki", nationality: "Japanese", locale: "en" }, { first: "Omar", nationality: "Emirati", locale: "ar" },
  { first: "Chen", nationality: "Taiwanese", locale: "zh-Hant" }, { first: "Elena", nationality: "Spanish", locale: "es" },
];

/** Small deterministic PRNG (mulberry32): the same plan on every machine and every run. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function populationUsers(): PopUser[] {
  const users: PopUser[] = [];
  const r = rng(90);
  // 40 premium (28 Thai, 12 foreign), then 50 standard (38 Thai, 12 foreign)
  let thai = 0, foreign = 0;
  for (let n = 1; n <= 90; n++) {
    const tier: Tier = n <= 40 ? "premium" : "standard";
    const isForeign = tier === "premium" ? n % 10 === 3 || n % 10 === 7 || n % 10 === 9 : n % 4 === 0;
    let name: string, nationality: string, locale: PopUser["locale"], isThai: boolean;
    if (isForeign) {
      const f = FOREIGN[foreign % FOREIGN.length];
      name = `${f.first} ${INITIALS[(foreign * 5) % INITIALS.length]}.`;
      nationality = f.nationality; locale = f.locale; isThai = false;
      foreign++;
    } else {
      name = `${THAI_FIRST[thai % THAI_FIRST.length]} ${INITIALS[(thai * 7 + 3) % INITIALS.length]}.`;
      nationality = "Thai"; locale = n % 3 === 0 ? "en" : "th"; isThai = true;
      thai++;
    }
    const topUps = Math.floor(r() * 4); // 0–3 top-ups of ฿1M
    users.push({ n, key: `m${String(n).padStart(3, "0")}`, name, nationality, isThai, locale, tier, topUps });
  }
  return users;
}

/** Splits `total` units into `parts` positive integers that sum exactly to `total`, deterministically. */
function split(total: number, parts: number, r: () => number) {
  const weights = Array.from({ length: parts }, () => 0.5 + r());
  const sum = weights.reduce((s, w) => s + w, 0);
  const out = weights.map((w) => Math.max(1, Math.floor((w / sum) * total)));
  let diff = total - out.reduce((s, x) => s + x, 0);
  for (let i = 0; diff !== 0; i = (i + 1) % parts) {
    if (diff > 0) { out[i]++; diff--; } else if (out[i] > 1) { out[i]--; diff++; }
  }
  return out;
}

const iso = (date: string, hour: number) => new Date(`${date}T${String(hour).padStart(2, "0")}:00:00.000Z`).toISOString();
const addDays = (date: string, days: number) => new Date(new Date(`${date}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The trading history: who funded which property, then a few sales back to the pool and purchases from it.
 * Foreign members only take condo units (D-14). Every premium member ends with at least one holding.
 */
export function populationPlan() {
  const users = populationUsers();
  const premium = users.filter((u) => u.tier === "premium");
  const r = rng(42);
  const trades: PopTrade[] = [];
  let seq = 0;
  const push = (t: Omit<PopTrade, "seq">) => trades.push({ ...t, seq: ++seq });
  const condo = new Set(POP_PROPERTIES.filter((p) => p.type === "condo").map((p) => p.key));

  // Holder lists per offering: [offering, holder count, units to fund]
  const plan: [PopOffering, number, number][] = [
    [POP_OFFERINGS[1], 16, 1000], // ratchada: fully funded
    [POP_OFFERINGS[0], 14, 1000], // lumpini: fully funded
    [POP_OFFERINGS[2], 12, 1000], // ladprao (house): fully funded, Thai members only
    [POP_OFFERINGS[3], 9, 350], // ari: 70% funded
    [POP_OFFERINGS[4], 6, 225], // bangkapi (townhouse): 45% funded, Thai members only
    [POP_OFFERINGS[5], 3, 50], // ari studio: 20% funded
  ];
  const holdings = new Map<string, Set<string>>(); // offering -> users
  const count = new Map<string, number>(); // user -> holdings
  let cursor = 0;
  for (const [o, holders, units] of plan) {
    const prop = POP_PROPERTIES.find((p) => p.key === o.propertyKey)!;
    const eligible = premium.filter((u) => u.isThai || condo.has(prop.key));
    const chosen: PopUser[] = [];
    // Prefer members with no holding yet, so every premium member ends up invested.
    const order = [...eligible].sort((a, b) => (count.get(a.key) ?? 0) - (count.get(b.key) ?? 0) || ((a.n + cursor) % 40) - ((b.n + cursor) % 40));
    for (const u of order) {
      if (chosen.length === holders) break;
      chosen.push(u);
    }
    cursor += 7;
    const amounts = split(units, holders, r);
    holdings.set(o.key, new Set(chosen.map((u) => u.key)));
    const start = o.opensAt.slice(0, 10);
    chosen.forEach((u, i) => {
      count.set(u.key, (count.get(u.key) ?? 0) + 1);
      const day = Math.min(27, 1 + Math.floor((i * 26) / holders));
      push({ userKey: u.key, offeringKey: o.key, side: "buy", units: amounts[i], at: iso(addDays(start, day), 3 + (i % 9)) });
    });
  }

  // Secondary trades on the funded offerings: some members sell part of their units back to the pool, later another
  // member buys some of them. Each offering keeps units in the pool, so new members can still buy in the live demo.
  const secondary: [string, string, string, number, number][] = [
    // offering, seller month, buyer month, units sold, units bought back
    ["ratchada", "2024-05-12", "2025-01-20", 60, 35],
    ["ratchada", "2025-06-03", "2026-02-11", 40, 20],
    ["lumpini", "2024-09-18", "2025-04-08", 50, 30],
    ["lumpini", "2025-11-05", "2026-06-15", 30, 15],
    ["ladprao", "2025-05-21", "2026-01-13", 45, 25],
  ];
  const held = new Map<string, number>();
  for (const t of trades) held.set(`${t.offeringKey}|${t.userKey}`, (held.get(`${t.offeringKey}|${t.userKey}`) ?? 0) + t.units);
  secondary.forEach(([key, sellDay, buyDay, sold, bought], i) => {
    const holders = [...holdings.get(key)!];
    const seller = holders[(i * 3) % holders.length];
    const units = Math.min(sold, (held.get(`${key}|${seller}`) ?? 0) - 1);
    if (units > 0) {
      push({ userKey: seller, offeringKey: key, side: "sell", units, at: iso(sellDay, 4) });
      held.set(`${key}|${seller}`, (held.get(`${key}|${seller}`) ?? 0) - units);
    }
    const prop = POP_PROPERTIES.find((p) => p.key === POP_OFFERINGS.find((o) => o.key === key)!.propertyKey)!;
    const buyer = holders.find((u) => u !== seller && (premium.find((p) => p.key === u)!.isThai || condo.has(prop.key)))!;
    push({ userKey: buyer, offeringKey: key, side: "buy", units: Math.min(bought, units), at: iso(buyDay, 5) });
    held.set(`${key}|${buyer}`, (held.get(`${key}|${buyer}`) ?? 0) + Math.min(bought, units));
  });
  // One withdrawal during funding (a refund at the funding price).
  const ariHolder = [...holdings.get("ari")!][0];
  const ariUnits = trades.find((t) => t.offeringKey === "ari" && t.userKey === ariHolder)!.units;
  push({ userKey: ariHolder, offeringKey: "ari", side: "sell", units: Math.max(1, Math.floor(ariUnits / 4)), at: iso("2026-10-08", 6) });

  trades.sort((a, b) => a.at.localeCompare(b.at) || a.seq - b.seq);
  // Premium since: a week before the member's first trade.
  for (const u of premium) {
    const first = trades.find((t) => t.userKey === u.key);
    u.premiumAt = first ? new Date(new Date(first.at).getTime() - 7 * 86_400_000).toISOString() : iso("2026-09-01", 2);
  }
  return { users, buildings: POP_BUILDINGS, properties: POP_PROPERTIES, offerings: POP_OFFERINGS, trades };
}
