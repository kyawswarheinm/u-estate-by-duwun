import { getPreferences } from "@/i18n/server";
import { formatMoney, translator } from "@/i18n";
import { Label, Text } from "@/i18n/Text";
import { Money } from "@/components/Money";
import Link from "next/link";
import { readDb } from "@/lib/store";
import { currentUser } from "@/lib/session";
import { agentSaleFee, sellerFee } from "@/lib/rules";
import { VerificationBadge } from "@/components/ui";
import { VoiceSearch } from "@/components/VoiceSearch";
import Image from "next/image";
import { MarketPropertyArt, artVariant } from "@/components/MarketPropertyArt";
import { coverPhotos } from "@/app/market/cover-photos";

const EXAMPLE_PRICE = 4_000_000;

export default async function Home() {
  const { locale } = await getPreferences();
  const t = translator(locale);
  const [db, me] = await Promise.all([readDb(), currentUser()]);
  const active = db.listings.filter((l) => l.status !== "sold" && !l.archivedAt);
  const photos = await coverPhotos(active.map((l) => l.id));
  const districts = [...new Set(db.properties.map((p) => p.district))].sort();

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
            <h1 className="font-display text-5xl font-semibold leading-[1.05] sm:text-6xl"><Text message="Same facts. Same fees. For every party." /></h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-silver">
              <Text message="homeDescription" />
            </p>
            {/* Location search: opens the market map and cards at that place (works without JavaScript). */}
            <form action="/market" method="get" role="search" className="mt-7 grid max-w-xl gap-2">
              <label htmlFor="hero-q" className="font-semibold text-white"><Text message="Where do you want to live?" /></label>
              <div className="flex gap-2 rounded-[14px] bg-white p-1.5 shadow-[0_15px_40px_rgba(0,0,0,.25)]">
                <input id="hero-q" name="q" list="hero-places" autoComplete="off" placeholder={t("District or project, e.g. Sathorn")} className="min-h-12 min-w-0 flex-1 rounded-[10px] px-3 text-midnight outline-offset-2" />
                <datalist id="hero-places">{districts.map((d) => <option key={d} value={d} />)}</datalist>
                <button type="submit" className="btn btn-primary"><Text message="Search" /></button>
              </div>
            </form>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#homes" className="btn btn-on-dark"><Text message="Find a home" /></a>
              <Link href="/sell" className="btn btn-ghost-dark"><Text message="Sell a property" /></Link>
              {!me && <Link href="/signup" className="btn btn-ghost-dark"><Text message="Create account" /></Link>}
            </div>
          </div>

          <figure className="rounded-[16px] bg-white p-6 text-midnight shadow-[0_25px_70px_rgba(0,0,0,.25)]">
            <figcaption>
              <p className="font-semibold"><Text message="Who pays what on a {price} condo" values={{ price: formatMoney(EXAMPLE_PRICE, locale) }} /></p>
              <p className="text-sm text-deep"><Text message="The same rule is printed on every listing." /></p>
            </figcaption>
            <ul className="mt-5 grid gap-4">
              {fees.map((f) => (
                <li key={f.who}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm"><Label>{f.who}</Label></span>
                    <span className="text-lg font-bold"><Money amount={f.thb} /></span>
                  </div>
                  <div className="mt-1.5 h-2.5 rounded-full bg-ice" aria-hidden="true">
                    <div className={`h-2.5 rounded-full ${f.tone}`} style={{ width: `${Math.max(1.5, (f.thb / max) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-xs text-deep"><Text message="Excludes government transfer fees and taxes. Typical agent fee is common market practice, not a quote." /></p>
          </figure>
        </div>
      </section>

      <div className="relative -mt-14">
        <VoiceSearch />
      </div>

      <nav aria-labelledby="browse-title" className="mb-10 grid gap-3">
        <h2 id="browse-title" className="text-2xl font-bold"><Text message="Browse by type" /></h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([["condo", "Condo", "condo"], ["house", "House", "house"], ["townhouse", "Townhouse", "townhouse"], ["building", "Building", "office"]] as const).map(([type, label, art]) => (
            <li key={type}>
              <Link href={`/market?type=${type}`} className="panel block overflow-hidden no-underline transition-colors hover:border-deep">
                <MarketPropertyArt variant={art} className="aspect-[16/9] h-auto w-full" />
                <span className="block p-3 font-semibold"><Label>{label}</Label></span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <section id="homes" aria-labelledby="homes-title" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h2 id="homes-title" className="text-2xl font-bold"><Text message="Homes on U-Estate" /></h2>
          <p className="flex flex-wrap items-center gap-3 text-sm text-deep">
            <Text message="{count} listings · demo data" values={{ count: active.length }} />
            <Link href="/market" className="font-semibold"><Text message="See them on the map" /></Link>
          </p>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {active.map((l) => {
            const p = db.properties.find((x) => x.id === l.propertyId)!;
            const mine = me?.id === l.sellerId;
            return (
              <li key={l.id} className="panel relative flex flex-col overflow-hidden p-5 transition-colors hover:border-deep">
                <div className="relative -mx-5 -mt-5 mb-4 aspect-[16/10] bg-ice">
                  {photos[l.id] ? (
                    <Image src={photos[l.id]} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                  ) : (
                    <>
                      <MarketPropertyArt variant={artVariant(p.type, p.title)} className="h-full w-full" />
                      <span className="absolute bottom-2 start-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-deep"><Text message="Illustration" /></span>
                    </>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-sm text-deep">
                  <span className="capitalize"><Text message="{type} for {kind}" values={{ type: t(p.type), kind: t(l.kind) }} /></span>
                  {mine && <span className="pill bg-ice text-midnight"><Text message="Your listing" /></span>}
                </div>
                <h3 className="mt-2 text-lg font-bold leading-snug">
                  <Link href={`/listing/${l.id}`} className="after:absolute after:inset-0 hover:underline"><bdi>{p.title}</bdi></Link>
                </h3>
                <p className="text-sm text-deep">{p.district}, {p.province} · {p.areaSqm} m²</p>
                <p className="mt-3 text-2xl font-bold">
                  <Money amount={l.askingPriceThb} />{l.kind === "rent" && <span className="text-base font-normal"><Text message=" / month" /></span>}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <VerificationBadge status={l.verificationStatus} />
                  {l.cobuyEnabled && <span className="pill bg-[#eaf2ff] text-blue-ink"><Text message="Co-buy open to members" /></span>}
                </div>
                {l.kind === "sale" && (
                  <dl className="mt-4 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 border-t border-ice pt-3 text-sm">
                    <dt className="text-deep"><Text message="Seller fee here" /></dt>
                    <dd className="font-semibold"><Money amount={sellerFee(l.askingPriceThb, false)} /></dd>
                    <dt className="text-deep"><Text message="Typical agent" /></dt>
                    <dd><Money amount={agentSaleFee(l.askingPriceThb)} /></dd>
                    <dt className="text-deep"><Text message="Buyer pays us" /></dt>
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
