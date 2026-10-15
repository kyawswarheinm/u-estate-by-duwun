"use client";

// Market map (P3T03, D-42): MapLibre GL with OpenFreeMap tiles. OpenStreetMap attribution stays visible.
// External listings are neutral circles; U-Estate listings are brand-colour squares (shape + colour + legend,
// never colour alone). Popups are built with DOM text nodes, never HTML strings. Load through MarketMapLazy (no SSR).
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { formatMoney, formatNumber, translator } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import { BANGKOK_CENTRE } from "@/lib/market-data/district-centres";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export type MapExternalListing = {
  id: string; site: string; sourceUrl: string; kind: "sale" | "rent"; type: string; project: string | null; district: string;
  lat: number; lng: number; priceThb: number; areaSqm: number; pricePerSqm: number; listedAt: string | null;
};
export type MapUEstateListing = { id: string; title: string; district: string; kind: "sale" | "rent"; priceThb: number; areaSqm: number; lat: number; lng: number };

// Two shapes so the legend never relies on colour alone: brand-colour square = U-Estate, neutral circle = other websites.
const MARKER_STYLE = {
  uestate: { width: "18px", height: "18px", borderRadius: "4px", background: "var(--midnight)", border: "2px solid #fff", boxShadow: "0 0 0 1px var(--midnight)" },
  external: { width: "14px", height: "14px", borderRadius: "50%", background: "var(--blue-grey)", border: "2px solid #fff", boxShadow: "0 0 0 1px var(--blue-grey)" },
} as const;

/**
 * Listings at the same spot (units in one tower) would hide each other, so they fan out around it by a fixed number of
 * pixels (a marker offset, the same at every zoom). The true coordinates stay in `at`.
 */
function spread<T extends { lat: number; lng: number }>(points: T[]): (T & { at: [number, number]; offset: [number, number] })[] {
  const seen = new Map<string, number>();
  return points.map((p) => {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const angle = k * 2.4; // golden-angle steps, so markers don't line up
    const r = k === 0 ? 0 : 16 * Math.sqrt(k);
    return { ...p, at: [p.lng, p.lat], offset: [Math.round(r * Math.cos(angle)), Math.round(r * Math.sin(angle))] };
  });
}

