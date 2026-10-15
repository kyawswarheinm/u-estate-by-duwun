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
import { indexSeries } from "@/data/index-sample";
import { agentSaleFee, sellerFee } from "@/lib/rules";
import { Card, RiskIcon, SampleTag, VerificationBadge } from "@/components/ui";
import { IndexChart } from "@/components/IndexChart";
import { ExplainVoice } from "@/components/ExplainVoice";
import { createCobuyGroup } from "@/app/actions";
import { openOfferRound } from "@/app/sell/actions";

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
        <p className="mt-1 text-sm text-ink-soft">Confirm ownership at the Land Office before any money moves.</p>
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
        <div className="mt-5">
          <IndexChart series={indexSeries(property.indexSeries)} isSample={panel.index.isSample} title={`Price index: ${property.type}s, Bangkok area`} />
          <p className="mt-1 text-xs text-ink-soft"><Text message="Source: {source} · latest {month}" values={{ source: panel.index.source, month: panel.index.latestMonth }} /></p>
        </div>
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
          <table className="mt-3 w-full text-start text-sm">
            <caption className="sr-only"><Text message="Fees for this listing" /></caption>
            <thead>
              <tr className="border-b border-line"><th scope="col" className="py-2"><Text message="Party" /></th><th scope="col">U-Estate</th><th scope="col"><Text message="U-topia member" /></th><th scope="col"><Text message="Typical agent" /></th></tr>
            </thead>
            <tbody>
              <tr className="border-b border-line"><th scope="row" className="py-2"><Text message="Seller (on success)" /></th><td><Money amount={sellerFee(listing.askingPriceThb, false)} /> (1.5%)</td><td><Money amount={sellerFee(listing.askingPriceThb, true)} /> (0.75%)</td><td><Money amount={agentSaleFee(listing.askingPriceThb)} /> (3%)</td></tr>
              <tr><th scope="row" className="py-2"><Text message="Buyer" /></th><td>฿0</td><td>฿0</td><td><Text message="varies" /></td></tr>
            </tbody>
          </table>
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
