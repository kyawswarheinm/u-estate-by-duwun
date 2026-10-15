"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LedgerAnchor } from "@/lib/types";

type Verify = { verdict: "verified" | "mismatch" | "chain_unreachable"; ledgerUnchanged: boolean; recomputedHash: string; chain: { matches: boolean; message: string | null; blockNumber: number | null; error?: string } };

// A1: publish the ledger fingerprint on Avalanche Fuji, and let anyone verify it.
export function AnchorPanel({ latest, configured, headHash, entryCount, unanchored }: {
  latest: LedgerAnchor | null; configured: boolean; headHash: string; entryCount: number; unanchored: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "anchor" | "verify">("");
  const [status, setStatus] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);

  async function anchor() {
    setBusy("anchor");
    setStatus("Publishing to Avalanche Fuji… (about 2–5 seconds)");
    try {
      const r = await fetch("/api/anchor", { method: "POST" });
      const j = await r.json();
      setStatus(r.ok ? "Published. The fingerprint is now on Avalanche." : j.message);
      if (r.ok) router.refresh();
    } catch {
      setStatus("Could not reach the server.");
    } finally {
      setBusy("");
    }
  }

  async function check() {
    setBusy("verify");
    setStatus("Recomputing the fingerprint and reading it back from Avalanche…");
    try {
      const r = await fetch("/api/anchor/verify", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.message);
      setVerify(j as Verify);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section aria-labelledby="anchor-title" className="rounded-xl border border-line p-5">
      <h2 id="anchor-title" className="text-xl font-bold">Tamper check on Avalanche</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        Every entry is chained by a SHA-256 fingerprint. We publish the latest fingerprint on the public Avalanche Fuji test network,
        so nobody (including U-Estate) can quietly edit old records. Only the fingerprint goes on-chain: no names, no money, no tokens.
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-soft">Current fingerprint ({entryCount} entr{entryCount === 1 ? "y" : "ies"})</dt><dd className="break-all font-mono">{headHash.slice(0, 16)}…</dd></div>
        <div>
          <dt className="text-ink-soft">Last published</dt>
          <dd>
            {latest ? (
              <>
                entries 1–{latest.upToEntryId}, {new Date(latest.createdAt).toLocaleString("en-GB")}{" "}
                <a href={latest.explorerUrl} target="_blank" rel="noreferrer" className="font-semibold underline">view on explorer ↗</a>
              </>
            ) : "Not yet"}
          </dd>
        </div>
        <div><dt className="text-ink-soft">Not yet published</dt><dd>{unanchored} entr{unanchored === 1 ? "y" : "ies"}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={anchor} disabled={!!busy || entryCount === 0} className="rounded-lg bg-ink px-4 py-3 font-semibold text-paper disabled:opacity-60">
          Publish fingerprint to Avalanche
        </button>
        <button type="button" onClick={check} disabled={!!busy || !latest} className="rounded-lg border border-ink px-4 py-3 font-semibold disabled:opacity-60">
          Verify last fingerprint
        </button>
      </div>
      {!configured && <p className="mt-2 text-sm text-amber">Avalanche is not connected on this server (AVALANCHE_PRIVATE_KEY). The fingerprint is still computed and shown.</p>}
      <p role="status" aria-live="polite" className="mt-2 text-sm">{status}</p>
      {verify && (
        <div className={`mt-2 rounded-lg p-3 text-sm ${verify.verdict === "verified" ? "bg-teal-soft text-teal" : "bg-red-soft text-red"}`}>
          <p className="font-semibold">
            {verify.verdict === "verified" ? "✓ Verified: today's records match the fingerprint on Avalanche." : verify.verdict === "mismatch" ? "✗ Mismatch: records changed after publishing." : "? Could not reach Avalanche to compare."}
          </p>
          <p>Ledger unchanged since publishing: {verify.ledgerUnchanged ? "yes" : "no"} · On-chain text matches: {verify.chain.matches ? "yes" : "no"}{verify.chain.blockNumber ? ` · block ${verify.chain.blockNumber}` : ""}</p>
          {verify.chain.message && <p className="mt-1 break-all font-mono text-xs text-ink">{verify.chain.message}</p>}
        </div>
      )}
    </section>
  );
}
