import Link from "next/link";
import { readDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { agentSaleFee, sellerFee, thb } from "@/lib/rules";
import { VerificationBadge } from "@/components/ui";
import { VoiceSearch } from "@/components/VoiceSearch";

const EXAMPLE_PRICE = 4_000_000;

export default async function Home() {
  const [db, me] = await Promise.all([readDb(), currentUser()]);
  const active = db.listings.filter((l) => l.status !== "sold" && !l.archivedAt);

  // The hero's centrepiece: the real fee rule on a ฿4M sale, computed by the same code as every listing.
  const fees = [
    { who: "Typical agent (3%)", thb: agentSaleFee(EXAMPLE_PRICE), tone: "bg-silver" },
    { who: "U-Estate seller fee (1.5%)", thb: sellerFee(EXAMPLE_PRICE, false), tone: "bg-blue" },
    { who: "U-topia member (0.75%)", thb: sellerFee(EXAMPLE_PRICE, true), tone: "bg-blue" },
    { who: "Buyer pays U-Estate", thb: 0, tone: "bg-blue" },
  ];
  const max = fees[0].thb;

  return (
    <>
      <section className="-mt-8 mx-[calc(50%-50vw)] bg-midnight px-4 pb-24 pt-14 text-ice sm:pt-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <h1 className="font-display text-5xl font-semibold leading-[1.05] sm:text-6xl">Same facts. Same fees. For every party.</h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-silver">
              Every listing shows its deed check, an honest price range with sources, and exactly who pays what.
              Offers are compared by rules the seller publishes first. U-topia members can co-buy, legally.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#homes" className="btn btn-on-dark">Find a home</a>
              <Link href="/sell" className="btn btn-ghost-dark">Sell a property</Link>
              {!me && <Link href="/signup" className="btn btn-ghost-dark">Create account</Link>}
            </div>
          </div>

          <figure className="rounded-[16px] bg-white p-6 text-midnight shadow-[0_25px_70px_rgba(0,0,0,.25)]">
            <figcaption>
              <p className="font-semibold">Who pays what on a {thb(EXAMPLE_PRICE)} condo</p>
              <p className="text-sm text-deep">The same rule is printed on every listing.</p>
            </figcaption>
            <ul className="mt-5 grid gap-4">
              {fees.map((f) => (
                <li key={f.who}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm">{f.who}</span>
                    <span className="text-lg font-bold">{thb(f.thb)}</span>
                  </div>
                  <div className="mt-1.5 h-2.5 rounded-full bg-ice" aria-hidden="true">
                    <div className={`h-2.5 rounded-full ${f.tone}`} style={{ width: `${Math.max(1.5, (f.thb / max) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-deep">Excludes government transfer fees and taxes. Typical agent fee is common market practice, not a quote.</p>
          </figure>
        </div>
      </section>

      <div className="relative -mt-14">
        <VoiceSearch />
      </div>

      <section id="homes" aria-labelledby="homes-title" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="homes-title" className="text-2xl font-bold">Homes on U-Estate</h2>
          <p className="text-sm text-deep">{active.length} listing{active.length === 1 ? "" : "s"} · demo data</p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((l) => {
            const p = db.properties.find((x) => x.id === l.propertyId)!;
            const mine = me?.id === l.sellerId;
            return (
              <li key={l.id} className="panel relative flex flex-col p-5 transition-colors hover:border-deep">
                <div className="flex items-center justify-between gap-2 text-sm text-deep">
                  <span className="capitalize">{p.type} for {l.kind}</span>
                  {mine && <span className="pill bg-ice text-midnight">Your listing</span>}
                </div>
                <h3 className="mt-2 text-lg font-bold leading-snug">
                  <Link href={`/listing/${l.id}`} className="after:absolute after:inset-0 hover:underline">{p.title}</Link>
                </h3>
                <p className="text-sm text-deep">{p.district}, {p.province} · {p.areaSqm} m²</p>
                <p className="mt-3 text-2xl font-bold">
                  {thb(l.askingPriceThb)}{l.kind === "rent" && <span className="text-base font-normal"> / month</span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <VerificationBadge status={l.verificationStatus} />
                  {l.cobuyEnabled && <span className="pill bg-[#eaf2ff] text-blue-ink">Co-buy open to members</span>}
                </div>
                {l.kind === "sale" && (
                  <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-ice pt-3 text-sm">
                    <dt className="text-deep">Seller fee here</dt>
                    <dd className="font-semibold">{thb(sellerFee(l.askingPriceThb, false))}</dd>
                    <dt className="text-deep">Typical agent</dt>
                    <dd>{thb(agentSaleFee(l.askingPriceThb))}</dd>
                    <dt className="text-deep">Buyer pays us</dt>
                    <dd className="font-semibold">฿0</dd>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
