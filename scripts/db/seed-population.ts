// Seeds the Co-Invest demo population (D-44) into a Supabase project: 90 fictional members (50 standard, 40 premium,
// made-up example.com emails), six SAMPLE Co-Invest properties and their trading history, plus two premium personas.
// It replays src/lib/coinvest/population.ts through the service-role SQL functions of migration 0700
// (demo_seed_premium, demo_seed_trade, coinvest_revalue), so the database applies the same rules members face.
//
//   1. Apply supabase/migrations/20261016000700_premium_coinvest.sql first (SQL editor).
//   2. npm run db:seed (personas and listings) if the project is new.
//   3. npx --yes tsx@4.20.6 scripts/db/seed-population.ts            dry run: prints the plan, writes nothing
//      npx --yes tsx@4.20.6 scripts/db/seed-population.ts --apply    writes (idempotent: fixed ids and request ids)
// Never deletes or resets anything. Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { populationPlan } from "../../src/lib/coinvest/population";
import { currentValuation, valueAt } from "../../src/lib/coinvest/valuation";

for (const line of (() => { try { return readFileSync(".env.local", "utf8").split(/\r?\n/); } catch { return []; } })()) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const apply = process.argv.includes("--apply");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const MALEE = id(101), PLOY = id(103), DANIEL = id(104);
const plan = populationPlan();
const ids = {
  user: (key: string) => id(2000 + Number(key.slice(1))),
  building: (key: string) => id(2200 + plan.buildings.findIndex((b) => b.key === key) + 1),
  property: (key: string) => id(2300 + plan.properties.findIndex((p) => p.key === key) + 1),
  offering: (key: string) => id(2400 + plan.offerings.findIndex((o) => o.key === key) + 1),
  topUp: (n: number, k: number) => id(3000 + n * 10 + k),
  trade: (seq: number) => id(5000 + seq),
};
const base = (offeringKey: string) => {
  const o = plan.offerings.find((x) => x.key === offeringKey)!;
  return { baseValueThb: o.totalUnits * o.unitParThb, baseMonth: o.baseMonth };
};
const typeOf = (offeringKey: string) => plan.properties.find((p) => p.key === plan.offerings.find((o) => o.key === offeringKey)!.propertyKey)!.type;

