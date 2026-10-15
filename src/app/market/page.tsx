import { getTranslations } from "@/i18n/server";
import { MarketMapLazy } from "@/components/MarketMapLazy";
import type { MapExternalListing, MapUEstateListing } from "@/components/MarketMap";
import { MARKET_LISTINGS } from "@/lib/market-data";
import { districtCentre } from "@/lib/market-data/district-centres";
import { readDb } from "@/lib/store";

// Market intelligence page (P3T03 map; P3T04 adds filters, stats, forecast and tables). Reads the offline snapshots only.
export const metadata = { title: "Market" };

export default async function MarketPage() {
  const [t, db] = await Promise.all([getTranslations(), readDb()]);

  const external: MapExternalListing[] = MARKET_LISTINGS.listings
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) => ({
      id: l.id, site: l.site, sourceUrl: l.source_url, kind: l.kind, type: l.type, project: l.project, district: l.district,
      lat: l.lat!, lng: l.lng!, priceThb: l.price_thb, areaSqm: l.area_sqm, pricePerSqm: l.price_per_sqm, listedAt: l.listed_at,
    }));

  const uestate: MapUEstateListing[] = db.listings
    .filter((l) => !l.archivedAt && l.status !== "sold")
    .flatMap((l) => {
      const p = db.properties.find((x) => x.id === l.propertyId);
      const c = p ? districtCentre(p.district) : null;
      return p && c ? [{ id: l.id, title: p.title, district: p.district, kind: l.kind, priceThb: l.askingPriceThb, areaSqm: p.areaSqm, lat: c.lat, lng: c.lng }] : [];
    });

  return (
    <article className="grid gap-4">
      <header>
        <h1 className="font-display text-4xl font-semibold">{t("Market map")}</h1>
        {MARKET_LISTINGS.meta.is_sample && <span className="mt-2 inline-block rounded-full bg-amber-soft px-3 py-1 text-xs font-semibold text-amber">SAMPLE</span>}
      </header>
      <MarketMapLazy external={external} uestate={uestate} isSample={MARKET_LISTINGS.meta.is_sample} />
    </article>
  );
}
