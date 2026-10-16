import { Label, Text } from "@/i18n/Text";
import { getPreferences } from "@/i18n/server";
import { readDb } from "@/lib/store";
import { thb } from "@/lib/rules";
import { hashChain, headHash } from "@/lib/ledger-hash";
import { avalancheConfigured } from "@/lib/avalanche";
import { AnchorPanel } from "@/components/AnchorPanel";

const LABEL = {
  commit_test_funds: "Commitment (test money)",
  co_owner_share: "Co-owner share",
  loan: "Registered loan",
  offer_submitted: "Sealed offer",
  offer_accepted: "Offer accepted",
  document_checked: "Document check",
} as const;

export default async function LedgerPage() {
  const { locale } = await getPreferences();
  const db = await readDb();
  const rows = [...db.ledger].reverse();
  const who = (id: string) => db.profiles.find((p) => p.id === id)?.name ?? id;
  const hashes = new Map(hashChain(db.ledger).map((h) => [h.id, h.hash]));
  const lastId = db.ledger.reduce((m, e) => Math.max(m, e.id), 0);
  const head = headHash(db.ledger, lastId);
  const latest = db.anchors.at(-1) ?? null;
  const anchoredUpTo = latest?.upToEntryId ?? 0;

  return (
    <article className="grid gap-4">
      <header>
        <h1 className="text-3xl font-bold"><Text message="ledgerTitle" /></h1>
        <p className="mt-1 max-w-3xl text-ink-soft">
          <Text message="What you see here is exactly what is (or would be) registered: co-owner shares, loans and accepted offers. There are no hidden owners and no side records. Entries can only be added, never edited. In this demo every entry is simulated and uses test money." />
        </p>
      </header>

      <p className="rounded-2xl bg-ice p-5 text-sm text-muted"><Text message="ledgerLegal" /></p>
      <AnchorPanel latest={latest} configured={avalancheConfigured()} headHash={head.hash} entryCount={head.count} unanchored={db.ledger.filter((e) => e.id > anchoredUpTo).length} />

      {rows.length === 0 ? (
        <p className="rounded-lg bg-mist p-4"><Text message="No activity yet. Check a deed, make an offer or join a co-buy group." /></p>
      ) : (
        <ol className="ledger-timeline">
          {rows.map(e => <li key={e.id} className="ledger-event">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold"><Label>{LABEL[e.entryType]}</Label></h2><time className="text-xs text-muted" dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" })}</time></div>
            <p className="mt-3 text-sm text-muted">{who(e.userId)} {e.amountThb ? thb(e.amountThb) : ""}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="pill bg-ice"><Text message={e.id <= anchoredUpTo ? "publishedRecord" : "localRecord"} /></span>{e.isSimulated && <span className="pill bg-amber-soft text-amber"><Text message="simulated" /></span>}</div>
            <details className="mt-5"><summary><Text message="recordDetails" /></summary><p className="mt-3 text-sm">{e.details}</p><p className="mt-3 break-all font-mono text-xs text-muted">#{e.id} / {hashes.get(e.id)}</p></details>
          </li>)}
        </ol>
      )}
    </article>
  );
}
