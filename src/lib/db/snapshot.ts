import "server-only";
import { supabaseServer } from "@/lib/supabase/server";
import type { DB, Profile } from "@/lib/types";

// Compatibility view for existing server-rendered pages. ALL reads use the user's
// session: in particular offers, documents, wallet and settings remain RLS-filtered.
// Never cache this across requests and never substitute an admin client.
type Row = Record<string, unknown>;
export function camelRow(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null)
    .map(([key, value]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value]));
}
export function profileRow(row: Row): Profile {
  return { ...camelRow(row), name: row.display_name } as unknown as Profile;
}

export async function readSupabaseDb(): Promise<DB> {
  const client = await supabaseServer();
  const tables = {
    profiles: "profiles", buildings: "buildings", properties: "properties", listings: "listings",
    documentChecks: "documents", offerRounds: "offer_rounds", offers: "offers", cobuyGroups: "cobuy_groups",
    cobuyParticipants: "cobuy_participants", ledger: "ledger_entries", anchors: "ledger_anchors",
    walletTxns: "wallet_transactions", settings: "profile_settings",
    coinvestOfferings: "coinvest_offerings", coinvestHoldings: "coinvest_holdings", coinvestTrades: "coinvest_trades",
  };
  // Guests have no access to who holds Co-Invest units (RLS + grants): those reads come back empty for them.
  const signedInOnly = new Set(["coinvest_holdings", "coinvest_trades"]);
  // Until migration 0700 is applied to a hosted project, its tables do not exist: the rest of the app keeps working
  // and Co-Invest shows no offerings (logged once per request on the server, never shown to users).
  const optional = new Set(["coinvest_offerings", "coinvest_holdings", "coinvest_trades"]);
  const entries = await Promise.all(Object.entries(tables).map(async ([key, table]) => {
    const rows: Row[] = [];
    const order = table === "profile_settings" ? "user_id" : table === "coinvest_holdings" ? "offering_id" : "id";
    for (let from = 0; ; from += 500) {
      const { data, error } = await client.from(table).select("*").order(order).range(from, from + 499);
      if (error && signedInOnly.has(table) && error.code === "42501") break;
      if (error && optional.has(table) && (error.code === "PGRST205" || error.code === "42P01")) {
        console.warn(`[db] ${table} is missing: apply supabase/migrations/20261016000700_premium_coinvest.sql`);
        break;
      }
      if (error) throw new Error(`Database read failed: ${table} (${error.code})`);
      rows.push(...data);
      if (data.length < 500) break;
    }
    return [key, rows] as const;
  }));
  const raw = Object.fromEntries(entries);
  const mapped = Object.fromEntries(entries.map(([key, rows]) => [key, rows.map(camelRow)]));
  mapped.profiles = raw.profiles.map((row) => ({ ...profileRow(row),
    ...camelRow(raw.settings.find((s) => s.user_id === row.id) ?? {}),
  }));
  mapped.properties = mapped.properties.map((p) => ({ ...p, officialAppraisalThb: p.officialAppraisalThb ?? 0,
    appraisalSource: p.appraisalSource ?? "Not provided yet", appraisalDate: p.appraisalDate ?? "", deedType: p.deedType ?? "Unknown" }));
  mapped.offerRounds = await Promise.all(raw.offerRounds.map(async (row) => {
    const { data, error } = await client.rpc("offer_count", { p_round: row.id });
    if (error) throw new Error("Offer count unavailable");
    const summary = (row.ai_summary ?? {}) as Record<string, string>;
    return { ...camelRow(row), aiSummary: summary.en, offerCount: data };
  }));
  mapped.documentChecks = mapped.documentChecks.map((d) => ({ ...d, fileName: String(d.storagePath).split("/").at(-1), humanReview: "pending" }));
  // Freeze the public fingerprint shape; future database metadata must not change old hashes.
  mapped.ledger = mapped.ledger.map((e) => ({ id: e.id, createdAt: e.createdAt, userId: e.userId,
    entryType: e.entryType, amountThb: e.amountThb, listingId: e.listingId,
    groupId: e.groupId, details: e.details, isSimulated: e.isSimulated }));
  mapped.anchors = mapped.anchors.map((a) => ({ ...a, network: "Avalanche Fuji C-Chain (testnet)" }));
  // numeric columns: PostgREST returns them as JSON numbers, but keep money arithmetic safe if a string slips through
  const num = (v: unknown) => (v === undefined ? v : Number(v));
  mapped.walletTxns = mapped.walletTxns.map((w) => ({ ...w, amountThb: num(w.amountThb) }));
  mapped.coinvestOfferings = mapped.coinvestOfferings.map((o) => ({ ...o, unitParThb: num(o.unitParThb), targetThb: num(o.targetThb), baseValueThb: num(o.baseValueThb), currentValueThb: num(o.currentValueThb), grossYieldPct: num(o.grossYieldPct) }));
  mapped.coinvestHoldings = mapped.coinvestHoldings.map((h) => ({ ...h, costThb: num(h.costThb), areaSqmAttributed: num(h.areaSqmAttributed) }));
  mapped.coinvestTrades = mapped.coinvestTrades.map((t) => ({ ...t, unitPriceThb: num(t.unitPriceThb), amountThb: num(t.amountThb) }));
  mapped.anchors.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  // Auth owns credentials. There are no synthetic credential records in this view.
  return { ...mapped, accounts: [], sessions: [] } as unknown as DB;
}
