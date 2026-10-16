"use client";

// Market map (P3T03, D-42): MapLibre GL with OpenFreeMap tiles. OpenStreetMap attribution stays visible.
// External listings are neutral circles; U-Estate listings are brand-colour squares (shape + colour + legend,
// never colour alone). Popups are built with DOM text nodes, never HTML strings. Load through MarketMapLazy (no SSR).
// Linked to the listing cards: `selectedId` flies to a marker and opens it; a marker click reports `onSelect`.
// "3D view" tilts the map and raises OpenFreeMap's buildings (fill-extrusion from the vector tiles).
import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { formatNumber, translator, formatMoneyRef } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import { BANGKOK_CENTRE } from "@/lib/market-data/district-centres";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const BUILDINGS_3D = "ue-3d-buildings";

/** A third-party listing (real, imported with permission) or a SAMPLE row. `approximate` = a district-centre point. */
export type MapExternalListing = {
  id: string; origin: "listed" | "sample"; title: string; sourceName: string; kind: "sale" | "rent"; district: string;
  lat: number; lng: number; approximate: boolean; priceThb: number; areaSqm: number | null; pricePerSqm: number | null; updatedAt: string | null;
  mapsUrl: string | null; originalUrl: string | null; detailHref: string | null;
};
export type MapUEstateListing = { id: string; title: string; district: string; kind: "sale" | "rent"; priceThb: number; areaSqm: number; lat: number; lng: number; mapsUrl: string | null };

