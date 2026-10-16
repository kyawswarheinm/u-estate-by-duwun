import { revalidatePath } from "next/cache";
import { AVALANCHE_NETWORK, explorerTxUrl } from "@/lib/avalanche";
import { ledgerProvider, planAnchor, ProviderError, publishFingerprint } from "@/lib/ledger/provider";
import { rateLimit } from "@/lib/ratelimit";
import { newId, readDb, updateDb } from "@/lib/store";
import { usesSupabase } from "@/lib/db/runtime";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/session";

// A1: publish the ledger fingerprint on Avalanche Fuji through the ledger provider. Demo: a button on /ledger.
// Production: an hourly cron job (Vercel Cron) plus a reviewer-only manual trigger.
// Responses carry a code and a plain message only: no configuration names, keys or raw provider errors.
export async function POST(req: Request) {
  if (usesSupabase() && !(await currentUser())?.isReviewer) return Response.json({ code: "FORBIDDEN", message: "Only a reviewer can publish a fingerprint." }, { status: 403 });
  const limited = rateLimit(req, "anchor", 3);
  if (limited) return limited;

  const db = await readDb();
  const plan = planAnchor(db);
  if (!plan.ok) {
    const message = plan.code === "NOTHING_TO_ANCHOR" ? "The ledger is empty." : "No new entries since the last anchor.";
    return Response.json({ code: plan.code, message }, { status: 409 });
  }
  const provider = await ledgerProvider();
  if (!provider.canPublish) {
    return Response.json({ code: "NETWORK_UNAVAILABLE", message: "The public network is not available right now. Every record stays in the U-Estate ledger with its fingerprint and can be anchored later." }, { status: 503 });
  }

  let tx;
  try {
    tx = await publishFingerprint(plan.message);
  } catch (e) {
    if (e instanceof ProviderError) return Response.json({ code: e.code, message: "The network did not confirm the fingerprint. Nothing was changed; try again later." }, { status: 503 });
    throw e;
  }

  if (usesSupabase()) {
    const { data, error } = await supabaseAdmin().from("ledger_anchors").insert({
      up_to_entry_id: plan.upToId, entry_count: plan.count, head_hash: plan.hash, message: plan.message,
      chain_id: tx.chainId, tx_hash: tx.txHash, explorer_url: explorerTxUrl(tx.txHash),
    }).select("id").single();
    if (error) {
      console.error("[ledger] anchor published but not saved:", tx.txHash, error.code);
      return Response.json({ code: "PERSISTENCE", message: "The fingerprint was published, but saving it here failed. A reviewer can recover it from the network record." }, { status: 502 });
    }
    revalidatePath("/ledger");
    const snapshot = await readDb();
    return Response.json({ anchor: snapshot.anchors.find((a) => a.id === data.id) });
  }
  const anchor = await updateDb((d) => {
    const a = {
      id: newId("anc"), upToEntryId: plan.upToId, entryCount: plan.count, headHash: plan.hash, message: plan.message,
      chainId: tx.chainId, network: AVALANCHE_NETWORK, txHash: tx.txHash, explorerUrl: explorerTxUrl(tx.txHash),
      createdAt: new Date().toISOString(),
    };
    d.anchors.push(a);
    return a;
  });
  revalidatePath("/ledger");
  return Response.json({ anchor });
}
