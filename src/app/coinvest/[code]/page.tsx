import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoneyCompact, formatMoneyRef, translateLabel } from "@/i18n";
import { getPreferences, getTranslations } from "@/i18n/server";
import { readDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { availableThb, foreignAreaUsed, poolUnits, position, simulatedMonthlyIncome, unitPrice } from "@/lib/coinvest/engine";
import { offeringValuation, ownership } from "@/lib/coinvest/view";
import { ForecastChart } from "@/components/ForecastChart";
import { OwnershipGraph } from "@/components/coinvest/OwnershipGraph";
import { TradePanel } from "@/components/coinvest/TradePanel";
import { UPalPageContext } from "@/components/upal/UPalProvider";

export default async function OfferingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [t, { locale, currency }, db, me] = await Promise.all([getTranslations(), getPreferences(), readDb(), currentUser()]);
  const o = db.coinvestOfferings.find((x) => x.code === code || x.id === code);
  if (!o || o.status === "closed") notFound();
  const property = db.properties.find((p) => p.id === o.propertyId);
  if (!property) notFound();
  const building = property.buildingId ? db.buildings.find((b) => b.id === property.buildingId) : undefined;
  const premium = Boolean(me?.premium);
  const money = (v: number) => formatMoneyRef(v, locale, currency);
  const compact = (v: number) => formatMoneyCompact(v, locale, "THB");
  const price = unitPrice(o);
  const pool = poolUnits(o);
  const soldPct = Math.round((o.unitsOutstanding / o.totalUnits) * 10000) / 100;
  const valuation = offeringValuation(o, property);
  const end = valuation.forecast.at(-1);
  const mine = me ? db.coinvestHoldings.find((h) => h.offeringId === o.id && h.userId === me.id) : undefined;
  const pos = position(o, mine);
  const own = premium ? ownership(db, o, me!.id) : null;
  const trades = premium ? db.coinvestTrades.filter((x) => x.offeringId === o.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12) : [];
  const nameOf = (id: string) => (id === me?.id ? t("You") : db.profiles.find((p) => p.id === id)?.name ?? t("Member"));
  const laneBlocked = Boolean(me && !me.isThai && property.type !== "condo");
  const quota = building ? { used: foreignAreaUsed(db, building.id), limit: 0.49 * building.totalFloorAreaSqm } : null;

  return (
    <article className="grid gap-8">
      <UPalPageContext facts={{
        offering: o.code, property: property.title, property_type: property.type, district: property.district, status: o.status,
        unit_price_thb: price, units_total: o.totalUnits, units_sold: o.unitsOutstanding, units_in_pool: pool, funded_pct: soldPct,
        value_estimate_thb: o.currentValueThb, value_month: o.valuedMonth, change_since_funding_pct: valuation.changePct,
        forecast_12m_p10_thb: end?.p10 ?? null, forecast_12m_p50_thb: end?.p50 ?? null, forecast_12m_p90_thb: end?.p90 ?? null,
        gross_yield_assumption_pct: o.grossYieldPct, valuation_basis: "BOT residential price index (estimate, not an appraisal)",
        user_tier: me ? (premium ? "premium" : "standard") : "guest", user_units: pos.units, user_share_pct: pos.sharePct,
        foreign_members: property.type === "condo" ? "condo: allowed within the 49% quota" : "not allowed (house/land)", money: "test money only",
      }} />
      <nav aria-label={t("Breadcrumb")}><Link href="/coinvest" className="text-sm font-semibold text-blue-ink underline">← {t("Co-Invest")}</Link></nav>
      <header className="grid gap-3">
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className={`pill ${o.status === "funding" ? "bg-amber-soft text-amber" : "bg-teal-soft text-teal"}`}><span aria-hidden="true">{o.status === "funding" ? "◔" : "✓"}</span> {o.status === "funding" ? t("Funding") : t("Funded")}</span>
          <span className="pill border border-silver bg-paper text-deep">{translateLabel(locale, property.type)}</span>
          <span className="pill border border-silver bg-paper text-deep">SAMPLE</span>
        </div>
        <h1 className="page-title"><bdi>{property.title}</bdi></h1>
        <p className="lead"><bdi>{property.district}, {property.province}</bdi> · {property.areaSqm} m² · {property.deedType}</p>
      </header>

      <dl className="grid gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        <div className="stat-tile"><dt>{o.status === "funding" ? t("Funding price per unit") : t("Unit value now")}</dt><dd className="price">{money(price)}</dd><dd className="caption">{t("{count} units in total", { count: o.totalUnits })}</dd></div>
        <div className="stat-tile">
          <dt>{o.status === "funding" ? t("Funding progress") : t("Units available from the pool")}</dt>
          <dd className="price">{o.status === "funding" ? `${soldPct}%` : pool}</dd>
          <dd><progress className="coinvest-progress" max={100} value={soldPct} aria-label={t("{percent}% funded", { percent: soldPct })} /></dd>
        </div>
        <div className="stat-tile"><dt>{t("Estimated value")}</dt><dd className="price">{money(o.currentValueThb)}</dd><dd className="caption">{o.status === "funding" ? t("Funding target") : t("{change}% since funding · {month}", { change: `${valuation.changePct >= 0 ? "+" : "−"}${Math.abs(valuation.changePct)}`, month: o.valuedMonth })}</dd></div>
        <div className="stat-tile"><dt>{t("Rental yield assumption")}</dt><dd className="price">{o.grossYieldPct}%</dd><dd className="caption">{t("Gross, for simulated income only")}</dd></div>
      </dl>

      {!premium ? (
        <section aria-labelledby="ci-locked" className="band grid gap-3 rounded-[22px] p-6 sm:p-8">
          <h2 id="ci-locked" className="section-title text-ice">{t("Premium unlocks this property")}</h2>
          <p className="max-w-2xl text-silver">{t("Premium members see the valuation chart and forecast, the ownership graph and every trade, and can buy or sell units with test money.")}</p>
          <div className="flex flex-wrap gap-2">
            {me ? <Link href="/premium" className="btn btn-on-dark">{t("Upgrade to Premium")}</Link> : <>
              <Link href={`/signup?next=/premium`} className="btn btn-on-dark">{t("Create account")}</Link>
              <Link href={`/signin?next=/coinvest/${o.code}`} className="btn btn-ghost-dark">{t("Sign in")}</Link>
            </>}
          </div>
        </section>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <TradePanel offeringId={o.id} title={property.title} status={o.status === "funding" ? "funding" : "active"} unitPriceThb={price} unitParThb={o.unitParThb}
              poolUnits={pool} heldUnits={pos.units} totalUnits={o.totalUnits} availableThb={availableThb(db, me!.id)} laneBlocked={laneBlocked} />
            <section aria-labelledby="ci-mine" className="surface-card grid content-start gap-3 p-5">
              <h2 id="ci-mine" className="card-title">{t("Your position")}</h2>
              {pos.units === 0 ? <p className="text-deep">{t("You have no units in this property yet.")}</p> : (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-deep">{t("Units")}</dt><dd className="text-lg font-semibold tabular-nums">{pos.units} · {pos.sharePct}%</dd></div>
                  <div><dt className="text-deep">{t("Value now")}</dt><dd className="text-lg font-semibold tabular-nums">{money(pos.valueThb)}</dd></div>
                  <div><dt className="text-deep">{t("Invested")}</dt><dd className="font-semibold tabular-nums">{money(pos.costThb)}</dd></div>
                  <div><dt className="text-deep">{t("Gain or loss")}</dt><dd className={`font-semibold tabular-nums ${pos.gainThb >= 0 ? "text-teal" : "text-red"}`}>{pos.gainThb >= 0 ? "+" : "−"}{money(Math.abs(pos.gainThb))}</dd></div>
                  <div className="col-span-2"><dt className="text-deep">{t("Simulated income")}</dt><dd className="font-semibold tabular-nums">{money(simulatedMonthlyIncome(o, pos.units))} {t("per month, not paid out")}</dd></div>
                  {mine?.fetRequired && <div className="col-span-2 rounded-xl bg-ice p-3 text-deep">{t("As a foreign co-owner you would need a Foreign Exchange Transaction form (FET) for the funds. Your units count {area} m² against the building's foreign quota.", { area: mine.areaSqmAttributed })}</div>}
                </dl>
              )}
            </section>
          </div>

          <section aria-labelledby="ci-val" className="surface-card grid gap-3 p-5">
            <h2 id="ci-val" className="card-title">{t("Estimated value and forecast")}</h2>
            <ForecastChart history={valuation.history.map((h) => ({ period: h.month, value: h.valueThb }))} forecast={valuation.forecast.map((f) => ({ period: f.month, p10: f.p10, p50: f.p50, p90: f.p90 }))}
              isSample={false} months={60} title={`${t("Value moved with the index since funding")} · ${valuation.indexLabel}`}
              labels={{ history: t("Index-tracked estimate"), band: t("80% range (p10–p90)"), central: t("Central forecast") }}
              summary={t("Estimated value {value} in {month}; 12-month forecast {low} to {high}.", { value: money(o.currentValueThb), month: o.valuedMonth, low: money(end?.p10 ?? o.currentValueThb), high: money(end?.p90 ?? o.currentValueThb) })}
              format={compact} axisWidth="3.75rem" />
            <p className="caption">{t("Source: {source}. Forecast: {model}. An estimate for one property derived from a regional index, not an appraisal and not a guarantee.", { source: valuation.source, model: valuation.model })}</p>
          </section>

          {own && (
            <section aria-labelledby="ci-own" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="surface-card grid content-start gap-3 p-5">
                <h2 id="ci-own" className="card-title">{t("Who owns this property")}</h2>
                <OwnershipGraph
                  center={{ label: t("Property"), detail: t("{count} co-owners and the U-Estate pool. Select a node for details.", { count: own.holders.length }) }}
                  nodes={[
                    ...own.holders.map((h) => ({ id: h.userId, label: h.you ? t("You") : h.name, sharePct: h.sharePct, kind: h.you ? ("you" as const) : ("member" as const), detail: t("{count} units", { count: h.units }) + (h.foreign ? ` · ${t("foreign co-owner (FET)")}` : "") })),
                    ...(own.pool.units > 0 ? [{ id: "pool", label: t("U-Estate pool"), sharePct: own.pool.sharePct, kind: "pool" as const, detail: t("{count} units not yet owned by members", { count: own.pool.units }) }] : []),
                  ]}
                  title={t("Ownership graph")}
                  summary={t("{count} co-owners hold {percent}% of the units.", { count: own.holders.length, percent: soldPct })}
                  legend={{ you: t("You"), member: t("Member"), pool: t("U-Estate pool (unallocated)") }}
                />
              </div>
              <div className="surface-card grid content-start gap-3 p-5">
                <h2 className="card-title">{t("Co-owners")}</h2>
                <div role="region" aria-label={t("Co-owners")} tabIndex={0} className="table-scroll">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-silver text-deep">{[t("Member"), t("Units"), t("Share")].map((h) => <th key={h} scope="col" className="py-2 text-start">{h}</th>)}</tr></thead>
                    <tbody>
                      {own.holders.map((h) => (
                        <tr key={h.userId} className={`border-b border-ice ${h.you ? "font-semibold" : ""}`}>
                          <th scope="row" className="py-2 text-start font-normal"><bdi>{h.you ? t("You") : h.name}</bdi>{h.foreign && <span className="ms-1 text-xs text-deep">(FET)</span>}</th>
                          <td className="tabular-nums">{h.units}</td><td className="tabular-nums">{h.sharePct}%</td>
                        </tr>
                      ))}
                      {own.pool.units > 0 && <tr><th scope="row" className="py-2 text-start font-normal text-deep">{t("U-Estate pool (unallocated)")}</th><td className="tabular-nums text-deep">{own.pool.units}</td><td className="tabular-nums text-deep">{own.pool.sharePct}%</td></tr>}
                    </tbody>
                  </table>
                </div>
                {quota && <p className="caption">{t("Foreign quota used in this building: {used} of {limit} m² (49%).", { used: Math.round(quota.used), limit: Math.round(quota.limit) })}</p>}
              </div>
            </section>
          )}

          {trades.length > 0 && (
            <section aria-labelledby="ci-trades" className="grid gap-3">
              <h2 id="ci-trades" className="section-title">{t("Ownership history")}</h2>
              <div role="region" aria-label={t("Ownership history")} tabIndex={0} className="table-scroll surface-card">
                <table className="record-table w-full text-sm">
                  <thead className="bg-ice"><tr>{[t("Date"), t("Member"), t("Trade"), t("Units"), t("Unit price"), t("Amount")].map((h) => <th key={h} scope="col" className="p-3 text-start">{h}</th>)}</tr></thead>
                  <tbody>
                    {trades.map((x) => (
                      <tr key={x.id} className="border-t border-silver">
                        <td className="p-3"><span className="record-label">{t("Date")}</span>{new Date(x.createdAt).toLocaleDateString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" })}</td>
                        <td className="p-3"><span className="record-label">{t("Member")}</span><bdi>{nameOf(x.userId)}</bdi></td>
                        <td className="p-3"><span className="record-label">{t("Trade")}</span>{x.side === "buy" ? t("Bought") : x.phase === "funding" ? t("Withdrew") : t("Sold")}</td>
                        <td className="p-3 tabular-nums"><span className="record-label">{t("Units")}</span>{x.units}</td>
                        <td className="p-3 tabular-nums"><span className="record-label">{t("Unit price")}</span>{money(x.unitPriceThb)}</td>
                        <td className="p-3 tabular-nums"><span className="record-label">{t("Amount")}</span>{money(x.amountThb)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      <p className="rounded-2xl bg-ice p-5 text-sm text-deep">
        {property.type === "condo"
          ? t("Thai and foreign members can hold units in this condo. Foreign holdings count against the building's 49% foreign floor-area quota and need funds sent from abroad (FET).")
          : t("Only Thai members can hold units in houses and land. Foreign members can fund eligible co-buy listings as fixed-rate lenders instead.")}
        {" "}{t("Demo: test money and simulated co-ownership, not a legal title or a security.")}
      </p>
    </article>
  );
}
