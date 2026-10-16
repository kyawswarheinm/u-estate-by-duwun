import { anchorMessage, headHash, parseAnchorMessage } from "@/lib/ledger-hash";
import { readFingerprint } from "@/lib/ledger/provider";
import { rateLimit } from "@/lib/ratelimit";
import { readDb } from "@/lib/store";

// A1 verification: recompute the fingerprint from today's ledger and compare it with what is on Avalanche.
// Anyone can repeat this with the explorer link: the transaction data is readable UTF-8 text.
// When the network cannot be reached the verdict says so; it never claims a match it could not check.
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

  const onChain = await readFingerprint(anchor.txHash);
  const parsed = onChain ? parseAnchorMessage(onChain.message) : null;
  const chain = onChain
    ? { reachable: true, matches: onChain.message === recomputed && parsed?.hash === now.hash, message: onChain.message, blockNumber: onChain.blockNumber }
    : { reachable: false, matches: false, message: null, blockNumber: null };

  return Response.json({
    anchor,
    recomputedHash: now.hash,
    ledgerUnchanged,
    chain,
    verdict: !chain.reachable ? "chain_unreachable" : ledgerUnchanged && chain.matches ? "verified" : "mismatch",
  });
}
