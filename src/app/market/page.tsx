import Link from "next/link";
import { formatMoney, formatNumber } from "@/i18n";
import { getPreferences, getTranslations } from "@/i18n/server";
import { MarketExplorer, type MarketCard } from "@/components/MarketExplorer";
import { MarketForecastChart } from "@/components/MarketForecastChart";
import type { MapExternalListing, MapUEstateListing } from "@/components/MarketMap";
import { artVariant } from "@/components/MarketPropertyArt";
import { MARKET_FORECAST, MARKET_LISTINGS, MARKET_STATS, MarketKind, MarketType } from "@/lib/market-data";
import { getMarketStats, getPriceForecast } from "@/lib/market-data/analytics";
import { districtCentre } from "@/lib/market-data/district-centres";
import { readDb } from "@/lib/store";
import { coverPhotos } from "./cover-photos";

// Market intelligence page (P3T03 + P3T04, D-42). Reads the offline snapshots and the U-Estate listings; every number
// comes from code. U-Estate listings first; other websites' listings are labelled and linked, never shown as ours.
export const metadata = { title: "Market" };

const TYPES = ["condo", "house", "townhouse", "land", "building"] as const;
const TYPE_LABEL = { condo: "Condo", house: "House", townhouse: "Townhouse", land: "Land", building: "Building" } as const;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

