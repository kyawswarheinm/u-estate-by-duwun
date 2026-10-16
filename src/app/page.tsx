import { getPreferences } from "@/i18n/server";
import { translator, formatMoneyRef } from "@/i18n";
import { Label, Text } from "@/i18n/Text";
import { FavoriteButton } from "@/components/FavoriteButton";
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
  const { locale, currency } = await getPreferences();
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
      <section className="home-hero">
        <Image src="/photography/residence.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="hero-shade" />
        <div className="hero-copy">
          <p className="eyebrow"><Text message="heroEyebrow" /></p>
          <h1><Text message="heroTitle" /></h1>
          <p className="hero-description"><Text message="heroDescription" /></p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#homes" className="btn btn-on-dark"><Text message="exploreProperties" /> <span aria-hidden="true">&#8599;</span></a>
            <Link href="/assistant" className="btn btn-ghost-dark"><Text message="askEstate" /></Link>
          </div>
        </div>
        <p className="hero-caption"><Text message="editorialPhotography" /></p>
      </section>
      <form action="/market" method="get" role="search" className="spotlight-search">
        <label><span><Text message="searchLocation" /></span><input name="q" list="hero-places" placeholder={t("District or project, e.g. Sathorn")} /><datalist id="hero-places">{districts.map(d => <option key={d} value={d} />)}</datalist></label>
        <label><span><Text message="searchType" /></span><select name="type"><option value="">{t("searchAllTypes")}</option>{(["condo", "house", "townhouse", "building", "land"] as const).map(v => <option key={v} value={v}>{t(v)}</option>)}</select></label>
        <label><span><Text message="buyOrRent" /></span><select name="kind"><option value="sale">{t("sale")}</option><option value="rent">{t("rent")}</option></select></label>
        <label><span><Text message="maxPriceLabel" /></span><input name="maxPrice" type="number" min="1" step="1" placeholder={t("anyPrice")} /></label>
        <button className="btn btn-primary"><Text message="Search" /> <span aria-hidden="true">&#8599;</span></button>
      </form>
      <section className="values-grid" aria-label={t("valuesTitle")}>
        {([["01", "trustTitle", "trustDescription"], ["02", "transparencyTitle", "transparencyDescription"], ["03", "inclusivityTitle", "inclusivityDescription"]] as const).map(([n, title, description]) => <div key={n}><span className="value-number" aria-hidden="true">{n} /</span><h2><Text message={title} /></h2><p><Text message={description} /></p></div>)}
      </section>
      <nav aria-labelledby="browse-title" className="mb-10 grid gap-3">
        <h2 id="browse-title" className="section-title"><Text message="Browse by type" /></h2>
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
          <h2 id="homes-title" className="section-title"><Text message="Homes on U-Estate" /></h2>
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
              <li key={l.id} className="property-card panel relative flex flex-col overflow-hidden p-5 transition-colors hover:border-deep">
                <div className="relative -mx-5 -mt-5 mb-4 aspect-[16/10] bg-ice">
                  {photos[l.id] ? (
                    <Image src={photos[l.id]} alt="" fill unoptimized sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                  ) : (
                    <>
                      <MarketPropertyArt variant={artVariant(p.type, p.title)} className="h-full w-full" />
                    </>
                  )}
                </div>
                <FavoriteButton id={l.id} />
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
                  {l.cobuyEnabled && <span className="pill bg-ice text-blue-ink"><Text message="Co-buy open to members" /></span>}
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
      <section className="fee-story">
        <div><p className="eyebrow text-muted"><Text message="transparencyTitle" /></p><h2><Text message="Same facts. Same fees. For every party." /></h2><p className="mt-5 text-muted"><Text message="homeDescription" /></p><Link href="/sell" className="btn btn-primary mt-6"><Text message="Sell a property" /> &#8599;</Link></div>
          <figure className="rounded-[16px] bg-paper p-6 text-ink shadow-[var(--shadow-lg)]">
            <figcaption>
              <p className="font-semibold"><Text message="Who pays what on a {price} condo" values={{ price: formatMoneyRef(EXAMPLE_PRICE, locale, currency) }} /></p>
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
      </section>
      <details className="voice-search-disclosure"><summary><Text message="voiceDiscovery" /></summary><div className="mt-5"><VoiceSearch /></div></details>
    </>
  );
}
