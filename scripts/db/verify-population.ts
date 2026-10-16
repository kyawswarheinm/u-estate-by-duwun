// Replays the Co-Invest demo population through the SQL functions of migration 0700 in PGlite (no Supabase needed)
// and checks the result matches the offline TypeScript engine unit for unit, and that every invariant holds.
// Proves `scripts/db/seed-population.ts --apply` will succeed on a hosted project. Run: npm run db:verify-population
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { populationPlan } from "../../src/lib/coinvest/population";
import { currentValuation, valueAt } from "../../src/lib/coinvest/valuation";
import { applyPopulation } from "../../src/lib/coinvest/apply";
import { baseSeed } from "../../src/lib/seed";

async function main() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text unique, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now());
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid, metadata jsonb, created_at timestamptz default now());
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    create publication supabase_realtime;
  `);
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(f, dir), "utf8"));

  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const plan = populationPlan();
  const MALEE = id(101);
  const ids = {
    user: (key: string) => id(2000 + Number(key.slice(1))),
    building: (key: string) => id(2200 + plan.buildings.findIndex((b) => b.key === key) + 1),
    property: (key: string) => id(2300 + plan.properties.findIndex((p) => p.key === key) + 1),
    offering: (key: string) => id(2400 + plan.offerings.findIndex((o) => o.key === key) + 1),
  };
  const base = (key: string) => {
    const o = plan.offerings.find((x) => x.key === key)!;
    return { baseValueThb: o.totalUnits * o.unitParThb, baseMonth: o.baseMonth };
  };
  const typeOf = (key: string) => plan.properties.find((p) => p.key === plan.offerings.find((o) => o.key === key)!.propertyKey)!.type;

  await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'malee@example.com', $2)", [MALEE, JSON.stringify({ name: "Khun Malee", nationality: "Thai" })]);
  for (const u of plan.users) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)", [ids.user(u.key), `member.${u.n}@example.com`, JSON.stringify({ name: u.name, nationality: u.nationality, locale: u.locale })]);
    for (let k = 1; k <= u.topUps; k++) await db.query("insert into wallet_transactions (user_id, kind, amount_thb, note) values ($1, 'top_up', 1000000, 'Test money added (demo)')", [ids.user(u.key)]);
  }
  for (const b of plan.buildings) await db.query("insert into buildings (id, owner_id, name, district, province, total_floor_area_sqm, foreign_area_used_sqm, build_year) values ($1,$2,$3,$4,$5,$6,$7,$8)", [ids.building(b.key), MALEE, b.name, b.district, b.province, b.totalFloorAreaSqm, b.foreignAreaUsedSqm, b.buildYear]);
  for (const p of plan.properties) await db.query("insert into properties (id, owner_id, type, building_id, title, district, province, area_sqm, index_series) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [ids.property(p.key), MALEE, p.type, p.buildingKey ? ids.building(p.buildingKey) : null, p.title, p.district, p.province, p.areaSqm, p.indexSeries]);
  for (const o of plan.offerings) await db.query("insert into coinvest_offerings (id, code, property_id, total_units, unit_par_thb, target_thb, base_value_thb, base_month, current_value_thb, valued_month, gross_yield_pct) values ($1,$2,$3,$4,$5,$6,$6,$7,$6,$7,$8)", [ids.offering(o.key), o.code, ids.property(o.propertyKey), o.totalUnits, o.unitParThb, o.totalUnits * o.unitParThb, o.baseMonth, o.grossYieldPct]);

  const events = [
    ...plan.users.filter((u) => u.tier === "premium").map((u) => ({ at: u.premiumAt!, sql: "select demo_seed_premium($1, $2)", args: [ids.user(u.key), u.premiumAt] })),
    ...plan.trades.map((t) => ({ at: t.at, sql: "select demo_seed_trade($1, $2, $3, $4, $5, $6, $7)", args: [ids.user(t.userKey), ids.offering(t.offeringKey), t.side, t.units, id(5000 + t.seq), t.at, valueAt(base(t.offeringKey), typeOf(t.offeringKey), t.at.slice(0, 7))] })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of events) await db.query(e.sql, e.args);
  for (const e of events) await db.query(e.sql, e.args); // a second run must change nothing
  for (const o of plan.offerings) {
    const v = currentValuation(base(o.key), typeOf(o.key));
    await db.query("select coinvest_revalue($1, $2, $3)", [ids.offering(o.key), v.valueThb, v.month]);
  }

  // The same plan through the TypeScript engine (offline store)
  const ts = baseSeed(new Date("2026-10-16T03:00:00.000Z"));
  applyPopulation(ts, { user: (k) => `u-${k}`, building: (k) => `b-ci-${k}`, property: (k) => `p-ci-${k}`, offering: (k) => `ci-${k}`, sellerId: "u-malee" });

  const checks: [string, boolean][] = [];
  const rows = (await db.query<{ code: string; user_id: string; units: number }>("select o.code, h.user_id, h.units from coinvest_holdings h join coinvest_offerings o on o.id = h.offering_id where h.units > 0")).rows;
  const sqlHoldings = new Set(rows.map((r) => `${r.code}|${Number(r.user_id.slice(-4)) - 2000}|${r.units}`));
  const tsHoldings = new Set(ts.coinvestHoldings.filter((h) => h.units > 0).map((h) => `${ts.coinvestOfferings.find((o) => o.id === h.offeringId)!.code}|${Number(h.userId.slice(3))}|${h.units}`));
  checks.push(["SQL and TypeScript give every member the same units", sqlHoldings.size === tsHoldings.size && [...sqlHoldings].every((x) => tsHoldings.has(x))]);
  const offerings = (await db.query<{ code: string; status: string; units_outstanding: number; current_value_thb: string }>("select code, status, units_outstanding, current_value_thb from coinvest_offerings")).rows;
  checks.push(["offering status, units and value match", offerings.every((o) => {
    const t = ts.coinvestOfferings.find((x) => x.code === o.code)!;
    return t.status === o.status && t.unitsOutstanding === o.units_outstanding && t.currentValueThb === Number(o.current_value_thb);
  })]);
  checks.push(["the replay was idempotent", (await db.query<{ n: number }>("select count(*)::int n from coinvest_trades")).rows[0].n === plan.trades.length]);
  checks.push(["90 members, 40 premium", (await db.query<{ n: number }>("select count(*)::int n from profiles where premium")).rows[0].n === 40 && (await db.query<{ n: number }>("select count(*)::int n from profiles")).rows[0].n === 91]);
  checks.push(["units add up for every offering", (await db.query("select o.id from coinvest_offerings o where o.units_outstanding <> coalesce((select sum(units) from coinvest_holdings h where h.offering_id = o.id), 0)")).rows.length === 0]);
  checks.push(["no negative balance", (await db.query("select user_id from wallet_balances where available_thb < 0")).rows.length === 0]);
  checks.push(["every trade is on the ledger", (await db.query<{ n: number }>("select count(*)::int n from ledger_entries where entry_type = 'share_transfer'")).rows[0].n === plan.trades.length]);
  for (const [name, ok] of checks) console.log(`${ok ? "✓" : "✗"} ${name}`);
  const failed = checks.filter(([, ok]) => !ok).length;
  console.log(`\n${checks.length - failed}/${checks.length} population checks passed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
