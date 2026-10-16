import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoneyRef } from "@/i18n";
import { getPreferences, getTranslations } from "@/i18n/server";
import { readDb } from "@/lib/store";
import { requireUser } from "@/lib/session";
import { describeTxn, KIND_LABEL } from "../../describe";
import { PrintButton } from "@/components/PrintButton";

export const metadata = { title: "Receipt | U-Estate" };

// A receipt for one wallet movement. Only the owner can open it (the hosted database returns only their own rows).
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [t, { locale, currency }, db, me] = await Promise.all([getTranslations(), getPreferences(), readDb(), requireUser("/account/wallet")]);
  const x = db.walletTxns.find((w) => w.id === id && w.userId === me.id);
  if (!x) notFound();
  const trade = x.tradeId ? db.coinvestTrades.find((r) => r.id === x.tradeId) : undefined;
  const offering = x.offeringId ? db.coinvestOfferings.find((o) => o.id === x.offeringId) : undefined;
  const money = (v: number) => formatMoneyRef(v, locale, currency);
  const when = new Date(x.createdAt).toLocaleString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok", dateStyle: "long", timeStyle: "short" });
  return (
    <article className="mx-auto grid w-full max-w-xl gap-6">
      <nav aria-label={t("Breadcrumb")}><Link href="/account/wallet" className="text-sm font-semibold text-blue-ink underline">← {t("Wallet")}</Link></nav>
      <section aria-labelledby="receipt-title" className="surface-card grid gap-5 p-6 sm:p-8">
        <header className="grid gap-1">
          <p className="eyebrow text-deep">{t("Receipt")} · {t("test money")}</p>
          <h1 id="receipt-title" className="section-title">{t(KIND_LABEL[x.kind])}</h1>
          <p className={`price ${x.amountThb < 0 ? "" : "text-teal"}`}>{x.amountThb < 0 ? "−" : "+"}{money(Math.abs(x.amountThb))}</p>
        </header>
        <dl className="grid gap-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2 border-b border-silver pb-2"><dt className="text-deep">{t("Receipt number")}</dt><dd className="break-all font-mono">{x.id}</dd></div>
          <div className="flex flex-wrap justify-between gap-2 border-b border-silver pb-2"><dt className="text-deep">{t("Date")}</dt><dd>{when}</dd></div>
          <div className="flex flex-wrap justify-between gap-2 border-b border-silver pb-2"><dt className="text-deep">{t("What")}</dt><dd className="text-end"><bdi>{describeTxn(x, db, t)}</bdi></dd></div>
          {trade && (
            <>
              <div className="flex flex-wrap justify-between gap-2 border-b border-silver pb-2"><dt className="text-deep">{t("Units")}</dt><dd className="tabular-nums">{trade.units}</dd></div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-silver pb-2"><dt className="text-deep">{t("Unit price")}</dt><dd className="tabular-nums">{money(trade.unitPriceThb)}</dd></div>
            </>
          )}
          <div className="flex flex-wrap justify-between gap-2 border-b border-silver pb-2"><dt className="text-deep">{t("Paid with")}</dt><dd>{t("Test-money wallet (demo)")}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-deep">{t("Status")}</dt><dd className="font-semibold text-teal">✓ {t("Completed")}</dd></div>
        </dl>
        <p className="caption">{t("Test money only: no real payment was made and nothing can be withdrawn.")}</p>
        <div className="flex flex-wrap gap-2 print:hidden">
          {offering && <Link href={`/coinvest/${offering.code}`} className="btn btn-secondary">{t("Open the property")}</Link>}
          <PrintButton label={t("Print")} />
        </div>
      </section>
    </article>
  );
}
