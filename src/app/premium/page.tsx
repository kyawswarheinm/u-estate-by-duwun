import Link from "next/link";
import { formatMoneyRef } from "@/i18n";
import { getPreferences, getTranslations } from "@/i18n/server";
import { readDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { availableThb, COINVEST } from "@/lib/coinvest/engine";
import { UpgradeForm } from "@/components/coinvest/UpgradeForm";
import { UPalPageContext } from "@/components/upal/UPalProvider";

export const metadata = { title: "Premium" };

// Standard → Premium (and Guest → Premium after sign-up). The fee is test money; the upgrade runs on the server.
export default async function PremiumPage() {
  const [t, { locale, currency }, db, me] = await Promise.all([getTranslations(), getPreferences(), readDb(), currentUser()]);
  const money = (v: number) => formatMoneyRef(v, locale, currency);
  const tier = me ? (me.premium ? "premium" : "standard") : "guest";
  const features: [string, boolean, boolean][] = [
    [t("Browse listings, the market map and forecasts"), true, true],
    [t("Ask U-Pal by text or voice"), true, true],
    [t("Test-money wallet, offers and co-buy (U-topia members)"), true, true],
    [t("Co-Invest: buy and sell property units"), false, true],
    [t("Portfolio analytics and valuation charts"), false, true],
    [t("Ownership graphs and full trade history"), false, true],
  ];
  return (
    <article className="grid gap-8">
      <UPalPageContext facts={{ user_tier: tier, premium_fee_thb: COINVEST.premiumFeeThb, money: "test money only" }} />
      <header className="grid gap-3">
        <p className="eyebrow text-deep">{t("Premium")}</p>
        <h1 className="page-title">{t("Upgrade to Premium")}</h1>
        <p className="lead max-w-2xl">{t("Premium opens Co-Invest: own units of a property with other members, with analytics and a live ownership graph. In this demo the fee is paid with test money.")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="plans" className="surface-card overflow-hidden">
          <h2 id="plans" className="sr-only">{t("Compare plans")}</h2>
          <div role="region" aria-label={t("Compare plans")} tabIndex={0} className="table-scroll">
            <table className="w-full text-sm">
              <thead className="bg-ice"><tr><th scope="col" className="p-4 text-start">{t("Feature")}</th><th scope="col" className="p-4 text-center">{t("Standard")}</th><th scope="col" className="p-4 text-center">{t("Premium")}</th></tr></thead>
              <tbody>
                {features.map(([name, standard, premium]) => (
                  <tr key={name} className="border-t border-silver">
                    <th scope="row" className="p-4 text-start font-medium">{name}</th>
                    <td className="p-4 text-center">{standard ? <span aria-label={t("Included")}>✓</span> : <span aria-label={t("Not included")} className="text-deep">—</span>}</td>
                    <td className="p-4 text-center font-semibold text-teal">{premium ? <span aria-label={t("Included")}>✓</span> : <span aria-label={t("Not included")} className="text-deep">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="upgrade" className="surface-card grid content-start gap-4 p-6">
          <h2 id="upgrade" className="section-title">{t("Premium")}</h2>
          <p className="price">{money(COINVEST.premiumFeeThb)}</p>
          <p className="caption">{t("One-time demo fee in test money. No card, bank or crypto is ever asked for.")}</p>
          {tier === "guest" && (
            <div className="grid gap-2">
              <p className="text-deep">{t("Create a free account first: you get 5,000,000 THB of test money, then upgrade here.")}</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/signup?next=/premium" className="btn btn-primary">{t("Create account")}</Link>
                <Link href="/signin?next=/premium" className="btn btn-secondary">{t("Sign in")}</Link>
              </div>
            </div>
          )}
          {tier === "standard" && (
            <>
              <p className="text-sm text-deep">{t("Test money available: {amount}", { amount: money(availableThb(db, me!.id)) })}</p>
              <UpgradeForm feeThb={COINVEST.premiumFeeThb} availableThb={availableThb(db, me!.id)} />
            </>
          )}
          {tier === "premium" && (
            <div className="grid gap-2">
              <p className="font-semibold text-teal">✓ {t("You are a Premium member since {date}.", { date: me!.premiumSince ? new Date(me!.premiumSince).toLocaleDateString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" }) : "—" })}</p>
              <Link href="/coinvest" className="btn btn-primary justify-self-start">{t("Open Co-Invest")}</Link>
            </div>
          )}
        </section>
      </div>
    </article>
  );
}