export default async function MarketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [t, { locale, currency }, db] = await Promise.all([getTranslations(), getPreferences(), readDb()]);
  const money = (thb: number) => formatMoney(thb, locale, currency);

  const type = (TYPES as readonly string[]).includes(one(sp.type)) ? one(sp.type) : "";
  const kind = MarketKind.safeParse(one(sp.kind)).success ? one(sp.kind) : "";
  const district = one(sp.district).slice(0, 60);
  const q = one(sp.q).slice(0, 80);
  const ql = q.toLowerCase();
  const matchesPlace = (d: string, name: string) =>
    (!district || d.toLowerCase() === district.toLowerCase()) && (!ql || d.toLowerCase().includes(ql) || ql.includes(d.toLowerCase()) || name.toLowerCase().includes(ql));

  // U-Estate listings (first), placed at their district centre until properties store coordinates.
  const ours = db.listings
    .filter((l) => !l.archivedAt && l.status !== "sold")
    .flatMap((l) => {
      const p = db.properties.find((x) => x.id === l.propertyId);
      return p ? [{ l, p }] : [];
    })
    .filter(({ l, p }) => (!type || p.type === type) && (!kind || l.kind === kind) && matchesPlace(p.district, p.title));
  const photos = await coverPhotos(ours.map(({ l }) => l.id));

  const theirs = MARKET_LISTINGS.listings.filter((l) => (!type || l.type === type) && (!kind || l.kind === kind) && matchesPlace(l.district, l.project ?? ""));

  const uestate: MapUEstateListing[] = ours.flatMap(({ l, p }) => {
    const c = districtCentre(p.district);
    return c ? [{ id: l.id, title: p.title, district: p.district, kind: l.kind, priceThb: l.askingPriceThb, areaSqm: p.areaSqm, lat: c.lat, lng: c.lng }] : [];
  });
  const external: MapExternalListing[] = theirs
    .filter((l) => l.lat != null && l.lng != null)
    .map((l) => ({
      id: l.id, site: l.site, sourceUrl: l.source_url, kind: l.kind, type: l.type, project: l.project, district: l.district,
      lat: l.lat!, lng: l.lng!, priceThb: l.price_thb, areaSqm: l.area_sqm, pricePerSqm: l.price_per_sqm, listedAt: l.listed_at,
    }));
  const onMap = new Set([...uestate.map((x) => x.id), ...external.map((x) => x.id)]);
  const cards: MarketCard[] = [
    ...ours.map(({ l, p }) => ({
      id: l.id, source: "uestate" as const, title: p.title, district: p.district, kind: l.kind, type: p.type,
      priceThb: l.askingPriceThb, areaSqm: p.areaSqm, pricePerSqm: Math.round(l.askingPriceThb / p.areaSqm), bedrooms: null,
      href: `/listing/${l.id}`, site: null, listedAt: null, photoUrl: photos[l.id] ?? null, art: artVariant(p.type, p.title), onMap: onMap.has(l.id),
    })),
    ...theirs.map((l) => ({
      id: l.id, source: "external" as const, title: l.project ?? t(l.type), district: l.district, kind: l.kind, type: l.type,
      priceThb: l.price_thb, areaSqm: l.area_sqm, pricePerSqm: l.price_per_sqm, bedrooms: l.bedrooms,
      href: l.source_url, site: l.site, listedAt: l.listed_at, photoUrl: null, art: artVariant(l.type), onMap: onMap.has(l.id),
    })),
  ];

  // Statistics and forecast are about one market type: the chosen one, or condos.
  const statsType = MarketType.safeParse(type).success ? (type as MarketType) : "condo";
  const statsKind = (kind || "sale") as MarketKind;
  const overview = getMarketStats({ type: statsType, kind: statsKind });
  const rows = [
    ...overview.districts_available.map((d) => getMarketStats({ type: statsType, kind: statsKind, district: d }).area).filter((r) => r !== null),
    ...(overview.all_districts ? [overview.all_districts] : []),
  ];
  const forecast = getPriceForecast({ type: statsType });
  const series = MARKET_FORECAST.series.find((s) => s.type === statsType);

  const districts = [...new Set([...db.properties.map((p) => p.district), ...MARKET_LISTINGS.listings.map((l) => l.district)])].sort();
  const anySample = MARKET_LISTINGS.meta.is_sample || MARKET_STATS.meta.is_sample || MARKET_FORECAST.meta.is_sample;
  const question = t("How are {type} prices in {area}?", { type: t(statsType), area: district || q || t("Bangkok and vicinity") });

  return (
    <article className="grid gap-8">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl font-semibold">{t("Explore the market")}</h1>
          {anySample && <span className="rounded-full bg-amber-soft px-3 py-1 text-xs font-semibold text-amber">SAMPLE</span>}
        </div>
        <p className="max-w-3xl text-deep">{t("U-Estate listings first, then asking prices on other websites, with a price forecast.")}</p>
      </header>

      <form method="get" className="grid gap-3 rounded-[14px] border border-line bg-white p-4 shadow-[var(--shadow)] md:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] md:items-end">
        <label className="grid gap-1 text-sm font-semibold">
          {t("Search location")}
          <input name="q" defaultValue={q} list="market-places" placeholder={t("District or project, e.g. Sathorn")} className="input" autoComplete="off" />
          <datalist id="market-places">{districts.map((d) => <option key={d} value={d} />)}</datalist>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t("Type")}
          <select name="type" defaultValue={type} className="input">
            <option value="">{t("All types")}</option>
            {TYPES.map((x) => <option key={x} value={x}>{t(TYPE_LABEL[x])}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t("Sale or rent")}
          <select name="kind" defaultValue={kind} className="input">
            <option value="">{t("Sale and rent")}</option>
            <option value="sale">{t("sale")}</option>
            <option value="rent">{t("rent")}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">
          {t("District")}
          <select name="district" defaultValue={district} className="input">
            <option value="">{t("All districts")}</option>
            {districts.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">{t("Search")}</button>
          {(q || type || kind || district) && <Link href="/market" className="btn btn-secondary">{t("Clear filters")}</Link>}
        </div>
      </form>

      <MarketExplorer cards={cards} external={external} uestate={uestate} isSample={MARKET_LISTINGS.meta.is_sample} />

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="stats-title" className="grid content-start gap-3">
          <h2 id="stats-title" className="text-2xl font-bold">{t("Asking prices by district")} · {t(statsType)} · {t(statsKind)}</h2>
          {rows.length === 0 ? (
            <p className="text-ink-soft">{t("No statistics for this type yet.")}</p>
          ) : (
            <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-ice text-start">
                  <tr>{[t("District"), t("Listings"), t("Median price per m²"), t("Middle half per m² (p25–p75)"), t("Median price"), t("Median size")].map((h) => <th key={h} scope="col" className="p-2 text-start">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
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
          <p className="text-xs text-ink-soft">{overview.note}</p>
        </section>

        <section aria-labelledby="forecast-title-h" className="grid content-start gap-3">
          <h2 id="forecast-title-h" className="text-2xl font-bold">{t("Price forecast")} · {t(statsType)}</h2>
          {forecast.available && series ? (
            <>
              <p className="font-semibold">{t("Next {months} months: {low}% to {high}% (central {central}%), a forecast, not a guarantee.", { months: 12, low: forecast.change_pct.low, high: forecast.change_pct.high, central: forecast.change_pct.central })}</p>
              <MarketForecastChart history={series.history} forecast={series.forecast} isSample={forecast.is_sample} title={`${series.label} · ${series.region}`} caption={t("Shaded band: 80% range (p10 to p90). Line: history and central forecast.")} />
            </>
          ) : (
            <p className="text-ink-soft">{t("No forecast for this type yet.")}</p>
          )}
        </section>
      </div>

      {theirs.length > 0 && (
        <section aria-labelledby="external-title" className="grid gap-3">
          <h2 id="external-title" className="text-2xl font-bold">{t("Listings on other websites")}</h2>
          <p className="text-sm text-amber">{t("Not checked by U-Estate")}{MARKET_LISTINGS.meta.is_sample ? " · SAMPLE" : ""}</p>
          <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-ice">
                <tr>{[t("District"), t("Type"), t("Price"), t("Size"), t("Price per m²"), t("Site"), t("Listed"), t("Source")].map((h) => <th key={h} scope="col" className="p-2 text-start">{h}</th>)}</tr>
              </thead>
              <tbody>
                {theirs.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <th scope="row" className="p-2 text-start font-normal"><bdi>{[l.project, l.district].filter(Boolean).join(", ")}</bdi></th>
                    <td className="p-2">{t(l.type)} · {t(l.kind)}</td>
                    <td className="p-2">{money(l.price_thb)}{l.kind === "rent" ? ` ${t("per month")}` : ""}</td>
                    <td className="p-2">{formatNumber(l.area_sqm, locale)} m²</td>
                    <td className="p-2">{money(l.price_per_sqm)}</td>
                    <td className="p-2">{l.site}</td>
                    <td className="p-2">{l.listed_at ?? "—"}</td>
                    <td className="p-2"><a href={l.source_url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{t("Open source ↗")}</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="grid gap-3 rounded-[14px] border border-line bg-white p-4">
        <p className="text-sm text-deep">
          {t("Data: {sites}, collected {date}. Statistics: {method} Forecast: {model}, from {series}.", {
            sites: MARKET_LISTINGS.meta.sites.map((s) => s.name).join(", "),
            date: MARKET_LISTINGS.meta.scraped_at.slice(0, 10),
            method: MARKET_STATS.meta.method,
            model: MARKET_FORECAST.meta.model,
            series: MARKET_FORECAST.meta.series_source,
          })}
          {anySample ? " SAMPLE." : ""}
        </p>
        <Link href={`/assistant?q=${encodeURIComponent(question)}`} className="btn btn-primary justify-self-start">{t("Ask the AI about this market")}</Link>
      </footer>
    </article>
  );
}
