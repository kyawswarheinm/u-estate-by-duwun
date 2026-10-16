"use client";

// Listing cards beside the map, linked both ways: hovering or focusing a card highlights its marker, "Show on map"
// flies the map to it, and clicking a marker highlights its card and scrolls it into view. On phones a List/Map
// toggle shows one at a time. U-Estate listings come first (TECH_STACK §5), then real third-party listings, then
// SAMPLE rows only when the user asked for them. Every card says where it came from and how sure we are.
import { FavoriteButton } from "./FavoriteButton";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useState, useSyncExternalStore } from "react";
import { formatMoneyRef, formatNumber } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import type { MapExternalListing, MapUEstateListing } from "./MarketMap";
import { MarketMapLazy } from "./MarketMapLazy";
import { MarketPropertyArt, type ArtVariant } from "./MarketPropertyArt";

export type MarketCard = {
  id: string;
  /** uestate = listed on U-Estate; listed = real third-party or owner listing imported with permission; sample = synthetic. */
  source: "uestate" | "listed" | "sample";
  title: string;
  district: string;
  province: string;
  kind: "sale" | "rent";
  type: string;
  priceThb: number;
  areaSqm: number | null;
  pricePerSqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  furnishing: string | null;
  detailHref: string | null;
  mapsUrl: string | null;
  mapsPrecision: "exact" | "project" | "area" | null;
  originalUrl: string | null;
  sourceName: string | null;
  updatedAt: string | null;
  availability: "available" | "unconfirmed" | "unavailable" | null;
  /** True only after a real U-Estate check (or, for U-Estate listings, a passed deed check). Never inferred. */
  verified: boolean;
  photoUrl: string | null;
  photoCredit: string | null;
  art: ArtVariant;
  onMap: boolean;
};

export const TYPE_LABEL: Record<string, MessageKey> = {
  condo: "Condo", apartment: "Apartment", studio: "Studio", serviced_apartment: "Serviced apartment", house: "House", villa: "Villa",
  townhouse: "Townhouse", townhome: "Townhome", land: "Land", building: "Building",
};
const FURNISHING_LABEL: Record<string, MessageKey> = { furnished: "Furnished", partly_furnished: "Partly furnished", unfurnished: "Unfurnished" };
const MAPS_LABEL: Record<"exact" | "project" | "area", MessageKey> = { exact: "View on Google Maps", project: "Project on Google Maps", area: "Area on Google Maps" };
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const desktopMapQuery = "(min-width: 1024px)";
function subscribeToDesktopMap(changed: () => void) {
  const media = window.matchMedia(desktopMapQuery);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
}

