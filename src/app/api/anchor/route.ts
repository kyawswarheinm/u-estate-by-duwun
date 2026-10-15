import { revalidatePath } from "next/cache";
import { anchorMessage, headHash } from "@/lib/ledger-hash";
import { AVALANCHE_CHAIN_ID, AVALANCHE_NETWORK, avalancheConfigured, explorerTxUrl, publishAnchor } from "@/lib/avalanche";
import { rateLimit } from "@/lib/ratelimit";
import { newId, readDb, updateDb } from "@/lib/store";
import { usesSupabase } from "@/lib/db/runtime";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/session";

// A1: publish the ledger fingerprint on Avalanche Fuji. Demo: a button on /ledger.
// Production: an hourly cron job (Vercel Cron) plus a reviewer-only manual trigger.
export async function POST(req: Request) {
  if (usesSupabase() && !(await currentUser())?.isReviewer) return Response.json({ code: "FORBIDDEN", message: "Only a reviewer can publish a fingerprint." }, { status: 403 });
  const limited = rateLimit(req, "anchor", 3);
  if (limited) return limited;

  const db = await readDb();
  if (db.ledger.length === 0) return Response.json({ code: "NOTHING_TO_ANCHOR", message: "The ledger is empty." }, { status: 409 });
  const upToId = Math.max(...db.ledger.map((e) => e.id));
  const head = headHash(db.ledger, upToId);
  const message = anchorMessage(upToId, head.count, head.hash);
  const last = db.anchors.at(-1);
  if (last && last.upToEntryId === upToId && last.headHash === head.hash) {
    return Response.json({ code: "ALREADY_ANCHORED", message: "No new entries since the last anchor.", anchor: last }, { status: 409 });
  }
  if (!avalancheConfigured()) {
    return Response.json(
      { code: "AVALANCHE_NOT_CONFIGURED", message: "Fingerprint computed but not published: AVALANCHE_PRIVATE_KEY is not set.", headHash: head.hash, upToId, entryCount: head.count, chainMessage: message },
      { status: 501 },
    );
  }

  try {
    const tx = await publishAnchor(message);
    if (usesSupabase()) {
      const { data, error } = await supabaseAdmin().from("ledger_anchors").insert({
        up_to_entry_id: upToId, entry_count: head.count, head_hash: head.hash, message,
        chain_id: AVALANCHE_CHAIN_ID, tx_hash: tx.txHash, explorer_url: explorerTxUrl(tx.txHash),
      }).select("id").single();
      if (error) return Response.json({ code: "PERSISTENCE", message: "Published on Fuji, but saving the anchor failed. Keep the transaction reference for recovery.", txHash: tx.txHash }, { status: 502 });
      revalidatePath("/ledger");
      const snapshot = await readDb();
      return Response.json({ anchor: snapshot.anchors.find((a) => a.id === data.id) });
    }
    const anchor = await updateDb((d) => {
      const a = {
        id: newId("anc"), upToEntryId: upToId, entryCount: head.count, headHash: head.hash, message,
        chainId: AVALANCHE_CHAIN_ID, network: AVALANCHE_NETWORK, txHash: tx.txHash, explorerUrl: explorerTxUrl(tx.txHash),
        createdAt: new Date().toISOString(),
      };
      d.anchors.push(a);
      return a;
    });
    revalidatePath("/ledger");
    return Response.json({ anchor });
  } catch (e) {
    const detail = e instanceof Error ? e.message.split("\n")[0] : "unknown error";
    const hint = /insufficient funds|exceeds the balance/i.test(detail) ? " The anchor wallet needs test AVAX from the Fuji faucet." : "";
    return Response.json({ code: "UPSTREAM", message: `Avalanche did not confirm the transaction.${hint}`, detail }, { status: 502 });
  }
}
