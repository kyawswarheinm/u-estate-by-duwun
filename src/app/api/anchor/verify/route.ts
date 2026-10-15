import { anchorMessage, headHash, parseAnchorMessage } from "@/lib/ledger-hash";
import { readAnchor } from "@/lib/avalanche";
import { rateLimit } from "@/lib/ratelimit";
import { readDb } from "@/lib/store";

// A1 verification: recompute the fingerprint from today's ledger and compare it with what is on Avalanche.
// Anyone can repeat this with the explorer link: the transaction data is readable UTF-8 text.
export async function GET(req: Request) {
  const limited = rateLimit(req, "anchor-verify", 20);
  if (limited) return limited;
  const id = new URL(req.url).searchParams.get("id");
  const db = await readDb();
  const anchor = id ? db.anchors.find((a) => a.id === id) : db.anchors.at(-1);
  if (!anchor) return Response.json({ code: "NOT_FOUND", message: "No anchor yet." }, { status: 404 });

  const now = headHash(db.ledger, anchor.upToEntryId);
  const recomputed = anchorMessage(anchor.upToEntryId, now.count, now.hash);
  const ledgerUnchanged = now.hash === anchor.headHash && now.count === anchor.entryCount;

  let chain: { matches: boolean; message: string | null; blockNumber: number | null; error?: string };
  try {
    const onChain = await readAnchor(anchor.txHash);
    const parsed = parseAnchorMessage(onChain.message);
    chain = { matches: onChain.message === recomputed && parsed?.hash === now.hash, message: onChain.message, blockNumber: onChain.blockNumber };
  } catch (e) {
    chain = { matches: false, message: null, blockNumber: null, error: e instanceof Error ? e.message.split("\n")[0] : "unreachable" };
  }

  return Response.json({
    anchor,
    recomputedHash: now.hash,
    ledgerUnchanged,
    chain,
    verdict: ledgerUnchanged && chain.matches ? "verified" : chain.error ? "chain_unreachable" : "mismatch",
  });
}