export function MarketExplorer({ cards, total, external, uestate, isSample, mode, emptyHint }: {
  cards: MarketCard[]; total: number; external: MapExternalListing[]; uestate: MapUEstateListing[]; isSample: boolean; mode: "buy" | "rent"; emptyHint: string;
}) {
  const { t, locale, currency } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list"); // phones only
  const desktop = useSyncExternalStore(subscribeToDesktopMap, () => window.matchMedia(desktopMapQuery).matches, () => false);
  const money = (thb: number) => formatMoneyRef(thb, locale, currency);

  const fromMarker = useCallback((id: string) => {
    setSelected(id);
    setView("list");
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" }));
  }, []);
  const showOnMap = (id: string) => {
    setSelected(id);
    setView("map");
    document.getElementById("market-map")?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm font-medium text-deep">{t("{count} results", { count: total })}</p>
        <div className="segmented lg:hidden" role="group" aria-label={t("View")}>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>{t("List")}</button>
          <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>{t("Map")}</button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div id="market-map" className={`lg:sticky lg:top-24 lg:order-2 lg:self-start ${view === "map" ? "" : "max-lg:hidden"}`}>
          {(desktop || view === "map") && <MarketMapLazy external={external} uestate={uestate} isSample={isSample} selectedId={selected} hoveredId={hovered} onSelect={fromMarker} />}
        </div>
        <div className={`grid content-start gap-3 lg:order-1 ${view === "list" ? "" : "max-lg:hidden"}`}>
          {cards.length === 0 ? (
            <div className="surface-card grid gap-2 p-6">
              <p className="card-title">{mode === "rent" ? t("No rentals match these filters") : t("No homes for sale match these filters")}</p>
              <p className="text-deep">{emptyHint}</p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {cards.map((c) => {
                const isSelected = c.id === selected;
                const rooms = [
                  c.bedrooms != null ? t("{count} bed", { count: c.bedrooms }) : null,
                  c.bathrooms != null ? t("{count} bath", { count: c.bathrooms }) : null,
                  c.areaSqm != null ? `${formatNumber(c.areaSqm, locale)} m²` : null,
                ].filter(Boolean);
                const meta = [t(TYPE_LABEL[c.type] ?? "Other"), c.furnishing ? t(FURNISHING_LABEL[c.furnishing] ?? "Other") : null, c.kind === "sale" && c.pricePerSqm ? `${money(c.pricePerSqm)}/m²` : null].filter(Boolean);
                const badge = c.source === "uestate" ? "U-Estate" : c.source === "listed" ? t("Third-party listing") : "SAMPLE";
                return (
                  <li
                    key={c.id}
                    id={`card-${c.id}`}
                    onMouseEnter={() => setHovered(c.id)}
                    onMouseLeave={() => setHovered((h) => (h === c.id ? null : h))}
                    onFocus={() => setHovered(c.id)}
                    onBlur={() => setHovered((h) => (h === c.id ? null : h))}
                    className={`listing-card ${isSelected ? "is-selected" : ""}`}
                  >
                    <div className="relative aspect-[16/10] bg-ice">
                      {c.photoUrl ? (
                        <Image src={c.photoUrl} alt="" fill unoptimized sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                      ) : (
                        <MarketPropertyArt variant={c.art} className="h-full w-full" />
                      )}
                      <span className={`absolute start-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${c.source === "uestate" ? "bg-midnight text-on-strong" : c.source === "sample" ? "bg-amber-soft text-amber" : "bg-paper text-deep"}`}>
                        {badge}
                      </span>
                      <span className="absolute bottom-3 start-3 flex flex-wrap gap-1">
                        {!c.photoUrl && <span className="rounded-full bg-paper/90 px-2 py-0.5 text-[11px] font-semibold text-deep">{t("Illustration")}</span>}
                        {c.photoUrl && c.photoCredit && <span className="rounded-full bg-paper/90 px-2 py-0.5 text-[11px] text-deep">© {c.photoCredit}</span>}
                      </span>
                    </div>
                    <FavoriteButton id={c.id} />
                    <div className="grid gap-1.5 p-5">
                      <p className="price">
                        {money(c.priceThb)}
                        {c.kind === "rent" && <span className="text-base font-medium text-deep"> / {t("month")}</span>}
                      </p>
                      <h3 className="card-title"><bdi>{c.title}</bdi></h3>
                      <p className="text-sm text-deep"><bdi>{[c.district, c.province].filter(Boolean).join(", ")}</bdi></p>
                      {rooms.length > 0 && <p className="text-sm font-medium text-midnight">{rooms.join(" · ")}</p>}
                      <p className="text-sm text-deep">{meta.join(" · ")}</p>

                      <ul className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
                        {c.verified && <li className="pill bg-teal-soft text-teal">✓ {c.source === "uestate" ? t("Deed checked (sample)") : t("U-Estate verified")}</li>}
                        {c.source === "listed" && !c.verified && <li className="pill bg-ice text-deep">{t("Not independently verified")}</li>}
                        {c.source === "listed" && c.availability !== "available" && (
                          <li className="pill bg-amber-soft text-amber">! {c.availability === "unavailable" ? t("No longer available") : t("Availability unconfirmed")}</li>
                        )}
                        {c.source === "sample" && <li className="pill bg-amber-soft text-amber">{t("Synthetic, not a real listing")}</li>}
                      </ul>
                      {(c.sourceName || c.updatedAt) && (
                        <p className="caption">
                          {[c.sourceName ? t("Source: {name}", { name: c.sourceName }) : null, c.updatedAt ? t("Updated {date}", { date: c.updatedAt }) : null].filter(Boolean).join(" · ")}
                        </p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {c.detailHref && <Link href={c.detailHref} className="btn btn-primary min-h-11 px-4 text-sm">{t("View details")}</Link>}
                        {c.mapsUrl && c.mapsPrecision ? (
                          <a href={c.mapsUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-11 px-4 text-sm">{t(MAPS_LABEL[c.mapsPrecision])} ↗</a>
                        ) : (
                          <span className="btn btn-secondary min-h-11 cursor-not-allowed px-4 text-sm opacity-60" aria-disabled="true">{t("Location unavailable")}</span>
                        )}
                        {c.originalUrl && <a href={c.originalUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-11 px-4 text-sm">{t("View original listing")} ↗</a>}
                        {c.onMap && (
                          <button type="button" aria-pressed={isSelected} onClick={() => showOnMap(c.id)} className="btn btn-secondary min-h-11 px-4 text-sm">
                            {t("Show on map")}
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
