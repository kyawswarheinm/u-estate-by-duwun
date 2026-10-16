import Link from "next/link";
import { formatMoneyRef, formatNumber } from "@/i18n";
import { getPreferences, getTranslations } from "@/i18n/server";
import { MarketExplorer, TYPE_LABEL, type MarketCard } from "@/components/MarketExplorer";
import { MarketFilters } from "@/components/MarketFilters";
import { MarketForecastChart } from "@/components/MarketForecastChart";
import type { MapExternalListing, MapUEstateListing } from "@/components/MarketMap";
import { artVariant } from "@/components/MarketPropertyArt";
import { RentAffordability } from "@/components/RentAffordability";
import { UPalPageContext } from "@/components/upal/UPalProvider";
import { availabilityShown, googleMapsLink, REAL_LISTINGS } from "@/lib/listings";
import { MARKET_FORECAST, MARKET_LISTINGS, MARKET_STATS, MarketType } from "@/lib/market-data";
import { getMarketStats, getPriceForecast } from "@/lib/market-data/analytics";
import { districtCentre, safeSourceUrl } from "@/lib/market-data/district-centres";
import { hasFilters, LISTING_TYPES, matchesSearch, parseMarketSearch, rentStats, searchHref } from "@/lib/market-search";
import { COBUY } from "@/lib/rules";
import { readDb } from "@/lib/store";
import { coverPhotos } from "./cover-photos";

// Market page (P3T03 + P3T04, D-42): Buy or Rent, one search state in the URL, listings beside the map, then the
// statistics for that mode. Every number comes from code. Three kinds of listing, always labelled:
// U-Estate listings first, then real third-party listings imported with permission (src/data/market/verified-listings.json),
// then the synthetic SAMPLE snapshot, hidden unless the user switches it on. Sale statistics computed from SAMPLE rows are
// hidden with it. The sale-price forecast (a real Bank of Thailand index) never appears in Rent mode.
export const metadata = { title: "Market" };

// Real snapshots hold hundreds of rows: cards, map markers and the table show one page of other listings.
const PAGE_SIZE = 24;

