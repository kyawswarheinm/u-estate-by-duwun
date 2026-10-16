"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LedgerAnchor } from "@/lib/types";
import type { LedgerProviderId } from "@/lib/ledger/status";
import { useI18n } from "@/i18n/provider";

type Verify = { verdict: "verified" | "mismatch" | "chain_unreachable"; ledgerUnchanged: boolean; recomputedHash: string; chain: { reachable: boolean; matches: boolean; message: string | null; blockNumber: number | null } };

// A1: the ledger fingerprint and its anchoring on Avalanche Fuji. The same panel serves both ledger providers:
// with the network available a fingerprint can be published and verified; without it, records stay in the
// U-Estate ledger (status "Recorded") and nothing claims to be on-chain.
export function AnchorPanel({ latest, provider, canPublish, headHash, entryCount, unanchored }: {
  latest: LedgerAnchor | null; provider: LedgerProviderId; canPublish: boolean; headHash: string; entryCount: number; unanchored: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "anchor" | "verify">("");
  const { t, locale } = useI18n();
  const [status, setStatus] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);
  const online = provider === "avalanche";

  async function anchor() {
    setBusy("anchor");
    setStatus(t("Publishing to Avalanche Fuji… (about 2–5 seconds)"));
    try {
      const r = await fetch("/api/anchor", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      setStatus(r.ok ? t("Published. The fingerprint is now on Avalanche.") : typeof j.message === "string" ? j.message : t("Could not publish right now. Try again later."));
      if (r.ok) router.refresh();
    } catch {
      setStatus(t("Could not reach the server."));
    } finally {
      setBusy("");
    }
  }

  async function check() {
    setBusy("verify");
    setStatus(t("Recomputing the fingerprint and reading it back from Avalanche…"));
    try {
      const r = await fetch("/api/anchor/verify", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(typeof j.message === "string" ? j.message : "");
      setVerify(j as Verify);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error && e.message ? e.message : t("Verification failed."));
    } finally {
      setBusy("");
    }
  }

  return (
    <section aria-labelledby="anchor-title" className="surface-card grid gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 id="anchor-title" className="section-title">{t("Tamper check on Avalanche")}</h2>
          <p className="mt-1 text-sm text-deep">
            {t("Every entry is chained by a SHA-256 fingerprint. We publish the latest fingerprint on the public Avalanche Fuji test network, so nobody (including U-Estate) can quietly edit old records. Only the fingerprint goes on-chain: no names, no money, no tokens.")}
          </p>
        </div>
        <span className={`pill ${online ? "bg-teal-soft text-teal" : "bg-ice text-deep"}`}>
          <span aria-hidden="true">{online ? "●" : "○"}</span> {online ? t("Network anchoring available") : t("Records kept in the U-Estate ledger")}
        </span>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="stat-tile"><dt>{t("Current fingerprint")}</dt><dd className="break-all font-mono">{headHash.slice(0, 16)}…</dd><dd className="caption">{t("Entries: {count}", { count: entryCount })}</dd></div>
        <div className="stat-tile">
          <dt>{t("Last published")}</dt>
          <dd>
            {latest ? (
              <>
                {t("Entries 1–{to}, {date}", { to: latest.upToEntryId, date: new Date(latest.createdAt).toLocaleString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" }) })}{" "}
                <a href={latest.explorerUrl} target="_blank" rel="noreferrer" className="font-semibold underline">{t("view on explorer ↗")}</a>
              </>
            ) : t("Not yet")}
          </dd>
        </div>
        <div className="stat-tile"><dt>{t("Not yet published")}</dt><dd>{t("Entries: {count}", { count: unanchored })}</dd></div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {canPublish && (
          <button type="button" onClick={anchor} disabled={!!busy || entryCount === 0 || unanchored === 0} className="btn btn-primary">
            {t("Publish fingerprint to Avalanche")}
          </button>
        )}
        <button type="button" onClick={check} disabled={!!busy || !latest} className="btn btn-secondary">
          {t("Verify last fingerprint")}
        </button>
      </div>
      {!online && unanchored > 0 && <p className="caption">{t("New records are fingerprinted here and will be covered by the next published fingerprint.")}</p>}
      <p role="status" aria-live="polite" className="text-sm empty:hidden">{status}</p>
      {verify && (
        <div className={`rounded-xl p-3 text-sm ${verify.verdict === "verified" ? "bg-teal-soft text-teal" : verify.verdict === "mismatch" ? "bg-red-soft text-red" : "bg-ice text-deep"}`}>
          <p className="font-semibold">
            {verify.verdict === "verified" ? t("✓ Verified: today's records match the fingerprint on Avalanche.") : verify.verdict === "mismatch" ? t("✗ Mismatch: records changed after publishing.") : t("? Could not reach Avalanche to compare.")}
          </p>
          <p>{t("Ledger unchanged since publishing: {ledger}", { ledger: verify.ledgerUnchanged ? t("yes") : t("no") })}{verify.chain.reachable ? ` · ${t("On-chain text matches: {chain}", { chain: verify.chain.matches ? t("yes") : t("no") })}` : ""}{verify.chain.blockNumber ? ` · ${t("block {number}", { number: verify.chain.blockNumber })}` : ""}</p>
          {verify.chain.message && <p className="mt-1 break-all font-mono text-xs text-ink">{verify.chain.message}</p>}
        </div>
      )}
    </section>
  );
}
