import { randomUUID } from "node:crypto";
import { getPreferences } from "@/i18n/server";
import { Text } from "@/i18n/Text";
import { Money } from "@/components/Money";
import Link from "next/link";
import { readDb } from "@/lib/store";
import { requireUser } from "@/lib/session";
import { canTopUp, WALLET, walletSummary } from "@/lib/wallet";
import { topUpWallet } from "@/app/account/actions";
import { WalletSettingsForm } from "@/components/AccountForms";

export const metadata = { title: "Wallet | U-Estate" };

export default async function WalletPage() {
  const { locale } = await getPreferences();
  const [db, me] = await Promise.all([readDb(), requireUser("/account/wallet")]);
  const w = walletSummary(db, me.id);
  const profile = db.profiles.find((p) => p.id === me.id)!;
  const rows = [
    ...db.walletTxns.filter((t) => t.userId === me.id).map((t) => ({ at: t.createdAt, label: t.note, amount: t.amountThb, href: null as string | null })),
    ...w.commitments.map((c) => {
      const g = db.cobuyGroups.find((x) => x.id === c.groupId)!;
      const l = db.listings.find((x) => x.id === g.listingId)!;
      const p = db.properties.find((x) => x.id === l.propertyId)!;
      return { at: c.joinedAt, label: `Committed to co-buy: ${p.title} (${c.lane === "lender" ? `lender at ${c.interestRatePct}%` : "co-owner"})`, amount: -c.amountThb, href: `/cobuy/${g.id}` };
    }),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="page-title"><Text message="Wallet" /></h1>
        <p className="mt-1 max-w-2xl text-deep">
          <Text message="Test money for the demo: use it to commit to co-buy groups." /> <strong><Text message="No real money, bank account or crypto" /></strong> <Text message="is connected." />
        </p>
      </header>

      <section aria-label="Balance" className="rounded-[14px] bg-midnight p-6 text-ice">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-silver"><Text message="Available test money" /></p>
            <p className="text-4xl font-bold tracking-tight sm:text-5xl"><Money amount={w.availableThb} /></p>
          </div>
          <form action={topUpWallet}>
            <input type="hidden" name="requestId" value={randomUUID()} />
            <button type="submit" disabled={!canTopUp(w.fundedThb)} className="btn btn-on-dark"><Text message="Add" /> <Money amount={WALLET.topUpThb} /> <Text message="test money" /></button>
            {!canTopUp(w.fundedThb) && <p className="mt-2 text-sm text-silver"><Text message="Demo limit of" /> <Money amount={WALLET.maxTotalThb} /> <Text message="reached." /></p>}
          </form>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-white/15 pt-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-silver"><Text message="Committed to co-buy groups" /></dt>
            <dd className="text-xl font-semibold"><Money amount={w.committedThb} /></dd>
          </div>
          <div>
            <dt className="text-sm text-silver"><Text message="Total test money received" /></dt>
            <dd className="text-xl font-semibold"><Money amount={w.fundedThb} /></dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="activity-title" className="panel p-5">
        <h2 id="activity-title" className="text-xl font-bold"><Text message="Activity" /></h2>
        {rows.length === 0 ? (
          <p className="mt-2 text-deep"><Text message="No activity yet." /></p>
        ) : (
          <div className="overflow-x-auto">
            <table className="mt-3 w-full min-w-[520px] text-start text-sm">
              <caption className="sr-only"><Text message="Wallet activity, newest first" /></caption>
              <thead><tr className="border-b border-silver text-deep"><th scope="col" className="py-2 text-start"><Text message="Date" /></th><th scope="col" className="text-start"><Text message="What" /></th><th scope="col" className="text-end"><Text message="Amount" /></th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-ice">
                    <td className="py-2 whitespace-nowrap">{new Date(r.at).toLocaleDateString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" })}</td>
                    <td>{r.href ? <Link href={r.href} className="underline">{r.label}</Link> : r.label}</td>
                    <td className={`text-end font-semibold ${r.amount < 0 ? "text-deep" : "text-teal"}`}>{r.amount < 0 ? "−" : "+"}<Money amount={Math.abs(r.amount)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-deep"><Text message="Every commitment also appears on the public" /> <Link href="/ledger" className="underline"><Text message="transparency ledger" /></Link>.</p>
      </section>

      <section aria-labelledby="wallet-settings-title" className="panel p-5">
        <h2 id="wallet-settings-title" className="text-xl font-bold"><Text message="Wallet settings" /></h2>
        <div className="mt-4"><WalletSettingsForm payoutMethod={profile.payoutMethod ?? "escrow_bank_transfer"} maxCommitThb={profile.maxCommitThb} /></div>
      </section>

      <section aria-labelledby="crypto-title" className="rounded-[14px] border border-dashed border-silver p-5">
        <h2 id="crypto-title" className="text-lg font-bold"><Text message="Planning to sell crypto for a deposit?" /></h2>
        <p className="mt-1 text-deep"><Text message="U-Estate never accepts crypto. Before you sell, check upcoming token unlocks with the Tokenomist check in any co-buy group or offer room." /></p>
      </section>
    </div>
  );
}
