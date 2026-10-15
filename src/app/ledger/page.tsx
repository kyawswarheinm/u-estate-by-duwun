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
        <h1 className="text-3xl font-bold"><Text message="Transparency ledger" /></h1>
        <p className="mt-1 max-w-3xl text-ink-soft">
          <Text message="What you see here is exactly what is (or would be) registered: co-owner shares, loans and accepted offers. There are no hidden owners and no side records. Entries can only be added, never edited. In this demo every entry is simulated and uses test money." />
        </p>
      </header>

      <AnchorPanel latest={latest} configured={avalancheConfigured()} headHash={head.hash} entryCount={head.count} unanchored={db.ledger.filter((e) => e.id > anchoredUpTo).length} />

      {rows.length === 0 ? (
        <p className="rounded-lg bg-mist p-4"><Text message="No activity yet. Check a deed, make an offer or join a co-buy group." /></p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-start text-sm">
            <caption className="sr-only"><Text message="All recorded actions, newest first" /></caption>
            <thead><tr className="border-b border-line"><th scope="col" className="py-2">#</th><th scope="col"><Text message="Time" /></th><th scope="col"><Text message="Type" /></th><th scope="col"><Text message="Who" /></th><th scope="col"><Text message="Amount" /></th><th scope="col"><Text message="Details" /></th><th scope="col"><Text message="Fingerprint" /></th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line align-top">
                  <td className="py-2">{e.id}</td>
                  <td>{new Date(e.createdAt).toLocaleString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" })}</td>
                  <td className="font-semibold"><Label>{LABEL[e.entryType]}</Label></td>
                  <td>{who(e.userId)}</td>
                  <td>{e.amountThb ? thb(e.amountThb) : "—"}</td>
                  <td>{e.details}{e.isSimulated && <span className="ms-2 rounded bg-amber-soft px-1 text-xs text-amber"><Text message="simulated" /></span>}</td>
                  <td className="font-mono text-xs">
                    {hashes.get(e.id)?.slice(0, 10)}…
                    <span className="block font-sans text-ink-soft">{e.id <= anchoredUpTo ? "on Avalanche ✓" : "not yet published"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