// Two shapes so the legend never relies on colour alone: brand-colour square = U-Estate, neutral circle = other websites.
export const MARKER_STYLE = {
  uestate: { width: "18px", height: "18px", borderRadius: "4px", background: "var(--brand-navy)", border: "2px solid #fff", boxShadow: "0 0 0 1px var(--brand-navy)" },
  external: { width: "14px", height: "14px", borderRadius: "50%", background: "#5f6b7a", border: "2px solid #fff", boxShadow: "0 0 0 1px #5f6b7a" },
} as const;
const SELECTED_RING = "0 0 0 3px var(--blue)";

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
    const r = k === 0 ? 0 : 44 * Math.sqrt(k);
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

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Shows or hides 3D buildings and tilts the camera. Adds the extrusion layer once, under the labels. */
function set3D(map: maplibregl.Map, on: boolean) {
  if (on && !map.getLayer(BUILDINGS_3D)) {
    const style = map.getStyle();
    const source = Object.entries(style.sources).find(([, s]) => s.type === "vector")?.[0];
    const firstLabel = style.layers.find((l) => l.type === "symbol")?.id;
    if (source) {
      map.addLayer({
        id: BUILDINGS_3D, type: "fill-extrusion", source, "source-layer": "building", minzoom: 13,
        paint: {
          "fill-extrusion-color": "#c7d4de",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      }, firstLabel);
    }
  }
  if (map.getLayer(BUILDINGS_3D)) map.setLayoutProperty(BUILDINGS_3D, "visibility", on ? "visible" : "none");
  map.easeTo({ pitch: on ? 60 : 0, bearing: on ? -20 : 0, zoom: on ? Math.max(map.getZoom(), 14.5) : map.getZoom(), duration: reducedMotion() ? 0 : 800 });
}

export function MarketMap({ external, uestate, isSample, selectedId = null, hoveredId = null, onSelect }: {
  external: MapExternalListing[]; uestate: MapUEstateListing[]; isSample: boolean; selectedId?: string | null; hoveredId?: string | null; onSelect?: (id: string) => void;
}) {
  const { t, locale, currency } = useI18n(); // t for the JSX below; the effect builds its own from locale (t changes every render)
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markers = useRef(new Map<string, { at: [number, number]; open: () => void; highlight: (on: boolean) => void }>());
  const onSelectRef = useRef(onSelect);
  const fromMap = useRef<string | null>(null);
  const [threeD, setThreeD] = useState(false);
  // This component only renders in the browser (MarketMapLazy, no SSR), so WebGL can be checked up front.
  const [failed, setFailed] = useState(() => !document.createElement("canvas").getContext("webgl2") && !document.createElement("canvas").getContext("webgl"));

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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
        locale: (() => {
          const tr = translator(locale);
          return {
            "CooperativeGesturesHandler.WindowsHelpText": tr("Use Ctrl + scroll to zoom the map"),
            "CooperativeGesturesHandler.MacHelpText": tr("Use ⌘ + scroll to zoom the map"),
            "CooperativeGesturesHandler.MobileHelpText": tr("Use two fingers to move the map"),
            "NavigationControl.ZoomIn": tr("Zoom in"),
            "NavigationControl.ZoomOut": tr("Zoom out"),
            "NavigationControl.ResetBearing": tr("Reset bearing to north"),
          };
        })(),
      });
    } catch {
      queueMicrotask(() => setFailed(true)); // the tables on the page still show everything
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.on("error", (e) => {
      if (!map.isStyleLoaded() && /style|fetch/i.test(String(e.error?.message ?? ""))) setFailed(true);
    });

    const t = translator(locale);
    const money = (thb: number) => formatMoneyRef(thb, locale, currency);
    const perMonth = (kind: string) => (kind === "rent" ? ` ${t("per month")}` : "");
    const bounds = new maplibregl.LngLatBounds();
    const registry = markers.current;
    registry.clear();

    const placed = spread([...uestate.map((l) => ({ ...l, source: "uestate" as const })), ...external.map((l) => ({ ...l, source: "external" as const }))]);

    // Popups open from the marker button's own click, so Enter/Space work the same as a mouse click.
    // Esc closes the open popup and puts focus back on its marker.
    let open: { popup: maplibregl.Popup; button: HTMLButtonElement } | null = null;
    const addMarker = (id: string, at: [number, number], offset: [number, number], style: Partial<CSSStyleDeclaration>, label: string, content: HTMLElement) => {
      const dot = el("span");
      Object.assign(dot.style, style);
      dot.setAttribute("aria-hidden", "true");
      const button = el("button", { type: "button", className: "map-marker-target" }, dot);
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-expanded", "false");
      const popup = new maplibregl.Popup({ offset: popupOffset(offset), maxWidth: "260px" }).setDOMContent(content);
      popup.on("close", () => {
        button.setAttribute("aria-expanded", "false");
        if (open?.popup === popup) open = null;
      });
      const show = () => {
        if (open?.popup === popup) return;
        open?.popup.remove();
        popup.setLngLat(at).addTo(map);
        button.setAttribute("aria-expanded", "true");
        open = { popup, button };
      };
      button.addEventListener("click", (e) => {
        e.stopPropagation();
        if (open?.popup === popup) return void popup.remove();
        show();
        fromMap.current = id;
        onSelectRef.current?.(id);
      });
      new maplibregl.Marker({ element: button, offset }).setLngLat(at).addTo(map);
      registry.set(id, { at, open: show, highlight: (on) => void (dot.style.boxShadow = on ? SELECTED_RING : (style.boxShadow ?? "")) });
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
    // The map can start hidden (phones show List or Map): redraw when its box gets a size.
    const resized = new ResizeObserver(() => map.resize());
    resized.observe(box);

    const link = (href: string, label: string, external = true) =>
      el("a", { href, className: "font-semibold underline", ...(external ? { target: "_blank", rel: "noopener noreferrer" } : {}) }, label);
    for (const l of placed.filter((x) => x.source === "external") as (MapExternalListing & { at: [number, number]; offset: [number, number] })[]) {
      const size = l.areaSqm != null ? `${formatNumber(l.areaSqm, locale)} m²` : null;
      addMarker(l.id, l.at, l.offset, MARKER_STYLE.external, `${l.origin === "sample" ? "SAMPLE" : t("Third-party listing")}: ${l.title}, ${money(l.priceThb)}${perMonth(l.kind)}${size ? `, ${size}` : ""}, ${l.district}`,
        el("div", { className: "grid gap-1 text-sm text-ink" },
          el("strong", {}, `${money(l.priceThb)}${perMonth(l.kind)}`),
          el("span", {}, l.title),
          ...(size ? [el("span", {}, [size, l.pricePerSqm ? `${money(l.pricePerSqm)}/m²` : null].filter(Boolean).join(" · "))] : []),
          el("span", {}, l.district),
          el("span", { className: "text-xs text-ink-soft" }, [t("Source: {name}", { name: l.sourceName }), l.updatedAt ? t("Updated {date}", { date: l.updatedAt }) : null].filter(Boolean).join(" · ")),
          el("span", { className: "text-xs text-amber" }, l.origin === "sample" ? t("Synthetic, not a real listing") : t("Not independently verified")),
          ...(l.approximate ? [el("span", { className: "text-xs text-ink-soft" }, t("Shown at the district centre ({district})", { district: l.district }))] : []),
          ...(l.detailHref ? [link(l.detailHref, t("View details"), false)] : []),
          ...(l.mapsUrl ? [link(l.mapsUrl, `${t("Google Maps")} ↗`)] : []),
          ...(l.originalUrl ? [link(l.originalUrl, `${t("View original listing")} ↗`)] : []),
        ));
    }
    for (const l of placed.filter((x) => x.source === "uestate") as (MapUEstateListing & { at: [number, number]; offset: [number, number] })[]) {
      addMarker(l.id, l.at, l.offset, MARKER_STYLE.uestate, `${t("U-Estate listing")}: ${l.title}, ${money(l.priceThb)}${perMonth(l.kind)}`,
        el("div", { className: "grid gap-1 text-sm text-ink" },
          el("strong", {}, l.title),
          el("span", {}, `${money(l.priceThb)}${perMonth(l.kind)} · ${formatNumber(l.areaSqm, locale)} m²`),
          el("span", { className: "text-xs text-ink-soft" }, t("Shown at the district centre ({district})", { district: l.district })),
          link(`/listing/${l.id}`, t("View listing"), false),
          ...(l.mapsUrl ? [link(l.mapsUrl, `${t("Area on Google Maps")} ↗`)] : []),
        ));
    }

    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: 0 });
    return () => {
      box.removeEventListener("keydown", onKey);
      resized.disconnect();
      registry.clear();
      mapRef.current = null;
      map.remove();
    };
  }, [failed, external, uestate, isSample, locale, currency]);

  // A card asked for a listing: fly there and open it (skipped when the click came from the marker itself).
  useEffect(() => {
    const map = mapRef.current;
    for (const [id, m] of markers.current) m.highlight(id === selectedId || id === hoveredId);
    if (fromMap.current === selectedId) {
      fromMap.current = null; // the marker already opened itself; a later card click flies again
      return;
    }
    if (!map || !selectedId) return;
    const m = markers.current.get(selectedId);
    if (!m) return;
    map.easeTo({ center: m.at, zoom: Math.max(map.getZoom(), 14), duration: reducedMotion() ? 0 : 700 });
    m.open();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hover is handled by the effect below; this one flies on selection only
  }, [selectedId]);

  // Hovering a card rings its marker without moving the map.
  useEffect(() => {
    for (const [id, m] of markers.current) m.highlight(id === selectedId || id === hoveredId);
  }, [hoveredId, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // isStyleLoaded() is false while tiles are still downloading, and "load" has already fired by then: wait for "idle".
    if (map.isStyleLoaded()) set3D(map, threeD);
    else map.once("idle", () => set3D(map, threeD));
  }, [threeD]);

  return (
    <section aria-label={t("Market map")} className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block" style={MARKER_STYLE.uestate} />{t("U-Estate listings")}</span>
        <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="inline-block" style={MARKER_STYLE.external} />{isSample ? t("Third-party and SAMPLE listings") : t("Third-party listings")}</span>
        {!failed && (
          <button type="button" aria-pressed={threeD} onClick={() => setThreeD((v) => !v)} className="ms-auto min-h-11 rounded-lg border border-line bg-paper px-3 font-semibold">
            {threeD ? t("2D view") : t("3D view")}
          </button>
        )}
      </div>
      {failed ? (
        <p role="status" className="rounded-lg bg-amber-soft p-3 text-amber">{t("The map could not load. Every listing is in the tables below.")}</p>
      ) : (
        <div ref={container} className="h-[320px] w-full overflow-hidden rounded-[14px] border border-line sm:h-[440px] lg:h-[calc(100vh-220px)] lg:min-h-[480px]" />
      )}
    </section>
  );
}
