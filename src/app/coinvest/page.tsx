import Link from "next/link";
import { formatMoneyCompact, formatMoneyRef } from "@/i18n";
import { getPreferences, getTranslations } from "@/i18n/server";
import { readDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { availableThb, COINVEST } from "@/lib/coinvest/engine";
import { offeringViews, portfolio } from "@/lib/coinvest/view";
import { ForecastChart } from "@/components/ForecastChart";
import { OwnershipGraph } from "@/components/coinvest/OwnershipGraph";
import { OfferingGrid } from "@/components/coinvest/OfferingGrid";
import { UPalPageContext } from "@/components/upal/UPalProvider";

export const metadata = { title: "Co-Invest" };

// Co-Invest (D-44): the premium feature. Guests and standard members see a preview (what it is, how it works, the
// live opportunities, benefits and risks); premium members get their portfolio, charts and the ownership graph.
// Access to trading and to other members' holdings is enforced on the server (RPCs + RLS), not by this page.
export default async function CoinvestPage() {
  const [t, { locale, currency }, db, me] = await Promise.all([getTranslations(), getPreferences(), readDb(), currentUser()]);
  const tier = me ? (me.premium ? "premium" : "standard") : "guest";
  const views = offeringViews(db, tier === "premium");
  const money = (v: number) => formatMoneyRef(v, locale, currency);
  const minUnit = Math.min(...views.map((v) => v.unitPriceThb));
  const facts = {
    user_tier: tier, money: "test money only", ownership: "simulated co-ownership units, not legal title",
    offerings: views.map((v) => `${v.offering.code}: ${v.offering.status}, ${v.soldPct}% sold, unit ${Math.round(v.unitPriceThb)} THB`).join("; ").slice(0, 200),
    premium_fee_thb: COINVEST.premiumFeeThb,
  };

  if (tier !== "premium") {
    return (
      <article className="grid gap-10">
        <UPalPageContext facts={facts} />
        <header className="grid gap-4">
          <p className="eyebrow text-deep">{t("Premium")}</p>
          <h1 className="page-title max-w-3xl">{t("Co-Invest: own property together")}</h1>
          <p className="lead max-w-3xl">{t("Buy units of a property with other members, watch its value move with the Bank of Thailand price index, and sell units back when you choose. In this demo everything uses test money.")}</p>
          <div className="flex flex-wrap gap-2">
            {tier === "guest" ? (
              <>
                <Link href="/signup?next=/premium" className="btn btn-primary">{t("Create an account to start")}</Link>
                <Link href="/signin?next=/coinvest" className="btn btn-secondary">{t("Sign in")}</Link>
              </>
            ) : (
              <Link href="/premium" className="btn btn-primary">{t("Upgrade to Premium")}</Link>
            )}
          </div>
        </header>

        <section aria-labelledby="ci-what" className="grid gap-4">
          <h2 id="ci-what" className="section-title">{t("What Co-Invest offers")}</h2>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="stat-tile"><dt>{t("Start small")}</dt><dd className="price">{money(minUnit)}</dd><dd className="caption">{t("Smallest unit price today")}</dd></div>
            <div className="stat-tile"><dt>{t("See who owns what")}</dt><dd className="caption">{t("An ownership graph and table for every property, updated with each trade.")}</dd></div>
            <div className="stat-tile"><dt>{t("Value you can check")}</dt><dd className="caption">{t("Values follow the Bank of Thailand residential price index, with a forecast range.")}</dd></div>
            <div className="stat-tile"><dt>{t("Every trade on the ledger")}</dt><dd className="caption">{t("Each purchase and sale is fingerprinted on the public transparency ledger.")}</dd></div>
          </dl>
        </section>

        <section aria-labelledby="ci-how" className="grid gap-4">
          <h2 id="ci-how" className="section-title">{t("How it works")}</h2>
          <ol className="grid gap-3 md:grid-cols-3">
            {[
              [t("Choose a property"), t("Each property is split into equal units. While it is funding, units cost the funding price.")],
              [t("Buy units with test money"), t("Your wallet pays; the server checks your balance, the units left and the legal rules.")],
              [t("Track and sell back"), t("Once funded, units follow the property's index-tracked value. Sell them back to the U-Estate pool at that value.")],
            ].map(([title, body], i) => (
              <li key={title} className="surface-card grid gap-2 p-5">
                <span className="grid size-9 place-items-center rounded-full bg-midnight text-sm font-bold text-on-strong" aria-hidden="true">{i + 1}</span>
                <h3 className="card-title">{title}</h3>
                <p className="text-sm text-deep">{body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="ci-open" className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="ci-open" className="section-title">{t("Opportunities now")}</h2>
            <p className="caption">{t("Sample properties for the demo. Funding progress is live.")}</p>
          </div>
          <OfferingGrid views={views} locale={locale} currency={currency} premium={false} />
        </section>

        <section aria-labelledby="ci-risk" className="grid gap-4 md:grid-cols-2">
          <div className="surface-card grid content-start gap-3 p-5">
            <h2 id="ci-risk" className="card-title">{t("Benefits")}</h2>
            <ul className="grid gap-2 text-sm text-deep">
              <li>✓ {t("Own part of a property without buying all of it.")}</li>
              <li>✓ {t("Clear prices: the server computes every price from published data.")}</li>
              <li>✓ {t("Simulated rental income shown for each holding.")}</li>
            </ul>
          </div>
          <div className="surface-card grid content-start gap-3 p-5">
            <h2 className="card-title">{t("Risks to understand")}</h2>
            <ul className="grid gap-2 text-sm text-deep">
              <li>! {t("Values can fall. The index-tracked value is an estimate, not an appraisal or a sale price.")}</li>
              <li>! {t("Forecasts are ranges, not guarantees.")}</li>
              <li>! {t("Foreign members can hold units only in condos, within the building's 49% foreign quota (Thai law).")}</li>
              <li>! {t("This is a demo: units are simulated co-ownership, not a legal title or a security, and the money is test money.")}</li>
            </ul>
          </div>
        </section>

        <aside className="band grid gap-3 rounded-[22px] p-6 sm:p-8">
          <h2 className="section-title text-ice">{tier === "guest" ? t("Start with a free account") : t("Upgrade to Premium")}</h2>
          <p className="max-w-2xl text-silver">{t("Premium costs {amount} test money, once. It unlocks Co-Invest trading, portfolio analytics and ownership graphs.", { amount: money(COINVEST.premiumFeeThb) })}</p>
          <div className="flex flex-wrap gap-2">
            <Link href={tier === "guest" ? "/signup?next=/premium" : "/premium"} className="btn btn-on-dark">{tier === "guest" ? t("Create account") : t("Upgrade to Premium")}</Link>
            {tier === "guest" && <Link href="/signin?next=/premium" className="btn btn-ghost-dark">{t("Sign in")}</Link>}
          </div>
        </aside>
      </article>
    );
  }

  // ---------------- premium dashboard ----------------
  const p = portfolio(db, me!.id);
  const wallet = availableThb(db, me!.id);
  const compact = (v: number) => formatMoneyCompact(v, locale, "THB");
  const recent = db.coinvestTrades.filter((x) => x.userId === me!.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const titleOf = (offeringId: string) => {
    const o = db.coinvestOfferings.find((x) => x.id === offeringId);
    return db.properties.find((x) => x.id === o?.propertyId)?.title ?? "";
  };
  return (
    <article className="grid gap-8">
      <UPalPageContext facts={{ ...facts, portfolio_value_thb: p.totals.valueThb, portfolio_cost_thb: p.totals.costThb, portfolio_gain_pct: p.totals.gainPct, simulated_income_month_thb: p.totals.incomeThb, properties_held: p.totals.properties, wallet_available_thb: wallet }} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <p className="eyebrow text-deep">{t("Premium")}</p>
          <h1 className="page-title">{t("Co-Invest")}</h1>
          <p className="lead max-w-2xl">{t("Your co-owned properties, their index-tracked value and the opportunities still funding. Test money only.")}</p>
        </div>
        <Link href="/account/wallet" className="btn btn-secondary">{t("Wallet: {amount}", { amount: money(wallet) })}</Link>
      </header>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="stat-tile"><dt>{t("Portfolio value")}</dt><dd className="price">{money(p.totals.valueThb)}</dd></div>
        <div className="stat-tile"><dt>{t("Invested")}</dt><dd className="price">{money(p.totals.costThb)}</dd></div>
        <div className="stat-tile"><dt>{t("Gain or loss")}</dt><dd className={`price ${p.totals.gainThb >= 0 ? "text-teal" : "text-red"}`}>{p.totals.gainThb >= 0 ? "+" : "−"}{money(Math.abs(p.totals.gainThb))}</dd><dd className="caption">{p.totals.gainPct >= 0 ? "+" : "−"}{Math.abs(p.totals.gainPct)}%</dd></div>
        <div className="stat-tile"><dt>{t("Simulated income")}</dt><dd className="price">{money(p.totals.incomeThb)}</dd><dd className="caption">{t("per month, not paid out")}</dd></div>
        <div className="stat-tile"><dt>{t("Properties")}</dt><dd className="price">{p.totals.properties}</dd></div>
      </dl>

      {p.rows.length === 0 ? (
        <section className="surface-card grid gap-2 p-6">
          <h2 className="card-title">{t("You have no units yet")}</h2>
          <p className="text-deep">{t("Choose an opportunity below to buy your first units.")}</p>
        </section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-labelledby="ci-value" className="surface-card grid gap-3 p-5">
            <h2 id="ci-value" className="card-title">{t("Portfolio value over time")}</h2>
            <ForecastChart
              history={p.history}
              forecast={[]}
              isSample={false}
              months={60}
              title={t("Units held × unit value each month (estimate)")}
              labels={{ history: t("Portfolio value") }}
              summary={t("Portfolio value now {amount}", { amount: money(p.totals.valueThb) })}
              format={compact}
              axisWidth="3.75rem"
            />
            <p className="caption">{t("Funding months use the funding price; funded months use the value tracked by the Bank of Thailand index.")}</p>
          </section>
          <section aria-labelledby="ci-graph" className="surface-card grid gap-3 p-5">
            <h2 id="ci-graph" className="card-title">{t("Your ownership")}</h2>
            <OwnershipGraph
              center={{ label: t("You"), detail: t("Select a property to see your share.") }}
              nodes={p.rows.map((r) => ({ id: r.offering.id, label: r.property.title.replace(/ \(sample\)$/, ""), sharePct: r.position.sharePct, kind: "property" as const, href: `/coinvest/${r.offering.code}`, detail: `${t("{count} units", { count: r.position.units })} · ${money(r.position.valueThb)}` }))}
              title={t("Your share of each property")}
              summary={t("You hold units in {count} properties.", { count: p.rows.length })}
              legend={{ property: t("Property (size = your share)") }}
            />
          </section>
        </div>
      )}

      {p.rows.length > 0 && (
        <section aria-labelledby="ci-holdings" className="grid gap-3">
          <h2 id="ci-holdings" className="section-title">{t("Your holdings")}</h2>
          <div role="region" aria-label={t("Your holdings")} tabIndex={0} className="table-scroll surface-card">
            <table className="record-table w-full text-sm">
              <thead className="bg-ice"><tr>{[t("Property"), t("Units"), t("Share"), t("Value now"), t("Gain or loss"), t("Simulated income")].map((h) => <th key={h} scope="col" className="p-3 text-start">{h}</th>)}</tr></thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.offering.id} className="border-t border-silver">
                    <th scope="row" className="p-3 text-start font-semibold"><span className="record-label">{t("Property")}</span><Link href={`/coinvest/${r.offering.code}`} className="underline"><bdi>{r.property.title}</bdi></Link></th>
                    <td className="p-3 tabular-nums"><span className="record-label">{t("Units")}</span>{r.position.units}</td>
                    <td className="p-3 tabular-nums"><span className="record-label">{t("Share")}</span>{r.position.sharePct}%</td>
                    <td className="p-3 tabular-nums"><span className="record-label">{t("Value now")}</span>{money(r.position.valueThb)}</td>
                    <td className={`p-3 tabular-nums ${r.position.gainThb >= 0 ? "text-teal" : "text-red"}`}><span className="record-label">{t("Gain or loss")}</span>{r.position.gainThb >= 0 ? "+" : "−"}{money(Math.abs(r.position.gainThb))}</td>
                    <td className="p-3 tabular-nums"><span className="record-label">{t("Simulated income")}</span>{money(r.incomeThb)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section aria-labelledby="ci-open" className="grid gap-4">
        <h2 id="ci-open" className="section-title">{t("Opportunities")}</h2>
        <OfferingGrid views={views} locale={locale} currency={currency} premium />
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="ci-activity" className="grid gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 id="ci-activity" className="section-title">{t("Recent activity")}</h2>
            <Link href="/account/wallet" className="text-sm font-semibold text-blue-ink underline">{t("All receipts")}</Link>
          </div>
          <ul className="surface-card divide-y divide-silver">
            {recent.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span><span className="font-semibold">{x.side === "buy" ? t("Bought") : x.phase === "funding" ? t("Withdrew") : t("Sold")}</span> · {t("{count} units", { count: x.units })} · <bdi>{titleOf(x.offeringId)}</bdi></span>
                <span className="tabular-nums text-deep">{money(x.amountThb)} · {new Date(x.createdAt).toLocaleDateString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="caption">{t("Demo: test money and simulated co-ownership. The 90 member accounts in this demo are fictional; nothing here shows real adoption or real investment.")}</p>
    </article>
  );
}