async function main() {
  console.log(`Plan: ${plan.users.length} members (${plan.users.filter((u) => u.tier === "premium").length} premium), ${plan.buildings.length} buildings, ${plan.properties.length} properties, ${plan.offerings.length} offerings, ${plan.trades.length} trades.`);
  if (!apply) {
    console.log("Dry run. Nothing was written. Re-run with --apply to seed.");
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const must = <T,>(label: string, r: { error: { message: string } | null; data?: T | null }) => {
    if (r.error) throw new Error(`${label}: ${r.error.message}`);
    return r.data as T;
  };

  // 0. Migration 0700 present?
  const probe = await admin.from("coinvest_offerings").select("id").limit(1);
  if (probe.error) {
    console.error("Co-Invest tables not found. Apply supabase/migrations/20261016000700_premium_coinvest.sql first.");
    process.exit(1);
  }

  // 1. Member accounts (fixed ids; unusable random passwords: these are background members, not sign-in accounts)
  const existing = new Set<string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    data.users.forEach((u) => existing.add(u.id));
    if (data.users.length < 1000) break;
  }
  let created = 0;
  for (const u of plan.users) {
    if (existing.has(ids.user(u.key))) continue;
    const { error } = await admin.auth.admin.createUser({
      id: ids.user(u.key), email: `member.${String(u.n).padStart(3, "0")}@example.com`, email_confirm: true,
      password: randomBytes(24).toString("base64url"), user_metadata: { name: u.name, nationality: u.nationality, locale: u.locale },
    });
    if (error) throw new Error(`create member ${u.n}: ${error.message}`);
    created++;
  }
  for (const u of plan.users) must(`profile ${u.key}`, await admin.from("profiles").update({ utopia_member: u.tier === "premium" }).eq("id", ids.user(u.key)));
  must("top-ups", await admin.from("wallet_transactions").upsert(plan.users.flatMap((u) => Array.from({ length: u.topUps }, (_, k) => ({
    id: ids.topUp(u.n, k + 1), user_id: ids.user(u.key), kind: "top_up", amount_thb: 1_000_000, note: "Test money added (demo)",
    created_at: new Date(Date.UTC(2023, 6, 1) + u.n * 6 * 86_400_000 + (k + 1) * 20 * 86_400_000).toISOString(),
  }))), { onConflict: "id", ignoreDuplicates: true }));

  // 2. SAMPLE properties for Co-Invest (owned by the seller persona) and their offerings
  must("buildings", await admin.from("buildings").upsert(plan.buildings.map((b) => ({
    id: ids.building(b.key), owner_id: MALEE, name: b.name, district: b.district, province: b.province,
    total_floor_area_sqm: b.totalFloorAreaSqm, foreign_area_used_sqm: b.foreignAreaUsedSqm, build_year: b.buildYear,
  })), { onConflict: "id", ignoreDuplicates: true }));
  must("properties", await admin.from("properties").upsert(plan.properties.map((p) => ({
    id: ids.property(p.key), owner_id: MALEE, type: p.type, building_id: p.buildingKey ? ids.building(p.buildingKey) : null, title: p.title,
    district: p.district, province: p.province, area_sqm: p.areaSqm, build_year: p.buildYear, deed_type: p.deedType,
    official_appraisal_thb: p.appraisalThb, appraisal_source: "Treasury Department appraisal (sample value)", appraisal_date: "2025-01", index_series: p.indexSeries,
  })), { onConflict: "id", ignoreDuplicates: true }));
  must("offerings", await admin.from("coinvest_offerings").upsert(plan.offerings.map((o) => ({
    id: ids.offering(o.key), code: o.code, property_id: ids.property(o.propertyKey), total_units: o.totalUnits, unit_par_thb: o.unitParThb,
    target_thb: o.totalUnits * o.unitParThb, base_value_thb: o.totalUnits * o.unitParThb, base_month: o.baseMonth,
    current_value_thb: o.totalUnits * o.unitParThb, valued_month: o.baseMonth, gross_yield_pct: o.grossYieldPct, max_holders: 20,
    opens_at: o.opensAt, created_at: o.opensAt,
  })), { onConflict: "id", ignoreDuplicates: true }));

  // 3. History, in time order, through the same SQL rules members use
  const events = [
    ...plan.users.filter((u) => u.tier === "premium").map((u) => ({ at: u.premiumAt!, run: () => admin.rpc("demo_seed_premium", { p_user: ids.user(u.key), p_at: u.premiumAt }) })),
    ...plan.trades.map((t) => ({
      at: t.at,
      run: () => admin.rpc("demo_seed_trade", {
        p_user: ids.user(t.userKey), p_offering: ids.offering(t.offeringKey), p_side: t.side, p_units: t.units, p_request: ids.trade(t.seq), p_at: t.at,
        p_value: valueAt(base(t.offeringKey), typeOf(t.offeringKey), t.at.slice(0, 7)), // used only once the offering is funded
      }),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of events) must(`event ${e.at}`, await e.run());
  for (const o of plan.offerings) {
    const v = currentValuation(base(o.key), typeOf(o.key));
    must(`revalue ${o.code}`, await admin.rpc("coinvest_revalue", { p_offering: ids.offering(o.key), p_value: v.valueThb, p_month: v.month }));
  }
  // Two premium personas with a holding each (Thai and foreign), like the offline demo
  const at = "2026-10-12T04:00:00.000Z";
  for (const [persona, offering, units, n] of [[PLOY, "ari", 20, 1], [DANIEL, "ari-studio", 10, 2]] as const) {
    must(`premium ${persona}`, await admin.rpc("demo_seed_premium", { p_user: persona, p_at: at }));
    must(`persona trade ${persona}`, await admin.rpc("demo_seed_trade", { p_user: persona, p_offering: ids.offering(offering), p_side: "buy", p_units: units, p_request: id(5900 + n), p_at: at, p_value: null }));
  }

  // 4. Check the invariants on the result
  const offerings = must<{ id: string; code: string; units_outstanding: number; total_units: number }[]>("read offerings", await admin.from("coinvest_offerings").select("id, code, units_outstanding, total_units"));
  const holdings = must<{ offering_id: string; units: number }[]>("read holdings", await admin.from("coinvest_holdings").select("offering_id, units"));
  const problems = offerings.filter((o) => holdings.filter((h) => h.offering_id === o.id).reduce((s, h) => s + h.units, 0) !== o.units_outstanding).map((o) => o.code);
  const premiumCount = (await admin.from("profiles").select("id", { count: "exact", head: true }).eq("premium", true)).count;
  console.log(`Created ${created} member accounts. Offerings: ${offerings.length}. Holdings: ${holdings.filter((h) => h.units > 0).length}. Premium profiles: ${premiumCount}.`);
  if (problems.length) {
    console.error(`Units do not add up for: ${problems.join(", ")}`);
    process.exit(1);
  }
  console.log("Invariants OK: member units add up to units outstanding for every offering.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
