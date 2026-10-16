import { Text } from "@/i18n/Text";
import { formatMoneyRef } from "@/i18n";
import { getPreferences } from "@/i18n/server";
import { readDb } from "@/lib/store";
import { hashChain, headHash } from "@/lib/ledger-hash";
import { ledgerProvider } from "@/lib/ledger/provider";
import { anchorFor, entryStatus, statusCounts } from "@/lib/ledger/status";
import { currentUser } from "@/lib/session";
import { usesSupabase } from "@/lib/db/runtime";
import { AnchorPanel } from "@/components/AnchorPanel";
import { LedgerList, type LedgerRow } from "@/components/LedgerList";
import { UPalPageContext } from "@/components/upal/UPalProvider";
import type { LedgerType } from "@/lib/types";

export const metadata = { title: "Ledger" };

const LABEL: Record<LedgerType, LedgerRow["type"]> = {
  commit_test_funds: "Commitment (test money)",
  co_owner_share: "Co-owner share",
  loan: "Registered loan",
  offer_submitted: "Sealed offer",
  offer_accepted: "Offer accepted",
  document_checked: "Document check",
  share_transfer: "Co-Invest unit transfer",
};

export default async function LedgerPage() {
  const [{ locale, currency }, db, me, provider] = await Promise.all([getPreferences(), readDb(), currentUser(), ledgerProvider()]);
  const who = (id: string) => db.profiles.find((p) => p.id === id)?.name ?? "—";
  const hashes = new Map(hashChain(db.ledger).map((h) => [h.id, h.hash]));
  const lastId = db.ledger.reduce((m, e) => Math.max(m, e.id), 0);
  const head = headHash(db.ledger, lastId);
  const latest = db.anchors.at(-1) ?? null;
  const counts = statusCounts(db.ledger, db.anchors, provider.id);
  const unanchored = counts.pending_anchor + counts.recorded;
  const rows: LedgerRow[] = [...db.ledger].reverse().map((e) => {
    const status = entryStatus(e, db.anchors, provider.id);
    return {
      id: e.id, type: LABEL[e.entryType] ?? "Record", createdAt: e.createdAt, who: who(e.userId),
      amount: e.amountThb ? formatMoneyRef(e.amountThb, locale, currency) : null, details: e.details,
      hash: hashes.get(e.id) ?? "", status, explorerUrl: status === "verified" ? anchorFor(e.id, db.anchors)?.explorerUrl ?? null : null,
      simulated: e.isSimulated,
    };
  });
  // Publishing is a reviewer action on the hosted database; the offline prototype lets anyone try it.
  const mayPublish = provider.canPublish && (!usesSupabase() || Boolean(me?.isReviewer));

  return (
    <article className="grid gap-6">
      <UPalPageContext facts={{
        entries: db.ledger.length, all_entries_simulated: db.ledger.every((e) => e.isSimulated),
        entries_verified_on_avalanche: counts.verified, entries_pending_anchoring: counts.pending_anchor, entries_recorded_only: counts.recorded,
        ledger_provider: provider.id === "avalanche" ? "Avalanche Fuji available" : "U-Estate database ledger (network not available)",
        latest_anchor_tx: latest?.txHash ?? null, money: "test money only",
      }} />
      <header>
        <h1 className="page-title"><Text message="ledgerTitle" /></h1>
        <p className="lead mt-3 max-w-3xl">
          <Text message="What you see here is exactly what is (or would be) registered: co-owner shares, loans and accepted offers. There are no hidden owners and no side records. Entries can only be added, never edited. In this demo every entry is simulated and uses test money." />
        </p>
      </header>

      <p className="rounded-2xl bg-ice p-5 text-sm text-deep"><Text message="ledgerLegal" /></p>
      <AnchorPanel latest={latest} provider={provider.id} canPublish={mayPublish} headHash={head.hash} entryCount={head.count} unanchored={unanchored} />
      <LedgerList rows={rows} />
    </article>
  );
}