export default async function MarketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = parseMarketSearch(await searchParams);
  const [t, { locale, currency }, db] = await Promise.all([getTranslations(), getPreferences(), readDb()]);
  const money = (thb: number) => formatMoneyRef(thb, locale, currency);
  const rent = search.mode === "rent";
  const snapshotIsSample = MARKET_LISTINGS.meta.is_sample;
  const showSnapshot = !snapshotIsSample || search.sample;

  // U-Estate listings (first). No stored coordinates yet: the map shows them at their district centre, labelled.
  const ours = db.listings
    .filter((l) => !l.archivedAt && l.status !== "sold")
    .flatMap((l) => {
      const p = db.properties.find((x) => x.id === l.propertyId);
      return p ? [{ l, p }] : [];
    })
    .filter(({ l, p }) => matchesSearch(search, { kind: l.kind, type: p.type, priceThb: l.askingPriceThb, areaSqm: p.areaSqm, district: p.district, province: p.province, name: p.title }));
  const photos = await coverPhotos(ours.map(({ l }) => l.id));

  // Real third-party listings, never marked available unless recently verified.
  const listed = REAL_LISTINGS.listings.filter((l) =>
    matchesSearch(search, {
      kind: l.kind, type: l.type, priceThb: l.price_thb, areaSqm: l.area_sqm, district: l.district, province: l.province,
      name: [l.name, l.address_or_project, l.neighborhood].filter(Boolean).join(" "), bedrooms: l.bedrooms, bathrooms: l.bathrooms, furnishing: l.furnishing, amenities: l.amenities,
    }));

  // The P1 snapshot (SAMPLE today): only when it is real data or the user asked for samples.
  const allSnapshot = showSnapshot
    ? MARKET_LISTINGS.listings.filter((l) =>
        matchesSearch(search, { kind: l.kind, type: l.type, priceThb: l.price_thb, areaSqm: l.area_sqm, district: l.district, province: l.province, name: l.project ?? "", bedrooms: l.bedrooms }))
    : [];
  const pages = Math.max(1, Math.ceil(allSnapshot.length / PAGE_SIZE));
  const pageNo = Math.min(pages, search.page);
  const snapshot = allSnapshot.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
  const snapshotOrigin = snapshotIsSample ? ("sample" as const) : ("listed" as const);
  const snapshotSource = MARKET_LISTINGS.meta.sites.map((s) => s.name).join(", ");

  const uestate: MapUEstateListing[] = ours.flatMap(({ l, p }) => {
    const c = districtCentre(p.district);
    const maps = googleMapsLink({ district: p.district, province: p.province });
    return c ? [{ id: l.id, title: p.title, district: p.district, kind: l.kind, priceThb: l.askingPriceThb, areaSqm: p.areaSqm, lat: c.lat, lng: c.lng, mapsUrl: maps?.url ?? null }] : [];
  });
  const listedMaps = new Map(listed.map((l) => [l.id, googleMapsLink({ lat: l.lat, lng: l.lng, precision: l.geo_precision, project: l.address_or_project, district: l.district, province: l.province })]));
  const snapshotMaps = new Map(snapshot.map((l) => [l.id, googleMapsLink({ lat: l.lat, lng: l.lng, precision: l.geo_precision, project: l.project, district: l.district, province: l.province })]));
  // Snapshot source links are kept only when they point at a real listing page (a fixture's provenance file is not one).
  const snapshotOriginal = (url: string) => (snapshotIsSample ? null : safeSourceUrl(url));

  const external: MapExternalListing[] = [
    // Real listings go on the map only with verified coordinates (exact or project level).
    ...(pageNo === 1 ? listed : [])
      .filter((l) => l.lat != null && l.lng != null && (l.geo_precision === "exact" || l.geo_precision === "project"))
      .map((l) => ({
        id: l.id, origin: "listed" as const, title: l.name, sourceName: l.source.name, kind: l.kind, district: l.district, lat: l.lat!, lng: l.lng!, approximate: false,
        priceThb: l.price_thb, areaSqm: l.area_sqm, pricePerSqm: l.area_sqm ? Math.round(l.price_thb / l.area_sqm) : null, updatedAt: l.last_verified_at ?? l.retrieved_at,
        mapsUrl: listedMaps.get(l.id)?.url ?? null, originalUrl: l.source.url, detailHref: `/market/${l.id}`,
      })),
    ...snapshot
      .filter((l) => l.lat != null && l.lng != null)
      .map((l) => ({
        id: l.id, origin: snapshotOrigin, title: l.project ?? t(TYPE_LABEL[l.type]), sourceName: snapshotSource, kind: l.kind, district: l.district, lat: l.lat!, lng: l.lng!,
        approximate: l.geo_precision === "district", priceThb: l.price_thb, areaSqm: l.area_sqm, pricePerSqm: l.price_per_sqm, updatedAt: l.listed_at,
        mapsUrl: snapshotMaps.get(l.id)?.url ?? null, originalUrl: snapshotOriginal(l.source_url), detailHref: null,
      })),
  ];
  const onMap = new Set([...uestate.map((x) => x.id), ...external.map((x) => x.id)]);
  const cards: MarketCard[] = [
    ...(pageNo === 1 ? ours : []).map(({ l, p }) => {
      const maps = googleMapsLink({ district: p.district, province: p.province });
      return {
        id: l.id, source: "uestate" as const, title: p.title, district: p.district, province: p.province, kind: l.kind, type: p.type,
        priceThb: l.askingPriceThb, areaSqm: p.areaSqm, pricePerSqm: Math.round(l.askingPriceThb / p.areaSqm), bedrooms: null, bathrooms: null, furnishing: null,
        detailHref: `/listing/${l.id}`, mapsUrl: maps?.url ?? null, mapsPrecision: maps?.precision ?? null, originalUrl: null,
        sourceName: "U-Estate", updatedAt: l.createdAt.slice(0, 10), availability: null, verified: l.verificationStatus === "verified_sample",
        photoUrl: photos[l.id] ?? null, photoCredit: null, art: artVariant(p.type, p.title), onMap: onMap.has(l.id),
      };
    }),
    ...(pageNo === 1 ? listed : []).map((l) => {
      const maps = listedMaps.get(l.id);
      return {
        id: l.id, source: "listed" as const, title: l.name, district: [l.neighborhood, l.district].filter(Boolean).join(", "), province: l.province, kind: l.kind, type: l.type,
        priceThb: l.price_thb, areaSqm: l.area_sqm, pricePerSqm: l.area_sqm ? Math.round(l.price_thb / l.area_sqm) : null,
        bedrooms: l.bedrooms, bathrooms: l.bathrooms, furnishing: l.furnishing,
        detailHref: `/market/${l.id}`, mapsUrl: maps?.url ?? null, mapsPrecision: maps?.precision ?? null, originalUrl: l.source.url,
        sourceName: l.source.name, updatedAt: l.last_verified_at ?? l.retrieved_at, availability: availabilityShown(l), verified: l.verification === "uestate_verified",
        photoUrl: l.photos[0]?.url ?? null, photoCredit: l.photos[0]?.credit ?? null, art: artVariant(l.type === "condo" || l.type === "house" || l.type === "townhouse" || l.type === "land" ? l.type : "condo"), onMap: onMap.has(l.id),
      };
    }),
    ...snapshot.map((l) => {
      const maps = snapshotMaps.get(l.id);
      return {
        id: l.id, source: snapshotOrigin, title: l.project ?? t(TYPE_LABEL[l.type]), district: l.district, province: l.province, kind: l.kind, type: l.type,
        priceThb: l.price_thb, areaSqm: l.area_sqm, pricePerSqm: l.price_per_sqm, bedrooms: l.bedrooms, bathrooms: null, furnishing: null,
        detailHref: null, mapsUrl: maps?.url ?? null, mapsPrecision: maps?.precision ?? null, originalUrl: snapshotOriginal(l.source_url),
        sourceName: snapshotSource, updatedAt: l.listed_at, availability: "unconfirmed" as const, verified: false,
        photoUrl: null, photoCredit: null, art: artVariant(l.type), onMap: onMap.has(l.id),
      };
    }),
  ];

  // Sale statistics and forecast are about one market type: the single chosen type, or condos.
  const one = search.types.length === 1 ? MarketType.safeParse(search.types[0]) : null;
  const statsType: MarketType = one?.success ? one.data : "condo";
  const statsAreSample = MARKET_STATS.meta.is_sample;
  const showSaleStats = !statsAreSample || search.sample;
  const overview = getMarketStats({ type: statsType, kind: "sale" });
  const saleRows = showSaleStats
    ? [
        ...overview.districts_available.map((d) => getMarketStats({ type: statsType, kind: "sale", district: d }).area).filter((r) => r !== null),
        ...(overview.all_districts ? [overview.all_districts] : []),
      ]
    : [];
  const forecast = getPriceForecast({ type: statsType });
  const series = MARKET_FORECAST.series.find((s) => s.type === statsType);
  const showForecast = !MARKET_FORECAST.meta.is_sample || search.sample;

  // Rent statistics: computed here from the rental listings shown (U-Estate, real third-party, and SAMPLE when on).
  const rentals = rent
    ? rentStats([
        ...ours.map(({ l, p }) => ({ district: p.district, priceThb: l.askingPriceThb, areaSqm: p.areaSqm })),
        ...listed.map((l) => ({ district: l.district, priceThb: l.price_thb, areaSqm: l.area_sqm })),
        ...allSnapshot.map((l) => ({ district: l.district, priceThb: l.price_thb, areaSqm: l.area_sqm })),
      ], MARKET_STATS.meta.min_count)
    : null;

  const districts = [...new Set([...db.properties.map((p) => p.district), ...REAL_LISTINGS.listings.map((l) => l.district), ...MARKET_LISTINGS.listings.map((l) => l.district)])].sort();
  const provinces = [...new Set([...db.properties.map((p) => p.province), ...REAL_LISTINGS.listings.map((l) => l.province), ...MARKET_LISTINGS.listings.map((l) => l.province)])].sort();
  // Filter options follow the data: only types, room counts, furnishing and amenities some listing actually records.
  const presentTypes = new Set<string>([...db.properties.map((p) => p.type), ...REAL_LISTINGS.listings.map((l) => l.type), ...(showSnapshot ? MARKET_LISTINGS.listings.map((l) => l.type) : [])]);
  const available = {
    types: LISTING_TYPES.filter((ty) => presentTypes.has(ty) || search.types.includes(ty)),
    beds: REAL_LISTINGS.listings.some((l) => l.bedrooms != null) || (showSnapshot && MARKET_LISTINGS.listings.some((l) => l.bedrooms != null)),
    baths: REAL_LISTINGS.listings.some((l) => l.bathrooms != null),
    furnishing: REAL_LISTINGS.listings.some((l) => l.furnishing != null),
    amenities: [...new Set(REAL_LISTINGS.listings.flatMap((l) => l.amenities))].sort(),
  };
  const anySample = search.sample && snapshotIsSample;
  const area = search.district || search.q || t("Bangkok and vicinity");
  const question = rent
    ? t("What do rentals cost in {area}?", { area })
    : t("How are {type} prices in {area}?", { type: t(statsType), area });
  const filtered = hasFilters(search);
  const total = ours.length + listed.length + allSnapshot.length;
  const sampleCount = snapshotIsSample ? MARKET_LISTINGS.listings.filter((l) => l.kind === (rent ? "rent" : "sale")).length : 0;

  return (
    <article className="grid gap-8">
      <UPalPageContext facts={{
        mode: search.mode, search: search.q || null, province: search.province || "all", district: search.district || "all",
        property_types: search.types.length ? search.types.join(", ") : "all",
        [rent ? "min_rent_thb_per_month" : "min_price_thb"]: search.minPrice,
        [rent ? "max_rent_thb_per_month" : "max_price_thb"]: search.maxPrice,
        min_area_sqm: search.minArea, max_area_sqm: search.maxArea, min_bedrooms: search.minBeds, min_bathrooms: search.minBaths,
        furnishing: search.furnishing, amenities: search.amenities.length ? search.amenities.join(", ") : null,
        listings_matching: total, uestate_listings_matching: ours.length, third_party_listings_matching: listed.length,
        sample_data_shown: anySample,
        ...(rent
          ? { median_rent_thb_per_month: rentals?.overall?.medianRentThb ?? null, rent_forecast: "none (no rental index)" }
          : {
              stats_for: showSaleStats ? `${statsType} sale (${statsAreSample ? "SAMPLE" : "listing websites"})` : "hidden: only SAMPLE data",
              median_asking_price_per_sqm_all_districts: showSaleStats ? overview.all_districts?.median_price_per_sqm ?? null : null,
              forecast_12m_pct: forecast.available && showForecast ? `${forecast.change_pct.low} to ${forecast.change_pct.high} (central ${forecast.change_pct.central})` : null,
              forecast_model: MARKET_FORECAST.meta.model,
            }),
        prices_are: "asking prices, not completed sales or signed leases",
      }} />

      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">{t("Explore the market")}</h1>
          {anySample && <span className="rounded-full bg-amber-soft px-3 py-1 text-xs font-semibold text-amber">SAMPLE</span>}
        </div>
        <p className="lead max-w-3xl">
          {rent
            ? t("Homes for rent from {price} a month: U-Estate rentals first, with rent statistics and an affordability check.", { price: money(3000) })
            : t("U-Estate listings first, then third-party listings with their source, with a price forecast from the Bank of Thailand index.")}
        </p>
      </header>

      <div className="grid gap-3">
        {/* Keyed on the applied search, so the toolbar's drafts reset whenever the URL changes (chips, back button). */}
        <MarketFilters key={searchHref(search)} search={search} districts={districts} provinces={provinces} available={available} />
        {(search.priceError || search.areaError) && (
          <p role="alert" className="rounded-[12px] bg-amber-soft p-3 text-sm text-amber">{t("The maximum was below the minimum, so it was ignored.")}</p>
        )}
      </div>

      <section aria-labelledby="results-title" className="grid gap-4">
        <h2 id="results-title" className="section-title">{rent ? t("Homes for rent") : t("Homes for sale")}</h2>
        {snapshotIsSample && (
          <div className={`flex flex-wrap items-center gap-3 rounded-[14px] p-3 text-sm ${search.sample ? "bg-amber-soft text-amber" : "bg-ice text-deep"}`}>
            <span className="flex-1">
              {search.sample
                ? t("Showing {count} SAMPLE listings: synthetic data for the demo, not real properties or prices.", { count: formatNumber(sampleCount, locale) })
                : t("{count} SAMPLE listings are hidden. They are synthetic, not real properties.", { count: formatNumber(sampleCount, locale) })}
            </span>
            <Link href={searchHref(search, { sample: !search.sample, page: 1 })} scroll={false} className="btn btn-secondary min-h-10 px-4 text-sm" aria-pressed={search.sample}>
              {search.sample ? t("Hide sample data") : t("Show sample data")}
            </Link>
          </div>
        )}
        <MarketExplorer
          cards={cards} total={total} external={external} uestate={uestate} isSample={anySample} mode={search.mode}
          emptyHint={filtered ? t("Try a wider budget, another area or fewer property types.") : rent ? t("There are no rental listings yet. New rentals appear here as soon as owners list them.") : t("There are no listings for sale yet.")}
        />
        {allSnapshot.length > PAGE_SIZE && (
          <nav aria-label={t("Market listings pages")} className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-deep">{t(snapshotIsSample ? "Sample listings: {from}–{to} of {total}" : "Other websites: {from}–{to} of {total}", { from: (pageNo - 1) * PAGE_SIZE + 1, to: (pageNo - 1) * PAGE_SIZE + snapshot.length, total: allSnapshot.length })}</span>
            {pageNo > 1 && <Link href={searchHref(search, { page: pageNo - 1 })} className="btn btn-secondary" rel="prev">{t("Previous page")}</Link>}
            {pageNo < pages && <Link href={searchHref(search, { page: pageNo + 1 })} className="btn btn-secondary" rel="next">{t("Next page")}</Link>}
          </nav>
        )}
      </section>

      {rent ? (
        <>
          <section aria-labelledby="rent-stats-title" className="grid content-start gap-4">
            <h2 id="rent-stats-title" className="section-title">{t("Monthly asking rents")}</h2>
            {rentals && rentals.overall ? (
              <>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div className="stat-tile"><dt>{t("Median rent")}</dt><dd className="price">{money(rentals.overall.medianRentThb)}</dd><dd className="caption">{t("per month")}</dd></div>
                  <div className="stat-tile"><dt>{t("Median rent per m²")}</dt><dd className="price">{rentals.overall.medianRentPerSqm != null ? money(rentals.overall.medianRentPerSqm) : "—"}</dd><dd className="caption">{t("per m² per month")}</dd></div>
                  <div className="stat-tile"><dt>{t("Listings")}</dt><dd className="price">{formatNumber(rentals.count, locale)}</dd>{rentals.overall.medianAreaSqm != null && <dd className="caption">{t("Median size {area} m²", { area: rentals.overall.medianAreaSqm })}</dd>}</div>
                </dl>
                {rentals.districts.length > 0 && (
                  <div role="region" aria-label={t("Monthly asking rents")} tabIndex={0} className="table-scroll rounded-[14px] border border-line bg-paper">
                    <table className="w-full min-w-[480px] text-sm">
                      <thead className="bg-ice"><tr>{[t("District"), t("Listings"), t("Median rent"), t("Median rent per m²")].map((h) => <th key={h} scope="col" className="p-2 text-start">{h}</th>)}</tr></thead>
                      <tbody>
                        {rentals.districts.map((r) => (
                          <tr key={r.district} className="border-t border-line">
                            <th scope="row" className="p-2 text-start">{r.district}</th>
                            <td className="p-2">{formatNumber(r.count, locale)}</td>
                            <td className="p-2">{money(r.medianRentThb)}</td>
                            <td className="p-2">{r.medianRentPerSqm != null ? money(r.medianRentPerSqm) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid gap-2">
                  <h3 className="card-title">{t("Rent distribution")}</h3>
                  <ul className="grid gap-1.5">
                    {rentals.bands.map((b) => (
                      <li key={b.from} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-3 text-sm">
                        <span>{b.to === null ? t("{price}+", { price: money(b.from) }) : `${money(b.from)} – ${money(b.to)}`}</span>
                        <span className="h-2 rounded-full bg-ice"><span className="block h-2 rounded-full bg-deep" style={{ width: `${rentals.count ? (b.count / rentals.count) * 100 : 0}%` }} /></span>
                        <span className="text-end tabular-nums">{b.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <div className="surface-card grid gap-1 p-6">
                <p className="card-title">{t("Not enough rentals for statistics yet")}</p>
                <p className="text-deep">{t("Rent statistics need at least {count} matching rental listings. There are {found} now, so no medians are shown.", { count: MARKET_STATS.meta.min_count, found: rentals?.count ?? 0 })}</p>
              </div>
            )}
            <p className="caption">
              {t("Monthly asking rents, not signed leases. There is no rent forecast: the price forecast models sale prices and does not apply to rents.")}
              {rentals && rentals.count > 0 && ` ${t("Based on {count} listings shown above.", { count: rentals.count })}`}
            </p>
          </section>
          <RentAffordability defaultRent={search.maxPrice ?? rentals?.overall?.medianRentThb ?? 8000} />
        </>
      ) : (
        <>
          <div className="grid gap-10 lg:grid-cols-2">
            <section aria-labelledby="stats-title" className="grid content-start gap-3">
              <h2 id="stats-title" className="section-title">{t("Asking prices by district")} · {t(statsType)}</h2>
              {!showSaleStats ? (
                <div className="surface-card grid gap-2 p-6">
                  <p className="card-title">{t("Insufficient market data")}</p>
                  <p className="text-deep">{t("The only asking-price statistics available are computed from SAMPLE listings, so they are hidden. Switch on sample data to see them, labelled.")}</p>
                  <Link href={searchHref(search, { sample: true, page: 1 })} scroll={false} className="btn btn-secondary justify-self-start">{t("Show sample data")}</Link>
                </div>
              ) : saleRows.length === 0 ? (
                <p className="text-deep">{t("No statistics for this type yet.")}</p>
              ) : (
                <div role="region" aria-label={t("Asking prices by district")} tabIndex={0} className="table-scroll rounded-[14px] border border-line bg-paper">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-ice text-start">
                      <tr>{[t("District"), t("Listings"), t("Median price per m²"), t("Middle half per m² (p25–p75)"), t("Median price"), t("Median size")].map((h) => <th key={h} scope="col" className="p-2 text-start">{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {saleRows.map((r) => (
                        <tr key={r.district} className={`border-t border-line ${r.district === "ALL" ? "font-semibold" : ""}`}>
                          <th scope="row" className="p-2 text-start">{r.district === "ALL" ? t("All districts") : r.district}</th>
                          <td className="p-2">{formatNumber(r.count, locale)}</td>
                          <td className="p-2">{money(r.median_price_per_sqm)}</td>
                          <td className="p-2">{money(r.p25_price_per_sqm)} – {money(r.p75_price_per_sqm)}</td>
                          <td className="p-2">{money(r.median_price_thb)}</td>
                          <td className="p-2">{formatNumber(r.median_area_sqm, locale)} m²</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {showSaleStats && (
                <p className="caption">
                  {statsAreSample && <strong className="text-amber">SAMPLE · </strong>}
                  {t("Asking prices, not completed sales. {based}, generated {date}.", { based: MARKET_STATS.meta.based_on, date: MARKET_STATS.meta.generated_at.slice(0, 10) })} {overview.note}
                </p>
              )}
            </section>

            <section aria-labelledby="forecast-title-h" className="grid content-start gap-3">
              <h2 id="forecast-title-h" className="section-title">{t("Price forecast")} · {t(statsType)}</h2>
              {forecast.available && series && showForecast ? (
                <>
                  <p className="font-semibold">{t("Next {months} months: {low}% to {high}% (central {central}%), a forecast, not a guarantee.", { months: 12, low: forecast.change_pct.low, high: forecast.change_pct.high, central: forecast.change_pct.central })}</p>
                  <MarketForecastChart history={series.history} forecast={series.forecast} isSample={forecast.is_sample} title={`${series.label} · ${series.region}`} caption={t("Shaded band: 80% range (p10 to p90). Line: history and central forecast.")} />
                  <p className="caption">
                    {t("A regional price index, not the value of any single property. {count} monthly observations, {from} to {to}. Source: {source}.", {
                      count: series.history.length, from: series.history[0].period, to: series.history.at(-1)!.period, source: MARKET_FORECAST.meta.series_source,
                    })}
                  </p>
                </>
              ) : (
                <p className="text-deep">{t("No forecast for this type yet.")}</p>
              )}
            </section>
          </div>

          <section aria-labelledby="buying-title" className="surface-card grid gap-3 p-6">
            <h2 id="buying-title" className="section-title">{t("Buying and ownership")}</h2>
            <ul className="grid gap-2 text-deep">
              <li>{t("Buyers pay no U-Estate fee.")}</li>
              <li>{t("Foreigners can own condos within the building's {pct}% foreign quota, with funds sent from abroad (FET form). Houses and land cannot be owned by foreigners.", { pct: COBUY.foreignQuotaPct })}</li>
              <li>{t("Transfer fees and taxes are set by the Land Office. Confirm ownership there before you pay.")}</li>
            </ul>
          </section>
        </>
      )}

      {!rent && snapshot.length > 0 && (
        <section aria-labelledby="external-title" className="grid gap-3">
          <h2 id="external-title" className="section-title">{snapshotIsSample ? t("Sample listings (synthetic, not real)") : t("Listings on other websites")}</h2>
          <p className="text-sm text-amber">{t("Not checked by U-Estate")}{snapshotIsSample ? " · SAMPLE" : ""}</p>
          <div role="region" aria-label={t("Listings on other websites")} tabIndex={0} className="table-scroll rounded-[14px] border border-line bg-paper">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ice">
                <tr>{[t("District"), t("Type"), t("Price"), t("Size"), t("Price per m²"), t("Site"), t("Listed"), t("Location")].map((h) => <th key={h} scope="col" className="p-2 text-start">{h}</th>)}</tr>
              </thead>
              <tbody>
                {snapshot.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <th scope="row" className="p-2 text-start font-normal"><bdi>{[l.project, l.district].filter(Boolean).join(", ")}</bdi></th>
                    <td className="p-2">{t(l.type)} · {t(l.kind)}</td>
                    <td className="p-2">{money(l.price_thb)}{l.kind === "rent" ? ` ${t("per month")}` : ""}</td>
                    <td className="p-2">{formatNumber(l.area_sqm, locale)} m²</td>
                    <td className="p-2">{money(l.price_per_sqm)}</td>
                    <td className="p-2">{l.site}</td>
                    <td className="p-2">{l.listed_at ?? "—"}</td>
                    <td className="p-2">
                      {snapshotMaps.get(l.id) ? <a href={snapshotMaps.get(l.id)!.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{t("Google Maps")} ↗</a> : t("Location unavailable")}
                      {snapshotOriginal(l.source_url) && <> · <a href={snapshotOriginal(l.source_url)!} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{t("Original")} ↗</a></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="surface-card grid gap-3 p-5">
        <p className="caption">
          {t("Third-party listings: {count}, from sources that allowed U-Estate to publish them, updated {date}. Google Maps links search a listing's verified coordinates, else its project or area; an area link is not the exact building.", {
            count: formatNumber(REAL_LISTINGS.listings.length, locale), date: REAL_LISTINGS.meta.updated_at,
          })}
        </p>
        <p className="caption">
          {t("Data: {sites}, collected {date}. Statistics: {method} Forecast: {model}, from {series}.", {
            sites: MARKET_LISTINGS.meta.sites.map((s) => s.name).join(", "),
            date: MARKET_LISTINGS.meta.scraped_at.slice(0, 10),
            method: MARKET_STATS.meta.method,
            model: MARKET_FORECAST.meta.model,
            series: MARKET_FORECAST.meta.series_source,
          })}
          {snapshotIsSample ? ` ${t("The listing snapshot and its statistics are SAMPLE data.")}` : ""}
        </p>
        <Link href={`/assistant?q=${encodeURIComponent(question)}`} className="btn btn-primary justify-self-start">{t("Ask U-Pal about this market")}</Link>
      </footer>
    </article>
  );
}
