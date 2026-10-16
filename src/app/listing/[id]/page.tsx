import { ListingPhotos } from "@/components/ListingPhotos";
import { startConversation } from "@/app/messages/actions";
import { usesSupabase } from "@/lib/db/runtime";
import { backendText } from "@/i18n/backend";
import { formatMoney, translator, translateLabel } from "@/i18n";
import { getPreferences } from "@/i18n/server";
import { Text } from "@/i18n/Text";
import { Money } from "@/components/Money";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { pricePanel } from "@/lib/price";
import { agentSaleFee, sellerFee } from "@/lib/rules";
import { Card, RiskIcon, SampleTag, VerificationBadge } from "@/components/ui";
import { ForecastChart } from "@/components/ForecastChart";
import { ExplainVoice } from "@/components/ExplainVoice";
import { createCobuyGroup } from "@/app/actions";
import { openOfferRound } from "@/app/sell/actions";
import { compareToMarket } from "@/lib/market-data/analytics";
import { MARKET_FORECAST, MarketType } from "@/lib/market-data";

// A median of one or two asking prices says nothing useful, so the comparison needs at least three.
const MIN_MARKET_COMPARE = 3;

export default async function ListingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cobuyError?: string; created?: string }> }) {
  const { locale } = await getPreferences();
  const t = translator(locale);
  const { id } = await params;
  const { cobuyError, created } = await searchParams;
  const [db, me] = await Promise.all([readDb(), currentUser()]);
  const listing = db.listings.find((l) => (l.id === id || l.code === id));
  if (!listing) notFound();
  const property = db.properties.find((p) => p.id === listing.propertyId)!;
  const seller = db.profiles.find((p) => p.id === listing.sellerId)!;
  const comparables = db.listings
    .filter((l) => l.id !== listing.id && !l.archivedAt)
    .map((l) => ({ l, p: db.properties.find((x) => x.id === l.propertyId)! }))
    .filter(({ p }) => p.type === property.type)
    .map(({ l, p }) => ({ pricePerSqm: l.askingPriceThb / p.areaSqm }));
  const panel = pricePanel(listing, property, comparables);
  const group = db.cobuyGroups.find((g) => g.listingId === listing.id && g.status !== "cancelled");
  const round = db.offerRounds.find((r) => r.listingId === listing.id);
  const isOwner = me?.id === listing.sellerId;
  const offerCount = round ? round.offerCount ?? db.offers.filter((o) => o.roundId === round.id).length : 0;
  // P3T05: where this asking price per m² sits against asking prices on listing websites (code computes it, D-32).
  const marketType = MarketType.safeParse(property.type);
  const market = marketType.success
    ? compareToMarket({ priceThb: listing.askingPriceThb, areaSqm: property.areaSqm, district: property.district, type: marketType.data, kind: listing.kind })
    : null;
  // TimesFM-based 12-month forecast of the same BOT series the price panel uses (D-42). Code computes every number.
  const fseries = MARKET_FORECAST.series.find((s) => s.key === property.indexSeries) ?? MARKET_FORECAST.series.find((s) => s.type === property.type) ?? MARKET_FORECAST.series[0];
  const lastIdx = fseries.history[fseries.history.length - 1];
  const endIdx = fseries.forecast[fseries.forecast.length - 1];
  const pctOf = (v: number) => Math.round(((v - lastIdx.value) / lastIdx.value) * 1000) / 10;
  const outlook = t("Next {months} months: {low}% to {high}% (central {central}%), a forecast, not a guarantee.", { months: fseries.forecast.length, low: pctOf(endIdx.p10), high: pctOf(endIdx.p90), central: pctOf(endIdx.p50) });
  // Only for homes sold with an index-adjusted estimate: rents and whole buildings don't follow a home price index.
  const homeBase = listing.kind === "sale" && ["condo", "house", "townhouse"].includes(property.type) ? panel.estimate.thb : null;
  const homeAt = (v: number) => Math.round((homeBase! * v) / lastIdx.value / 1000) * 1000;

  return (
    <article className="grid gap-5">
      {isOwner && (
        <section aria-label="Your listing" className="grid gap-3 rounded-[14px] bg-midnight p-5 text-ice sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-semibold">{created ? <Text message="Your listing is live." /> : <Text message="This is your listing." />}</p>
            <p className="text-sm text-silver"><Text message="Buyers see exactly what you see on this page, including your fee." /></p>
          </div>
          <div className="flex flex-wrap gap-2">
            {listing.verificationStatus !== "verified_sample" && <Link href={`/sell?listing=${listing.id}#deed`} className="btn btn-on-dark"><Text message="Check the deed" /></Link>}
            {listing.kind === "sale" && (round ? (
              <Link href={`/listing/${listing.id}/offers`} className="btn btn-ghost-dark"><Text message="Offer room ({count})" values={{ count: offerCount }} /></Link>
            ) : (
              <form action={openOfferRound}>
                <input type="hidden" name="listingId" value={listing.id} />
                <button type="submit" className="btn btn-ghost-dark"><Text message="Open offer room" /></button>
              </form>
            ))}
            <Link href="/account/properties" className="btn btn-ghost-dark"><Text message="My properties" /></Link>
          </div>
        </section>
      )}
      {me && me.id !== listing.sellerId && !listing.archivedAt && usesSupabase() && <form action={startConversation}><input type="hidden" name="listingId" value={listing.id}/><button className="btn btn-secondary">{backendText(me.locale).contact}</button></form>}
      {listing.archivedAt && <p role="status">{backendText(me?.locale).archived}</p>}
      <ListingPhotos id={listing.id} locale={me?.locale}/>
      <header>
        <p className="text-sm text-deep"><Text message="{type} in {district}, {province} · {area} m² · for {kind}" values={{ type: translateLabel(locale, property.type), district: property.district, province: property.province, area: property.areaSqm, kind: translateLabel(locale, listing.kind) }} /></p>
        <h1 className="font-display text-4xl font-semibold sm:text-5xl"><bdi>{property.title}</bdi></h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <VerificationBadge status={listing.verificationStatus} />
          <span className="text-sm text-ink-soft"><Text message="Seller: {name} · Deed type: {deed}" values={{ name: seller.name, deed: property.deedType }} /></span>
        </div>
        <p className="mt-1 text-sm text-ink-soft"><Text message="Confirm ownership at the Land Office before any money moves." /></p>
        {listing.verificationReasons.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-sm text-amber">
            {listing.verificationReasons.map((r) => <li key={r}>{r}</li>)}
          </ul>
        )}
      </header>

      <Card>
        <h2 className="text-xl font-bold"><Text message="Price: three numbers, three sources" /></h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-mist p-4">
            <dt className="text-sm text-ink-soft"><Text message="Asking price (seller)" /></dt>
            <dd className="text-2xl font-bold"><Money amount={panel.askingThb} /></dd>
          </div>
          <div className="rounded-lg bg-mist p-4">
            <dt className="text-sm text-ink-soft">Official appraisal {/sample/i.test(panel.appraisal.source) && <SampleTag />}</dt>
            {panel.appraisal.thb > 0 ? (
              <>
                <dd className="text-2xl font-bold"><Money amount={panel.appraisal.thb} /></dd>
                <dd className="text-xs text-ink-soft">{panel.appraisal.source}, {panel.appraisal.date}</dd>
              </>
            ) : (
              <dd className="text-sm font-semibold"><Text message="Not provided yet. Ask the seller, or look it up with the Treasury Department." /></dd>
            )}
          </div>
          <div className="rounded-lg bg-mist p-4">
            <dt className="text-sm text-ink-soft"><Text message="Index-adjusted estimate" /></dt>
            {panel.estimate.thb !== null ? (
              <>
                <dd className="text-2xl font-bold"><Money amount={panel.estimate.thb} /></dd>
                <dd className="text-sm"><Text message="Range {low} – {high}" values={{ low: formatMoney(panel.estimate.lowThb, locale), high: formatMoney(panel.estimate.highThb, locale) }} /></dd>
                <dd className="text-xs text-ink-soft">{panel.estimate.basis}</dd>
              </>
            ) : (
              <dd className="text-sm font-semibold">{panel.estimate.reason}</dd>
            )}
          </div>
        </dl>
        {market?.available && market.listings_compared >= MIN_MARKET_COMPARE && (
          <section aria-labelledby="market-compare" className="mt-4 rounded-lg border border-line p-4">
            <h3 id="market-compare" className="text-sm font-semibold text-deep">
              <Text message="Market comparison" /> {market.is_sample && <SampleTag />}
            </h3>
            <p className="mt-1 font-semibold">
              {(() => {
                const values = { count: market.listings_compared, district: market.compared_with === "all districts" ? t("Bangkok and vicinity") : market.compared_with, pct: Math.abs(market.diff_pct) };
                if (market.is_sample) {
                  return market.diff_pct > 0
                    ? t("Compared with {count} sample listings in {district}: {pct}% above the median.", values)
                    : market.diff_pct < 0
                      ? t("Compared with {count} sample listings in {district}: {pct}% below the median.", values)
                      : t("Compared with {count} sample listings in {district}: at the median.", values);
                }
                return market.diff_pct > 0
                  ? t("Compared with {count} asking prices in {district}: {pct}% above the median.", values)
                  : market.diff_pct < 0
                    ? t("Compared with {count} asking prices in {district}: {pct}% below the median.", values)
                    : t("Compared with {count} asking prices in {district}: at the median.", values);
              })()}
            </p>
            <p className="text-sm text-deep"><Text message={market.is_sample ? "Price per m² here: {mine}. Median of the sample listings: {median}." : "Price per m² here: {mine}. Median on listing websites: {median}."} values={{ mine: formatMoney(market.price_per_sqm, locale), median: formatMoney(market.median_price_per_sqm, locale) }} /></p>
            <p className="mt-1 text-xs text-ink-soft">
              <Text message={market.is_sample ? "Sample listings are synthetic, not real prices." : "Asking prices on listing websites, not sale prices."} />{" "}
              <Link href={`/market?district=${encodeURIComponent(property.district)}`} className="font-semibold"><Text message="Explore the market" /></Link>
            </p>
          </section>
        )}
        <section aria-labelledby="forecast-heading" className="mt-5 grid gap-2 rounded-lg border border-line p-4">
          <h3 id="forecast-heading" className="sr-only">{t("Price index and 12-month forecast")}</h3>
          <ForecastChart
            history={fseries.history}
            forecast={fseries.forecast}
            isSample={MARKET_FORECAST.meta.is_sample}
            title={`${t("Price index and 12-month forecast")} · ${fseries.label}`}
            labels={{ history: MARKET_FORECAST.meta.is_sample ? t("SAMPLE INDEX DATA") : t("Bank of Thailand index"), band: t("80% range (p10–p90)"), central: t("Central forecast") }}
            summary={`${fseries.label}, ${lastIdx.period}: ${lastIdx.value}. ${outlook}`}
          />
          <p className="text-sm font-semibold text-deep">{outlook}</p>
          {homeBase !== null && (
            <p className="text-sm text-deep">{t("If this home's value moves with the index: {value} in 12 months (range {low} – {high}).", { value: formatMoney(homeAt(endIdx.p50), locale), low: formatMoney(homeAt(endIdx.p10), locale), high: formatMoney(homeAt(endIdx.p90), locale) })}</p>
          )}
          <p className="text-xs text-ink-soft">
            {t("Forecast model: {model}", { model: MARKET_FORECAST.meta.model })} · <Text message="Source: {source} · latest {month}" values={{ source: panel.index.source, month: panel.index.latestMonth }} />
          </p>
        </section>
        <div className="mt-5">
          <ExplainVoice listingId={listing.id} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-xl font-bold"><Text message="Risk checklist" /></h2>
          <ul className="mt-3 grid gap-2">
            {panel.risks.map((r) => (
              <li key={r.label} className="flex gap-2">
                <RiskIcon level={r.level} />
                <span><strong>{r.label}:</strong> {r.detail}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-xl font-bold"><Text message="Who pays what" /></h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-start text-sm">
              <caption className="sr-only"><Text message="Fees for this listing" /></caption>
              <thead>
                <tr className="border-b border-line"><th scope="col" className="py-2"><Text message="Party" /></th><th scope="col">U-Estate</th><th scope="col"><Text message="U-topia member" /></th><th scope="col"><Text message="Typical agent" /></th></tr>
              </thead>
              <tbody>
                <tr className="border-b border-line"><th scope="row" className="py-2"><Text message="Seller (on success)" /></th><td><Money amount={sellerFee(listing.askingPriceThb, false)} /> (1.5%)</td><td><Money amount={sellerFee(listing.askingPriceThb, true)} /> (0.75%)</td><td><Money amount={agentSaleFee(listing.askingPriceThb)} /> (3%)</td></tr>
                <tr><th scope="row" className="py-2"><Text message="Buyer" /></th><td>฿0</td><td>฿0</td><td><Text message="varies" /></td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-soft"><Text message="Excludes government transfer fees and taxes. Optional paid checks (inspection, legal check) are priced separately and shown before you buy them. Typical agent fee = common market practice, not a quote." /></p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {round && (
          <Card>
            <h2 className="text-xl font-bold">FairOffer</h2>
            <p className="mt-1"><Text message="The seller published the comparison rules before any offer arrived. Offers are sealed until the deadline." /></p>
            <Link href={`/listing/${listing.id}/offers`} className="mt-3 inline-block rounded-lg bg-blue-ink px-4 py-3 font-semibold text-paper"><Text message="Open offer room" /></Link>
          </Card>
        )}
        {listing.cobuyEnabled && !listing.archivedAt && (
          <Card>
            <h2 className="text-xl font-bold"><Text message="Co-buy with other U-topia members" /></h2>
            <p className="mt-1">
              {property.type === "condo"
                ? t("Thai and international members can co-own this condo, within the building's 49% foreign quota.")
                : t("Thai members co-own this property; international members can fund it as registered lenders at a fixed rate (foreigners cannot own Thai land).")}
            </p>
            {cobuyError === "members-only" && <p role="alert" className="mt-2 font-semibold text-red"><Text message="Co-buy groups are open to U-topia community members only." /></p>}
            {group ? (
              <Link href={`/cobuy/${group.id}`} className="mt-3 inline-block rounded-lg bg-blue-ink px-4 py-3 font-semibold text-paper"><Text message="View co-buy group" /></Link>
            ) : (
              <form action={createCobuyGroup} className="mt-3">
                <input type="hidden" name="listingId" value={listing.id} />
                <button type="submit" className="rounded-lg bg-blue-ink px-4 py-3 font-semibold text-paper"><Text message="Start a co-buy group" /></button>
                {!me && <p className="mt-2 text-sm text-ink-soft"><Link href={`/signin?next=/listing/${listing.id}`} className="underline"><Text message="Sign in" /></Link> as a U-topia member to start or join a group.</p>}
                {me && !me.utopiaMember && <p className="mt-2 text-sm text-ink-soft"><Text message="You are signed in as {name}, who is not a U-topia member." values={{ name: me.name }} /></p>}
              </form>
            )}
          </Card>
        )}
      </div>
    </article>
  );
}
