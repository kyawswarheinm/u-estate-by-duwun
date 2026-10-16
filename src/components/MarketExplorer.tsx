"use client";

// Listing cards beside the map, linked both ways: "Show on map" flies the map to the marker and opens it;
// clicking a marker highlights its card and scrolls it into view. U-Estate listings come first (TECH_STACK §5).
import { FavoriteButton } from "./FavoriteButton";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useState } from "react";
import { formatMoney, formatNumber } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import type { MapExternalListing, MapUEstateListing } from "./MarketMap";
import { MarketMapLazy } from "./MarketMapLazy";
import { MarketPropertyArt, type ArtVariant } from "./MarketPropertyArt";

export type MarketCard = {
  id: string;
  source: "uestate" | "external";
  title: string;
  district: string;
  kind: "sale" | "rent";
  type: string;
  priceThb: number;
  areaSqm: number;
  pricePerSqm: number;
  bedrooms: number | null;
  href: string;
  site: string | null;
  listedAt: string | null;
  photoUrl: string | null;
  art: ArtVariant;
  onMap: boolean;
};

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MarketExplorer({ cards, total, external, uestate, isSample }: { cards: MarketCard[]; total: number; external: MapExternalListing[]; uestate: MapUEstateListing[]; isSample: boolean }) {
  const { t, locale, currency } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const money = (thb: number) => formatMoney(thb, locale, currency);

  const fromMarker = useCallback((id: string) => {
    setSelected(id);
    document.getElementById(`card-${id}`)?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, []);
  const showOnMap = (id: string) => {
    setSelected(id);
    document.getElementById("market-map")?.scrollIntoView({ block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div id="market-map" className="lg:sticky lg:top-24 lg:order-2 lg:self-start">
        <MarketMapLazy external={external} uestate={uestate} isSample={isSample} selectedId={selected} onSelect={fromMarker} />
      </div>
      <div className="grid content-start gap-3 lg:order-1">
        <p role="status" className="text-sm text-deep">{t("{count} results", { count: total })}</p>
        {cards.length === 0 ? (
          <p className="rounded-[14px] border border-line bg-white p-6 text-ink-soft">{t("No listings match. Try another location or clear the filters.")}</p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {cards.map((c) => {
              const isSelected = c.id === selected;
              const price = `${money(c.priceThb)}${c.kind === "rent" ? ` ${t("per month")}` : ""}`;
              return (
                <li key={c.id} id={`card-${c.id}`}
                  className={`relative overflow-hidden rounded-[24px] border bg-white shadow-[var(--shadow)] transition-shadow ${isSelected ? "border-blue ring-2 ring-blue" : "border-line"}`}>
                  <div className="relative aspect-[16/10] bg-ice">
                    {c.photoUrl ? (
                      <Image src={c.photoUrl} alt="" fill unoptimized sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" />
                    ) : (
                      <MarketPropertyArt variant={c.art} className="h-full w-full" />
                    )}
                    <span className={`absolute start-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold ${c.source === "uestate" ? "bg-midnight text-white" : "bg-white text-deep"}`}>
                      {c.source === "uestate" ? "U-Estate" : t("Other website")}
                    </span>
                    <span className="absolute bottom-2 start-2 flex gap-1">
                      {isSample && <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber">SAMPLE</span>}
                    </span>
                  </div>
                  <FavoriteButton id={c.id} />
                  <div className="grid gap-1 p-5">
                    <p className="text-xl font-bold">{price}</p>
                    <p className="text-sm text-deep">
                      {[c.bedrooms != null ? t("{count} bed", { count: c.bedrooms }) : null, `${formatNumber(c.areaSqm, locale)} m²`, c.kind === "sale" ? `${money(c.pricePerSqm)}/m²` : null].filter(Boolean).join(" · ")}
                    </p>
                    <p className="font-semibold"><bdi>{c.title}</bdi></p>
                    <p className="text-sm text-ink-soft"><bdi>{c.district}</bdi></p>
                    {c.source === "external" && (
                      <p className="text-xs text-amber">{t("{site}, listed {date}", { site: c.site ?? "", date: c.listedAt ?? "—" })} · {t("Not checked by U-Estate")}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.source === "uestate" ? (
                        <Link href={c.href} className="btn btn-primary min-h-11 px-3 text-sm">{t("View listing")}</Link>
                      ) : c.href ? (
                        <a href={c.href} target="_blank" rel="noopener noreferrer" className="btn btn-secondary min-h-11 px-3 text-sm">{t("Open source ↗")}</a>
                      ) : null}
                      {c.onMap && (
                        <button type="button" aria-pressed={isSelected} onClick={() => showOnMap(c.id)} className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold">
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
  );
}
