"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { updateDb } from "@/lib/store";
import { usesSupabase } from "@/lib/db/runtime";
import { supabaseServer } from "@/lib/supabase/server";
import { trade, upgradePremium, type TradeCode } from "@/lib/coinvest/engine";

// Premium upgrade and Co-Invest unit trades. The server decides everything: who may trade (premium), the price
// (funding price or index-tracked value), the balance check and the legal lanes. The form sends only which offering,
// how many units and a one-time request id, so a double click or a retry never charges twice.

export type CoinvestState = { ok: boolean; code?: TradeCode | "VALIDATION" | "GENERIC"; units?: number; amountThb?: number; funded?: boolean; at?: string };

const KNOWN: ReadonlySet<string> = new Set<TradeCode>([
  "NOT_SIGNED_IN", "PREMIUM_ONLY", "ALREADY_PREMIUM", "OFFERING_CLOSED", "UNITS_INVALID", "NOT_ENOUGH_UNITS", "POOL_EMPTY",
  "HOLDERS_FULL", "FOREIGN_LAND", "FOREIGN_QUOTA", "BUILDING_MISSING", "WALLET_BALANCE", "REQUEST_MISMATCH",
]);
const codeOf = (message: string | undefined): CoinvestState["code"] => (message && KNOWN.has(message) ? (message as TradeCode) : "GENERIC");

function revalidateMoney() {
  revalidatePath("/coinvest", "layout");
  revalidatePath("/account", "layout");
  revalidatePath("/premium");
  revalidatePath("/ledger");
  revalidatePath("/", "layout"); // header balance and tier
}

const Request = z.uuid();

export async function upgradeToPremium(_prev: CoinvestState, formData: FormData): Promise<CoinvestState> {
  const me = await requireUser("/premium");
  const request = Request.safeParse(formData.get("requestId"));
  if (!request.success) return { ok: false, code: "VALIDATION" };
  if (usesSupabase()) {
    const { error } = await (await supabaseServer()).rpc("premium_upgrade", { p_request: request.data });
    if (error) {
      if (error.message !== "ALREADY_PREMIUM" && !KNOWN.has(error.message)) console.error("[premium] upgrade failed:", error.code);
      return { ok: false, code: codeOf(error.message) };
    }
  } else {
    const r = await updateDb((db) => upgradePremium(db, me.id, request.data));
    if (!r.ok) return { ok: false, code: r.code };
  }
  revalidateMoney();
  return { ok: true, at: new Date().toISOString() };
}

const TradeForm = z.object({
  offeringId: z.string().min(1).max(80),
  side: z.enum(["buy", "sell"]),
  units: z.coerce.number().int().min(1).max(1000),
  requestId: z.uuid(),
});

export async function tradeUnits(_prev: CoinvestState, formData: FormData): Promise<CoinvestState> {
  const me = await requireUser("/coinvest");
  const parsed = TradeForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, code: "UNITS_INVALID" };
  const { offeringId, side, units, requestId } = parsed.data;
  if (!me.premium) return { ok: false, code: "PREMIUM_ONLY" }; // the database checks again; this is not the boundary
  if (usesSupabase()) {
    const { data, error } = await (await supabaseServer()).rpc(side === "buy" ? "coinvest_buy" : "coinvest_sell", { p_offering: offeringId, p_units: units, p_request: requestId });
    if (error) {
      if (!KNOWN.has(error.message)) console.error("[coinvest] trade failed:", error.code);
      return { ok: false, code: codeOf(error.message) };
    }
    revalidateMoney();
    return { ok: true, units, amountThb: Number(data?.amount_thb ?? 0), funded: Boolean(data?.funded), at: new Date().toISOString() };
  }
  const r = await updateDb((db) => trade(db, { userId: me.id, offeringId, side, units, requestId }));
  if (!r.ok) return { ok: false, code: r.code };
  revalidateMoney();
  return { ok: true, units, amountThb: r.trade.amountThb, funded: r.funded, at: r.trade.createdAt };
}