/** Popup offset per anchor, so a popup clears its marker even when the marker was fanned out. */
function popupOffset([x, y]: [number, number]) {
  const g = 12;
  return {
    center: [x, y], top: [x, y + g], bottom: [x, y - g], left: [x + g, y], right: [x - g, y],
    "top-left": [x + g, y + g], "top-right": [x - g, y + g], "bottom-left": [x + g, y - g], "bottom-right": [x - g, y - g],
  } as Record<maplibregl.PositionAnchor, [number, number]>;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function MarketMap({ external, uestate, isSample }: { external: MapExternalListing[]; uestate: MapUEstateListing[]; isSample: boolean }) {
  const { t, locale, currency } = useI18n(); // t for the JSX below; the effect builds its own from locale (t changes every render)
  const container = useRef<HTMLDivElement>(null);
  // This component only renders in the browser (MarketMapLazy, no SSR), so WebGL can be checked up front.
  const [failed, setFailed] = useState(() => !document.createElement("canvas").getContext("webgl2") && !document.createElement("canvas").getContext("webgl"));

  useEffect(() => {
    if (failed || !container.current) return;
    // maplibre-gl 6 looks for its worker next to its own bundle; inside the Next build it is served by app/market/.
    maplibregl.setWorkerUrl(`${window.location.origin}/market/maplibre-gl-worker.mjs`);
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: [BANGKOK_CENTRE.lng, BANGKOK_CENTRE.lat],
        zoom: 10,
        attributionControl: { compact: false },
        cooperativeGestures: true, // page scroll isn't hijacked on phones
      });
    } catch {
      queueMicrotask(() => setFailed(true)); // the tables on the page still show everything
      return;
    }
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("error", (e) => {
      if (!map.isStyleLoaded() && /style|fetch/i.test(String(e.error?.message ?? ""))) setFailed(true);
    });

    const t = translator(locale);
    const money = (thb: number) => formatMoney(thb, locale, currency);
    const perMonth = (kind: string) => (kind === "rent" ? ` ${t("per month")}` : "");
    const bounds = new maplibregl.LngLatBounds();

    const placed = spread([...uestate.map((l) => ({ ...l, source: "uestate" as const })), ...external.map((l) => ({ ...l, source: "external" as const }))]);

    // Popups open from the marker button's own click, so Enter/Space work the same as a mouse click.
    // Esc closes the open popup and puts focus back on its marker.
    let open: { popup: maplibregl.Popup; button: HTMLButtonElement } | null = null;
    const addMarker = (at: [number, number], offset: [number, number], style: Partial<CSSStyleDeclaration>, label: string, content: HTMLElement) => {
      const button = el("button", { type: "button", className: "cursor-pointer" });
      Object.assign(button.style, style);
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-expanded", "false");
      const popup = new maplibregl.Popup({ offset: popupOffset(offset), maxWidth: "260px" }).setDOMContent(content);
      popup.on("close", () => {
        button.setAttribute("aria-expanded", "false");
        if (open?.popup === popup) open = null;
      });
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        if (open?.popup === popup) return void popup.remove();
        open?.popup.remove();
        popup.setLngLat(at).addTo(map);
        button.setAttribute("aria-expanded", "true");
        open = { popup, button };
      });
      new maplibregl.Marker({ element: button, offset }).setLngLat(at).addTo(map);
      bounds.extend(at);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open) return;
      const { popup, button } = open;
      popup.remove();
      button.focus();
    };
    const box = container.current;
    box.addEventListener("keydown", onKey);

    for (const l of placed.filter((x) => x.source === "external") as (MapExternalListing & { at: [number, number]; offset: [number, number] })[]) {
      addMarker(l.at, l.offset, MARKER_STYLE.external, `${t("Other website listing")}: ${money(l.priceThb)}${perMonth(l.kind)}, ${formatNumber(l.areaSqm, locale)} m², ${l.district}`,
        el("div", { className: "grid gap-1 text-sm text-ink" },
          el("strong", {}, `${money(l.priceThb)}${perMonth(l.kind)}`),
          el("span", {}, `${formatNumber(l.areaSqm, locale)} m² · ${money(l.pricePerSqm)}/m²`),
          el("span", {}, [l.project, l.district].filter(Boolean).join(", ")),
          el("span", { className: "text-xs text-ink-soft" }, t("{site}, listed {date}", { site: l.site, date: l.listedAt ?? "—" })),
          el("span", { className: "text-xs text-amber" }, isSample ? `${t("Not checked by U-Estate")} · SAMPLE` : t("Not checked by U-Estate")),
          el("a", { href: l.sourceUrl, target: "_blank", rel: "noopener noreferrer", className: "font-semibold underline" }, t("Open source ↗")),
        ));
    }
    for (const l of placed.filter((x) => x.source === "uestate") as (MapUEstateListing & { at: [number, number]; offset: [number, number] })[]) {
      addMarker(l.at, l.offset, MARKER_STYLE.uestate, `${t("U-Estate listing")}: ${l.title}, ${money(l.priceThb)}${perMonth(l.kind)}`,
        el("div", { className: "grid gap-1 text-sm text-ink" },
          el("strong", {}, l.title),
          el("span", {}, `${money(l.priceThb)}${perMonth(l.kind)} · ${formatNumber(l.areaSqm, locale)} m²`),
          el("span", { className: "text-xs text-ink-soft" }, t("Shown at the district centre ({district})", { district: l.district })),
          el("a", { href: `/listing/${l.id}`, className: "font-semibold underline" }, t("View listing")),
        ));
    }

    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
    return () => {
      box.removeEventListener("keydown", onKey);
      map.remove();
    };
  }, [failed, external, uestate, isSample, locale, currency]);

  return (
    <section aria-label={t("Market map")} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block" style={MARKER_STYLE.uestate} />{t("U-Estate listings")}</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block" style={MARKER_STYLE.external} />{t("Other websites (not checked by U-Estate)")}</span>
      </div>
      {failed ? (
        <p role="status" className="rounded-lg bg-amber-soft p-3 text-amber">{t("The map could not load. Every listing is in the tables below.")}</p>
      ) : (
        <div ref={container} className="h-[320px] w-full overflow-hidden rounded-[14px] border border-line sm:h-[440px]" />
      )}
    </section>
  );
}
