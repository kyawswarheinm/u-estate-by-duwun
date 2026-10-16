import { randomUUID } from "node:crypto";
import { formatMoney, translateLabel } from "@/i18n";
import { Label, Text } from "@/i18n/Text";
import { getPreferences } from "@/i18n/server";
import { Money } from "@/components/Money";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { scoreOffers } from "@/lib/rules";
import { Card } from "@/components/ui";
import { OfferForm } from "@/components/OfferForm";
import { TokenCheck } from "@/components/TokenCheck";
import { acceptOffer, closeRound } from "@/app/actions";

const FUNDING_LABEL = { cash: "Cash", pre_approved: "Bank pre-approval", proof_uploaded: "Proof of funds", declared: "Declared only" } as const;

export default async function OffersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { locale } = await getPreferences();
  const [db, me] = await Promise.all([readDb(), currentUser()]);
  const listing = db.listings.find((l) => (l.id === id || l.code === id));
  const round = db.offerRounds.find((r) => r.listingId === listing?.id);
  if (!listing || !round) notFound();
  const property = db.properties.find((p) => p.id === listing.propertyId)!;
  const isSeller = me?.id === listing.sellerId;
  const offers = db.offers.filter((o) => o.roundId === round.id);
  const mine = me ? offers.find((o) => o.buyerId === me.id) : undefined;
  const ranked = round.status !== "open" ? scoreOffers(offers, round.criteria) : [];
  const buyer = (uid: string) => db.profiles.find((p) => p.id === uid)?.name ?? uid;

  return (
    <article className="grid gap-5">
      <header>
        <p className="text-sm text-ink-soft"><Link href={`/listing/${id}`} className="underline"><span aria-hidden="true" className="inline-block rtl:-scale-x-100">←</span> <bdi>{property.title}</bdi></Link></p>
        <h1 className="page-title"><Text message="FairOffer room" /></h1>
        <p className="mt-1 text-ink-soft"><Text message="Asking {amount} · round {status} · sealed offers until the seller closes the round" values={{ amount: formatMoney(listing.askingPriceThb, locale), status: translateLabel(locale, round.status) }} /></p>
      </header>

      <Card>
        <h2 className="text-xl font-bold"><Text message="How offers will be compared" /></h2>
        <p className="text-sm text-ink-soft"><Text message="Published by the seller on {date}, before any offer. These rules cannot change after publication." values={{ date: new Date(round.rulesPublishedAt).toLocaleString(locale, { numberingSystem: "latn", timeZone: "Asia/Bangkok" }) }} /></p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-4">
          {round.criteria.map((c) => (
            <li key={c.key} className="rounded-lg bg-mist p-3"><span className="text-2xl font-bold">{c.weight}%</span><br />{c.label}</li>
          ))}
        </ul>
        <p className="mt-2 text-sm"><Text message="AI may summarise, but it can only use these criteria. The seller makes the final choice. Personal characteristics are never used." /></p>
      </Card>

      {round.status === "open" && (
        <div className="grid gap-5 lg:grid-cols-2">
          {!me && (
            <Card>
              <h2 className="text-xl font-bold"><Text message="Make a sealed offer" /></h2>
              <p className="mt-2 text-deep"><Text message={"Sign in to make an offer. Other buyers and the seller can't see the amount until the round closes."} /></p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/signin?next=/listing/${id}/offers`} className="btn btn-primary"><Text message="Sign in" /></Link>
                <Link href={`/signup?next=/listing/${id}/offers`} className="btn btn-secondary"><Text message="Create account" /></Link>
              </div>
            </Card>
          )}
          {me && !isSeller && (
            <Card>
              <h2 className="text-xl font-bold">{mine ? <Text message="Update your sealed offer" /> : <Text message="Make a sealed offer" />}</h2>
              {mine && <p className="text-sm text-ink-soft"><Text message="Your current offer: {amount}. Other buyers cannot see it." values={{ amount: formatMoney(mine.priceThb, locale) }} /></p>}
              <div className="mt-3"><OfferForm requestId={randomUUID()} roundId={round.id} listingId={id} /></div>
              <div className="mt-4"><TokenCheck defaultDepositThb={Math.round(listing.askingPriceThb * 0.1)} payWithinDays={30} context="your deposit" /></div>
            </Card>
          )}
          <Card>
            <h2 className="text-xl font-bold"><Text message="Offers received" /></h2>
            <p className="mt-2 text-4xl font-bold">{round.offerCount ?? offers.length}</p>
            <p className="text-ink-soft"><Text message="Amounts stay sealed until the round closes, including from the seller." /></p>
            {isSeller ? (
              <form action={closeRound} className="mt-3">
                <input type="hidden" name="roundId" value={round.id} />
                <input type="hidden" name="listingId" value={id} />
                <button type="submit" className="rounded-lg bg-ink px-4 py-3 font-semibold text-paper"><Text message="Close round and compare (demo: close early)" /></button>
              </form>
            ) : (
              <p className="mt-3 text-sm">Only the seller can close the round. In the demo, <Link href={`/signin?next=/listing/${id}/offers#personas`} className="underline">switch to Khun Malee</Link>.</p>
            )}
          </Card>
        </div>
      )}

      {round.status !== "open" && (
        <Card>
          <h2 className="text-xl font-bold"><Text message="Comparison by the published rules" /></h2>
          {round.aiSummary && <p className="mt-2 rounded-lg bg-mist p-3"><strong><Text message="AI summary:" /></strong> {round.aiSummary}</p>}
          <table className="mt-3 w-full text-start text-sm">
            <caption className="sr-only"><Text message="Offers ranked by the published criteria" /></caption>
            <thead><tr className="border-b border-line"><th scope="col" className="py-2"><Text message="Rank" /></th><th scope="col"><Text message="Buyer" /></th><th scope="col"><Text message="Price" /></th><th scope="col"><Text message="Funding" /></th><th scope="col"><Text message="Closing" /></th><th scope="col"><Text message="Conditions" /></th><th scope="col"><Text message="Score" /></th><th scope="col"><span className="sr-only"><Text message="Action" /></span></th></tr></thead>
            <tbody>
              {ranked.map((r, i) => (
                <tr key={r.offer.id} className="border-b border-line align-top">
                  <td className="py-2 font-bold">#{i + 1}</td>
                  <td>{isSeller || r.offer.buyerId === me?.id ? buyer(r.offer.buyerId) : <Text message="Buyer (private)" />}</td>
                  <td><Money amount={r.offer.priceThb} /></td>
                  <td><Label>{FUNDING_LABEL[r.offer.funding]}</Label></td>
                  <td><Text message="{days} days" values={{ days: r.offer.closingDays }} /></td>
                  <td>{r.offer.conditions || <Text message="None" />}</td>
                  <td className="font-semibold">{r.score}/100</td>
                  <td>
                    {round.status === "closed" && isSeller ? (
                      <form action={acceptOffer}>
                        <input type="hidden" name="requestId" value={randomUUID()} />
                        <input type="hidden" name="offerId" value={r.offer.id} />
                        <input type="hidden" name="listingId" value={id} />
                        <button type="submit" className="rounded bg-blue-ink px-3 py-2 font-semibold text-paper"><Text message="Accept" /></button>
                      </form>
                    ) : (
                      <span className={r.offer.status === "accepted" ? "font-semibold text-teal" : "text-ink-soft"}><Label>{r.offer.status}</Label></span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-soft"><Text message="Scores are calculated by code from the published weights. The seller may choose any offer; the decision is recorded in the transparency ledger." /></p>
        </Card>
      )}
    </article>
  );
}
