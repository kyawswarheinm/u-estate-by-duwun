import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatMoney, formatNumber, type MessageKey } from "@/i18n";
import { getPreferences, getTranslations } from "@/i18n/server";
import { TYPE_LABEL } from "@/components/MarketExplorer";
import { UPalPageContext } from "@/components/upal/UPalProvider";
import { availabilityShown, googleMapsLink, isStale, REAL_LISTINGS } from "@/lib/listings";

// One real third-party listing: every stated fact, "Not provided" for the rest, where it came from and how sure we are.
export const metadata = { title: "Listing details" };

const FURNISHING: Record<string, MessageKey> = { furnished: "Furnished", partly_furnished: "Partly furnished", unfurnished: "Unfurnished" };
const AMENITY: Record<string, MessageKey> = {
  pool: "Swimming pool", gym: "Gym", security: "Security", elevator: "Elevator", parking: "Parking", balcony: "Balcony",
  air_conditioning: "Air conditioning", pet_friendly: "Pet-friendly", coworking: "Co-working space", laundry: "Laundry",
};
const SOURCE_KIND: Record<string, MessageKey> = { owner: "the owner", agency: "an agency", licensed_feed: "a licensed data feed" };
const MAPS_LABEL = { exact: "View on Google Maps", project: "Project on Google Maps", area: "Area on Google Maps" } as const;

export default async function RealListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = REAL_LISTINGS.listings.find((x) => x.id === id);
  if (!l) notFound();
  const [t, { locale, currency }] = await Promise.all([getTranslations(), getPreferences()]);
  const money = (thb: number) => formatMoney(thb, locale, currency);
  const maps = googleMapsLink({ lat: l.lat, lng: l.lng, precision: l.geo_precision, project: l.address_or_project, district: l.district, province: l.province });
  const availability = availabilityShown(l);
  const none = t("Not provided");
  const facts: [string, string][] = [
    [t("Property type"), t(TYPE_LABEL[l.type] ?? "Other")],
    [t("Bedrooms"), l.bedrooms != null ? formatNumber(l.bedrooms, locale) : none],
    [t("Bathrooms"), l.bathrooms != null ? formatNumber(l.bathrooms, locale) : none],
    [t("Floor area (m²)"), l.area_sqm != null ? formatNumber(l.area_sqm, locale) : none],
    [t("Furnishing"), l.furnishing ? t(FURNISHING[l.furnishing]) : none],
    [t("Amenities"), l.amenities.length ? l.amenities.map((a) => t(AMENITY[a])).join(", ") : none],
    [t("Project or address"), l.address_or_project ?? none],
    [t("Neighbourhood"), l.neighborhood ?? none],
    [t("District"), l.district],
    [t("Province"), l.province],
  ];

  return (
    <article className="mx-auto grid max-w-4xl gap-6">
      <UPalPageContext facts={{
        third_party_listing_id: l.id, name: l.name, type: l.type, for: l.kind, [l.kind === "rent" ? "rent_thb_per_month" : "asking_price_thb"]: l.price_thb,
        district: l.district, province: l.province, availability, verification: l.verification, source: l.source.name,
      }} />
      <Link href={`/market${l.kind === "rent" ? "?mode=rent" : ""}`} className="text-sm font-semibold text-deep underline">← {t("Back to the market")}</Link>

      {l.photos.length > 0 && (
        <figure className="grid gap-2">
          <div className="relative aspect-[16/9] overflow-hidden rounded-[22px] bg-ice">
            <Image src={l.photos[0].url} alt="" fill unoptimized sizes="(min-width: 1024px) 896px, 100vw" className="object-cover" />
          </div>
          <figcaption className="caption">© {l.photos[0].credit} · {l.photos[0].license}</figcaption>
        </figure>
      )}

      <header className="grid gap-2">
        <ul className="flex flex-wrap gap-1.5 text-xs font-semibold">
          <li className="pill bg-white text-deep">{t("Third-party listing")}</li>
          {l.verification === "uestate_verified" ? <li className="pill bg-teal-soft text-teal">✓ {t("U-Estate verified")}</li> : <li className="pill bg-ice text-deep">{t("Not independently verified")}</li>}
          {availability !== "available" && <li className="pill bg-amber-soft text-amber">! {availability === "unavailable" ? t("No longer available") : t("Availability unconfirmed")}</li>}
        </ul>
        <h1 className="page-title"><bdi>{l.name}</bdi></h1>
        <p className="price">
          {money(l.price_thb)}
          {l.kind === "rent" && <span className="text-base font-medium text-deep"> / {t("month")}</span>}
        </p>
        <p className="lead"><bdi>{[l.neighborhood, l.district, l.province].filter(Boolean).join(", ")}</bdi></p>
      </header>

      <div className="flex flex-wrap gap-2">
        {maps ? (
          <a href={maps.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary">{t(MAPS_LABEL[maps.precision])} ↗</a>
        ) : (
          <span className="btn btn-secondary cursor-not-allowed opacity-60" aria-disabled="true">{t("Location unavailable")}</span>
        )}
        {l.source.url && <a href={l.source.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">{t("View original listing")} ↗</a>}
      </div>
      {maps?.precision === "area" && <p className="caption">{t("The map link shows the area, not the exact building.")}</p>}

      <section aria-labelledby="facts-title" className="surface-card grid gap-3 p-6">
        <h2 id="facts-title" className="section-title">{t("Details")}</h2>
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts.map(([k, v]) => (
            <div key={k} className="grid gap-0.5 border-b border-line pb-2">
              <dt className="text-sm text-deep">{k}</dt>
              <dd className={v === none ? "text-blue-grey" : "font-medium"}>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="source-title" className="surface-card grid gap-2 p-6">
        <h2 id="source-title" className="section-title">{t("Source")}</h2>
        <p>{t("Listed by {name}, published on U-Estate with permission from {who}.", { name: l.source.name, who: t(SOURCE_KIND[l.source.kind]) })}</p>
        <p className="caption">
          {t("Retrieved {date}.", { date: l.retrieved_at })}{" "}
          {l.last_verified_at ? t("Last verified {date}.", { date: l.last_verified_at }) : t("Not verified since import.")}{" "}
          {isStale(l) && t("Needs a fresh check before you rely on it.")}
        </p>
        {l.source.url && l.link_status === "broken" && <p className="caption text-amber">{t("The original listing link no longer works.")}</p>}
        <p className="caption">{t("Asking price stated by the source, not a sale price or valuation. Confirm details with the lister, and ownership at the Land Office.")}</p>
      </section>
    </article>
  );
}
