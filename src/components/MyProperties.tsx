import { Text } from "@/i18n/Text";
import { Money } from "@/components/Money";
import Link from "next/link";
import { openOfferRound } from "@/app/sell/actions";
import { VerificationBadge } from "./ui";
import type { DB } from "@/lib/types";

const STATUS = { active: "Live", under_offer: "Under offer", sold: "Sold" } as const;

/** The signed-in owner's listings with what is happening on each one. */
export function MyProperties({ db, userId, compact = false }: { db: DB; userId: string; compact?: boolean }) {
  const mine = db.listings
    .filter((l) => l.sellerId === userId)
    .map((l) => {
      const p = db.properties.find((x) => x.id === l.propertyId)!;
      const round = db.offerRounds.find((r) => r.listingId === l.id);
      const offers = round ? db.offers.filter((o) => o.roundId === round.id).length : 0;
      const group = db.cobuyGroups.find((g) => g.listingId === l.id && g.status !== "cancelled");
      return { l, p, round, offers, group };
    })
    .sort((a, b) => b.l.createdAt.localeCompare(a.l.createdAt));

  if (mine.length === 0) {
    return (
      <div className="panel grid justify-items-start gap-3 p-6">
        <h3 className="text-lg font-bold"><Text message={"You haven't listed a property yet"} /></h3>
        <p className="text-deep"><Text message="List a condo, house, townhouse or land in about two minutes. Buyers see the same facts and fees you do." /></p>
        <Link href="/sell" className="btn btn-primary"><Text message="List a property" /></Link>
      </div>
    );
  }

  return (
    <ul className="grid gap-3">
      {mine.map(({ l, p, round, offers, group }) => (
        <li key={l.id} className="panel grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <p className="text-sm text-deep">{p.type} in {p.district}, {p.province} · {p.areaSqm} m² · for {l.kind}</p>
            <h3 className="truncate text-lg font-bold">
              <Link href={`/listing/${l.id}`} className="hover:underline"><bdi>{p.title}</bdi></Link>
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xl font-bold"><Money amount={l.askingPriceThb} />{l.kind === "rent" && <span className="text-sm font-normal"><Text message=" / month" /></span>}</span>
              <span className="pill bg-ice text-midnight">{STATUS[l.status]}</span>
              <VerificationBadge status={l.verificationStatus} />
            </div>
            {!compact && (
              <p className="mt-2 text-sm text-deep">
                {round ? `FairOffer room ${round.status}: ${offers} sealed offer${offers === 1 ? "" : "s"}` : "No offer room yet"}
                {group && ` · Co-buy group ${group.status}`}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Link href={`/listing/${l.id}`} className="btn btn-secondary"><Text message="View" /></Link>
            {l.verificationStatus !== "verified_sample" && <Link href={`/sell?listing=${l.id}#deed`} className="btn btn-secondary"><Text message="Check deed" /></Link>}
            {l.kind === "sale" &&
              (round ? (
                <Link href={`/listing/${l.id}/offers`} className="btn btn-primary">Offers ({offers})</Link>
              ) : (
                <form action={openOfferRound}>
                  <input type="hidden" name="listingId" value={l.id} />
                  <button type="submit" className="btn btn-primary"><Text message="Open offer room" /></button>
                </form>
              ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
