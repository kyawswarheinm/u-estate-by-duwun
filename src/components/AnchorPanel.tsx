"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LedgerAnchor } from "@/lib/types";
import { useI18n } from "@/i18n/provider";

type Verify = { verdict: "verified" | "mismatch" | "chain_unreachable"; ledgerUnchanged: boolean; recomputedHash: string; chain: { matches: boolean; message: string | null; blockNumber: number | null; error?: string } };

// A1: publish the ledger fingerprint on Avalanche Fuji, and let anyone verify it.
export function AnchorPanel({ latest, configured, headHash, entryCount, unanchored }: {
  latest: LedgerAnchor | null; configured: boolean; headHash: string; entryCount: number; unanchored: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "anchor" | "verify">("");
  const { t, locale } = useI18n();
  const [status, setStatus] = useState("");
  const [verify, setVerify] = useState<Verify | null>(null);

  async function anchor() {
    setBusy("anchor");
    setStatus(t("Publishing to Avalanche Fuji… (about 2–5 seconds)"));
    try {
      const r = await fetch("/api/anchor", { method: "POST" });
      const j = await r.json();
      setStatus(r.ok ? t("Published. The fingerprint is now on Avalanche.") : j.message);
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
      if (!r.ok) throw new Error(j.message);
      setVerify(j as Verify);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : t("Verification failed."));
    } finally {
      setBusy("");
    }
  }

  return (
    <section aria-labelledby="anchor-title" className="rounded-xl border border-line p-5">
      <h2 id="anchor-title" className="text-xl font-bold">{t("Tamper check on Avalanche")}</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        {t("Every entry is chained by a SHA-256 fingerprint. We publish the latest fingerprint on the public Avalanche Fuji test network, so nobody (including U-Estate) can quietly edit old records. Only the fingerprint goes on-chain: no names, no money, no tokens.")}
      </p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-ink-soft">{t("Current fingerprint")}</dt><dd className="break-all font-mono">{headHash.slice(0, 16)}…</dd><dd className="text-ink-soft">{t("Entries: {count}", { count: entryCount })}</dd></div>
        <div>
          <dt className="text-ink-soft">{t("Last published")}</dt>
          <dd>
            {latest ? (
              <>
                {t("Entries 1–{to}, {date}", { to: latest.upToEntryId, date: new Date(latest.createdAt).toLocaleString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" }) })}{" "}
                <a href={latest.explorerUrl} target="_blank" rel="noreferrer" className="font-semibold underline">{t("view on explorer ↗")}</a>
              </>
            ) : t("Not yet")}
          </dd>
        </div>
        <div><dt className="text-ink-soft">{t("Not yet published")}</dt><dd>{t("Entries: {count}", { count: unanchored })}</dd></div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={anchor} disabled={!!busy || entryCount === 0} className="rounded-lg bg-ink px-4 py-3 font-semibold text-paper disabled:opacity-60">
          {t("Publish fingerprint to Avalanche")}
        </button>
        <button type="button" onClick={check} disabled={!!busy || !latest} className="rounded-lg border border-ink px-4 py-3 font-semibold disabled:opacity-60">
          {t("Verify last fingerprint")}
        </button>
      </div>
      {!configured && <p className="mt-2 text-sm text-amber">{t("Avalanche is not connected on this server (AVALANCHE_PRIVATE_KEY). The fingerprint is still computed and shown.")}</p>}
      <p role="status" aria-live="polite" className="mt-2 text-sm">{status}</p>
      {verify && (
        <div className={`mt-2 rounded-lg p-3 text-sm ${verify.verdict === "verified" ? "bg-teal-soft text-teal" : "bg-red-soft text-red"}`}>
          <p className="font-semibold">
            {verify.verdict === "verified" ? t("✓ Verified: today's records match the fingerprint on Avalanche.") : verify.verdict === "mismatch" ? t("✗ Mismatch: records changed after publishing.") : t("? Could not reach Avalanche to compare.")}
          </p>
          <p>{t("Ledger unchanged since publishing: {ledger} · On-chain text matches: {chain}", { ledger: verify.ledgerUnchanged ? t("yes") : t("no"), chain: verify.chain.matches ? t("yes") : t("no") })}{verify.chain.blockNumber ? ` · ${t("block {number}", { number: verify.chain.blockNumber })}` : ""}</p>
          {verify.chain.message && <p className="mt-1 break-all font-mono text-xs text-ink">{verify.chain.message}</p>}
        </div>
      )}
    </section>
  );
}
