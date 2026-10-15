import "server-only";
import { cache } from "react";
import { promises as fs } from "node:fs";
import path from "node:path";
import { seed } from "./seed";
import type { DB } from "./types";
import { usesSupabase } from "./db/runtime";
import { readSupabaseDb } from "./db/snapshot";

// Offline JSON-file store; configured Supabase is the default runtime backend.
// Local: .data/db.json. On Vercel the project dir is read-only, so /tmp is used (resets on cold start).
// Set DEMO_OFFLINE=true only when explicitly exercising the offline prototype.
const FILE = process.env.VERCEL
  ? "/tmp/u-estate-db.json"
  : path.join(process.cwd(), ".data", "db.json");

let queue: Promise<unknown> = Promise.resolve();

// Always read the file: pages, server actions and route handlers can run in separate module
// instances, so an in-memory copy goes stale and a later write would overwrite newer data.
async function load(): Promise<DB> {
  for (let attempt = 0; ; attempt++) {
    try {
      const db = JSON.parse(await fs.readFile(FILE, "utf8")) as DB;
      // Files written by older versions of the prototype
      db.anchors ??= [];
      db.accounts ??= [];
      db.sessions ??= [];
      db.walletTxns ??= [];
      migrateSeedData(db);
      return db;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        const db = seed();
        await persist(db);
        return db;
      }
      if (attempt >= 3) throw e; // never silently replace real data with the seed
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

/** Data files from before demo personas and wallets existed: flag the personas and add their test-money grants. */
function migrateSeedData(db: DB) {
  const fresh = seed();
  const personaIds = new Set(fresh.profiles.filter((p) => p.isDemoPersona).map((p) => p.id));
  for (const p of db.profiles) if (personaIds.has(p.id)) p.isDemoPersona = true;
  const have = new Set(db.walletTxns.map((t) => t.id));
  for (const t of fresh.walletTxns) if (!have.has(t.id) && db.profiles.some((p) => p.id === t.userId)) db.walletTxns.push(t);
}

/** Atomic write: a reader never sees a half-written file. */
async function persist(db: DB) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

export const readDb = cache(async (): Promise<DB> => {
  if (usesSupabase()) return readSupabaseDb();
  return load();
});

/** Serialised read-modify-write so concurrent requests don't overwrite each other. */
export function updateDb<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  if (usesSupabase()) throw new Error("JSON writes are disabled while Supabase is active. Use an authorized database action.");
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await persist(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Resets the demo activity (offers, co-buy groups, ledger, deed checks) to the seed.
 * Keeps signed-up accounts, their sessions, their wallets and the properties they listed,
 * so people can sign in again later and still find their listings.
 */
export async function resetDb() {
  return updateDb((db) => {
    const fresh = seed();
    const realUsers = db.profiles.filter((p) => !p.isDemoPersona);
    const realIds = new Set(realUsers.map((p) => p.id));
    const ownListings = db.listings.filter((l) => realIds.has(l.sellerId));
    const ownPropertyIds = new Set(ownListings.map((l) => l.propertyId));
    const ownProperties = db.properties.filter((p) => ownPropertyIds.has(p.id));
    const ownBuildingIds = new Set(ownProperties.map((p) => p.buildingId).filter(Boolean));
    Object.assign(db, fresh, {
      profiles: [...fresh.profiles, ...realUsers],
      accounts: db.accounts,
      sessions: db.sessions,
      walletTxns: [...fresh.walletTxns, ...db.walletTxns.filter((t) => realIds.has(t.userId))],
      buildings: [...fresh.buildings, ...db.buildings.filter((b) => ownBuildingIds.has(b.id))],
      properties: [...fresh.properties, ...ownProperties],
      listings: [...fresh.listings, ...ownListings.map((l) => ({ ...l, status: "active" as const }))],
    });
  });
}

export function nextLedgerId(db: DB) {
  return db.ledger.reduce((m, e) => Math.max(m, e.id), 0) + 1;
}

export function newId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}
