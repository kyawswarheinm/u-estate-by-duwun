"use client";

// Compact market search card: Buy/Rent, location, then Budget and Type as popovers, More filters (district,
// province, size) as a drawer.
// Every Apply/Search navigates to /market?… so the server filters the real listings, the map and the counts, and
// U-Pal reads the same state. Only attributes the listing data really has can be filtered.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { formatMoneyCompact, type MessageKey } from "@/i18n";
import { useI18n } from "@/i18n/provider";
import {
  hasFilters, PRICE_PRESETS, RENT_FLOOR_THB, searchHref, switchModeHref, type Amenity, type Furnishing, type ListingType, type MarketSearch,
} from "@/lib/market-search";
import { FilterPopover } from "./FilterPopover";
import { TYPE_LABEL } from "./MarketExplorer";

const FURNISHING_LABEL: Record<Furnishing, MessageKey> = { furnished: "Furnished", partly_furnished: "Partly furnished", unfurnished: "Unfurnished" };
const AMENITY_LABEL: Record<Amenity, MessageKey> = {
  pool: "Swimming pool", gym: "Gym", security: "Security", elevator: "Elevator", parking: "Parking", balcony: "Balcony",
  air_conditioning: "Air conditioning", pet_friendly: "Pet-friendly", coworking: "Co-working space", laundry: "Laundry",
};

/** Which filters the data can answer: only types, rooms, furnishing and amenities some listing records. */
export type AvailableFilters = { types: ListingType[]; beds: boolean; baths: boolean; furnishing: boolean; amenities: string[] };

type Menu = "budget" | "type" | "more" | null;
const num = (v: string) => {
  const n = Number(v.replace(/[,\s]/g, ""));
  return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

const Chevron = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ms-auto shrink-0 text-deep"><path d="m6 9 6 6 6-6" /></svg>
);
const Sliders = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
);
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
);

export function MarketFilters({ search, districts, provinces, available }: { search: MarketSearch; districts: string[]; provinces: string[]; available: AvailableFilters }) {
  const { t, locale, currency } = useI18n();
  const router = useRouter();
  const rent = search.mode === "rent";
  const floor = rent ? RENT_FLOOR_THB : 0;
  const money = (n: number) => formatMoneyCompact(n, locale, currency);

  const [menu, setMenu] = useState<Menu>(null);
  const close = useCallback(() => setMenu(null), []);
  const toggle = (m: Exclude<Menu, null>) => setMenu((cur) => (cur === m ? null : m));
  const budgetRef = useRef<HTMLButtonElement>(null);
  const typeRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  // Toolbar fields, and drafts edited inside the popovers until Apply.
  const [q, setQ] = useState(search.q);
  const [district, setDistrict] = useState(search.district);
  const [min, setMin] = useState(search.minPrice && search.minPrice > floor ? String(search.minPrice) : rent ? String(RENT_FLOOR_THB) : "");
  const [max, setMax] = useState(search.maxPrice?.toString() ?? "");
  const [types, setTypes] = useState<ListingType[]>(search.types);
  const [province, setProvince] = useState(search.province);
  const [minArea, setMinArea] = useState(search.minArea?.toString() ?? "");
  const [maxArea, setMaxArea] = useState(search.maxArea?.toString() ?? "");
  const [beds, setBeds] = useState(search.minBeds?.toString() ?? "");
  const [baths, setBaths] = useState(search.minBaths?.toString() ?? "");
  const [furnishing, setFurnishing] = useState<Furnishing | "">(search.furnishing ?? "");
  const [amenities, setAmenities] = useState<Amenity[]>(search.amenities);

  const minN = num(min);
  const maxN = num(max);
  const minBelowFloor = rent && minN !== null && minN < RENT_FLOOR_THB;
  const priceInvalid = minN !== null && maxN !== null && maxN < minN;
  const areaInvalid = num(minArea) !== null && num(maxArea) !== null && num(maxArea)! < num(minArea)!;

  function go(change: Partial<MarketSearch> = {}) {
    setMenu(null);
    const next: MarketSearch = {
      ...search, q: q.trim(), district, province, types,
      minPrice: rent ? Math.max(minN ?? RENT_FLOOR_THB, RENT_FLOOR_THB) : minN,
      maxPrice: maxN, minArea: num(minArea), maxArea: num(maxArea), minBeds: num(beds), minBaths: num(baths), furnishing: furnishing || null, amenities, page: 1, ...change,
    };
    router.push(searchHref(next), { scroll: false });
  }

  // Labels for the collapsed triggers, from the applied search.
  const appliedMin = search.minPrice !== null && search.minPrice > floor ? search.minPrice : null;
  const budgetLabel =
    appliedMin === null && search.maxPrice === null
      ? rent ? t("{price}+ / month", { price: money(RENT_FLOOR_THB) }) : t("Any price")
      : `${appliedMin !== null ? money(appliedMin) : rent ? money(RENT_FLOOR_THB) : money(0)} – ${search.maxPrice !== null ? money(search.maxPrice) : t("No max")}${rent ? ` / ${t("month")}` : ""}`;
  const typeLabel = search.types.length === 0
    ? t("All types")
    : search.types.length === 1 ? t(TYPE_LABEL[search.types[0]]) : t("{first} + {count} more", { first: t(TYPE_LABEL[search.types[0]]), count: search.types.length - 1 });
  const moreCount = [search.district, search.province, search.minArea, search.maxArea, search.minBeds, search.minBaths, search.furnishing].filter(Boolean).length + search.amenities.length;

  // Removable chips for what is applied.
  const chips: { key: string; label: string; href: string }[] = [
    ...(search.q ? [{ key: "q", label: `“${search.q}”`, href: searchHref(search, { q: "", page: 1 }) }] : []),
    ...(search.district ? [{ key: "district", label: search.district, href: searchHref(search, { district: "", page: 1 }) }] : []),
    ...(search.province ? [{ key: "province", label: search.province, href: searchHref(search, { province: "", page: 1 }) }] : []),
    ...(appliedMin !== null || search.maxPrice !== null ? [{ key: "price", label: budgetLabel, href: searchHref(search, { minPrice: rent ? RENT_FLOOR_THB : null, maxPrice: null, page: 1 }) }] : []),
    ...search.types.map((ty) => ({ key: `type-${ty}`, label: t(TYPE_LABEL[ty]), href: searchHref(search, { types: search.types.filter((x) => x !== ty), page: 1 }) })),
    ...(search.minArea !== null || search.maxArea !== null
      ? [{ key: "area", label: `${search.minArea ?? 0}–${search.maxArea ?? "∞"} m²`, href: searchHref(search, { minArea: null, maxArea: null, page: 1 }) }]
      : []),
    ...(search.minBeds !== null ? [{ key: "beds", label: t("{count}+ bedrooms", { count: search.minBeds }), href: searchHref(search, { minBeds: null, page: 1 }) }] : []),
    ...(search.minBaths !== null ? [{ key: "baths", label: t("{count}+ bathrooms", { count: search.minBaths }), href: searchHref(search, { minBaths: null, page: 1 }) }] : []),
    ...(search.furnishing ? [{ key: "furnishing", label: t(FURNISHING_LABEL[search.furnishing]), href: searchHref(search, { furnishing: null, page: 1 }) }] : []),
    ...search.amenities.map((a) => ({ key: `amenity-${a}`, label: t(AMENITY_LABEL[a]), href: searchHref(search, { amenities: search.amenities.filter((x) => x !== a), page: 1 }) })),
  ];

  const presetActive = (from: number, to: number | null) => (minN ?? floor) === from && (to === null ? maxN === null : maxN === to);
  const presetLabel = (from: number, to: number | null) => (to === null ? t("{price}+", { price: money(from) }) : from === 0 ? t("Under {price}", { price: money(to) }) : `${money(from)}–${money(to)}`);
  const bounds = [...new Set(PRICE_PRESETS[search.mode].flat().filter((x): x is number => x !== null && x >= floor))];

  return (
    <div className="grid gap-3">
      <form
        className="market-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (!priceInvalid && !areaInvalid) go();
        }}
      >
        <nav aria-label={t("Buy or rent")} className="search-mode">
          <Link href={switchModeHref(search, "buy")} aria-current={!rent ? "page" : undefined} scroll={false}>{t("Buy")}</Link>
          <Link href={switchModeHref(search, "rent")} aria-current={rent ? "page" : undefined} scroll={false}>{t("Rent")}</Link>
        </nav>

        <label className="search-field">
          <span className="search-label">{t("Location")}</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} list="market-places" placeholder={t("District or project, e.g. Sathorn")} autoComplete="off" className="search-control" />
          <datalist id="market-places">{districts.map((d) => <option key={d} value={d} />)}</datalist>
        </label>

        <div className="search-pair">
          <div className="search-field">
            <span id="budget-label" className="search-label">{rent ? t("Monthly budget") : t("Price range")}</span>
            <button ref={budgetRef} type="button" className="search-control search-trigger" aria-labelledby="budget-label budget-value" aria-expanded={menu === "budget"} aria-controls="budget-menu" aria-haspopup="dialog" onClick={() => toggle("budget")}>
              <span id="budget-value" className="truncate">{budgetLabel}</span><Chevron />
            </button>
          </div>
          <div className="search-field">
            <span id="type-label" className="search-label">{t("Property type")}</span>
            <button ref={typeRef} type="button" className="search-control search-trigger" aria-labelledby="type-label type-value" aria-expanded={menu === "type"} aria-controls="type-menu" aria-haspopup="dialog" onClick={() => toggle("type")}>
              <span id="type-value" className="truncate">{typeLabel}</span><Chevron />
            </button>
          </div>
        </div>

        <div className="search-actions">
          <button ref={moreRef} type="button" className="search-more" aria-expanded={menu === "more"} aria-controls="more-menu" aria-haspopup="dialog" onClick={() => toggle("more")}>
            <Sliders /> <span>{t("More filters")}</span>
            {moreCount > 0 && <span className="toolbar-count">{moreCount}</span>}
          </button>
          <button type="submit" className="search-submit">
            <span>{t("Search")}</span> <SearchIcon />
          </button>
        </div>
      </form>

      {chips.length > 0 && (
        <ul className="active-chips" aria-label={t("Active filters")}>
          {chips.map((c) => (
            <li key={c.key}>
              <Link href={c.href} scroll={false} className="active-chip" aria-label={t("Remove filter: {name}", { name: c.label })}>
                <bdi>{c.label}</bdi> <span aria-hidden="true">×</span>
              </Link>
            </li>
          ))}
          {hasFilters(search) && <li><Link href={rent ? "/market?mode=rent" : "/market"} scroll={false} className="active-chip-clear">{t("Clear filters")}</Link></li>}
        </ul>
      )}

      <FilterPopover
        id="budget-menu" open={menu === "budget"} onClose={close} anchorRef={budgetRef} width={360} closeLabel={t("Close")}
        title={rent ? t("Monthly budget") : t("Price range")}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setMin(rent ? String(RENT_FLOOR_THB) : ""); setMax(""); }}>{t("Reset")}</button>
            <button type="button" className="btn btn-primary" disabled={priceInvalid || minBelowFloor} onClick={() => go()}>{t("Apply")}</button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="field-label">
            {rent ? t("Minimum rent (THB)") : t("Minimum (THB)")}
            <input type="number" inputMode="numeric" min={floor} step={rent ? 500 : 100000} list="price-bounds" value={min} onChange={(e) => setMin(e.target.value)} placeholder={rent ? String(RENT_FLOOR_THB) : t("No minimum")} className="input" aria-invalid={minBelowFloor || priceInvalid} aria-describedby="budget-error" />
          </label>
          <label className="field-label">
            {rent ? t("Maximum rent (THB)") : t("Maximum (THB)")}
            <input type="number" inputMode="numeric" min={minN ?? floor} step={rent ? 500 : 100000} list="price-bounds" value={max} onChange={(e) => setMax(e.target.value)} placeholder={t("No maximum")} className="input" aria-invalid={priceInvalid} aria-describedby="budget-error" />
          </label>
          <datalist id="price-bounds">{bounds.map((b) => <option key={b} value={b} />)}</datalist>
        </div>
        <p id="budget-error" role="alert" className="field-error">
          {minBelowFloor ? t("Rentals start at {price} per month.", { price: money(RENT_FLOOR_THB) }) : priceInvalid ? t("The maximum must be at least the minimum.") : ""}
        </p>
        <p className="search-label mb-2">{t("Quick ranges")}</p>
        <ul className="grid grid-cols-3 gap-2">
          {PRICE_PRESETS[search.mode].map(([from, to]) => (
            <li key={from}>
              <button type="button" className="chip w-full justify-center px-2" aria-pressed={presetActive(from, to)} onClick={() => { setMin(from > 0 ? String(from) : ""); setMax(to === null ? "" : String(to)); }}>
                {presetLabel(from, to)}
              </button>
            </li>
          ))}
        </ul>
        {currency !== "THB" && <p className="caption mt-3">{t("Amounts are entered in THB and shown in {currency}.", { currency })}</p>}
      </FilterPopover>

      <FilterPopover
        id="type-menu" open={menu === "type"} onClose={close} anchorRef={typeRef} width={300} closeLabel={t("Close")} title={t("Property type")}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setTypes([])}>{t("Clear")}</button>
            <button type="button" className="btn btn-primary" onClick={() => go()}>{t("Apply")}</button>
          </>
        }
      >
        <fieldset>
          <legend className="sr-only">{t("Property type")}</legend>
          <ul className="grid gap-1">
            {available.types.map((ty) => {
              const on = types.includes(ty);
              return (
                <li key={ty}>
                  <label className="check-row">
                    <input type="checkbox" checked={on} onChange={() => setTypes((all) => (on ? all.filter((x) => x !== ty) : [...all, ty]))} />
                    <span>{t(TYPE_LABEL[ty])}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
        <p className="caption mt-3">{t("Only types that U-Estate listings and the market data record.")}</p>
      </FilterPopover>

      <FilterPopover
        id="more-menu" open={menu === "more"} onClose={close} anchorRef={moreRef} variant="drawer" closeLabel={t("Close")} title={t("More filters")}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => { setProvince(""); setMinArea(""); setMaxArea(""); setDistrict(""); setBeds(""); setBaths(""); setFurnishing(""); setAmenities([]); }}>{t("Reset")}</button>
            <button type="button" className="btn btn-primary" disabled={areaInvalid} onClick={() => go()}>{t("Show results")}</button>
          </>
        }
      >
        <div className="grid gap-5">
          <label className="field-label">
            {t("District")}
            <select value={district} onChange={(e) => setDistrict(e.target.value)} className="input">
              <option value="">{t("All districts")}</option>
              {districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <label className="field-label">
            {t("Province")}
            <select value={province} onChange={(e) => setProvince(e.target.value)} className="input">
              <option value="">{t("All provinces")}</option>
              {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <fieldset className="grid gap-2">
            <legend className="field-label mb-1">{t("Floor area (m²)")}</legend>
            <div className="grid grid-cols-2 gap-3">
              <input type="number" inputMode="numeric" min={1} value={minArea} onChange={(e) => setMinArea(e.target.value)} placeholder={t("No minimum")} aria-label={t("Minimum size (m²)")} className="input" aria-invalid={areaInvalid} />
              <input type="number" inputMode="numeric" min={num(minArea) ?? 1} value={maxArea} onChange={(e) => setMaxArea(e.target.value)} placeholder={t("No maximum")} aria-label={t("Maximum size (m²)")} className="input" aria-invalid={areaInvalid} />
            </div>
            {areaInvalid && <p role="alert" className="field-error">{t("The maximum must be at least the minimum.")}</p>}
          </fieldset>
          {(available.beds || available.baths) && (
            <div className="grid grid-cols-2 gap-3">
              {available.beds && (
            <label className="field-label">
              {t("Bedrooms")}
              <select value={beds} onChange={(e) => setBeds(e.target.value)} className="input">
                <option value="">{t("Any")}</option>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}
              </select>
            </label>
              )}
              {available.baths && (
            <label className="field-label">
              {t("Bathrooms")}
              <select value={baths} onChange={(e) => setBaths(e.target.value)} className="input">
                <option value="">{t("Any")}</option>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}
              </select>
            </label>
              )}
            </div>
          )}
          {available.furnishing && (
            <label className="field-label">
              {t("Furnishing")}
              <select value={furnishing} onChange={(e) => setFurnishing(e.target.value as Furnishing | "")} className="input">
                <option value="">{t("Any")}</option>
                {(Object.keys(FURNISHING_LABEL) as Furnishing[]).map((f) => <option key={f} value={f}>{t(FURNISHING_LABEL[f])}</option>)}
              </select>
            </label>
          )}
          {available.amenities.length > 0 && (
            <fieldset className="grid gap-1">
              <legend className="field-label mb-1">{t("Amenities")}</legend>
              {(available.amenities as Amenity[]).filter((a) => a in AMENITY_LABEL).map((a) => {
                const on = amenities.includes(a);
                return (
                  <label key={a} className="check-row">
                    <input type="checkbox" checked={on} onChange={() => setAmenities((all) => (on ? all.filter((x) => x !== a) : [...all, a]))} />
                    <span>{t(AMENITY_LABEL[a])}</span>
                  </label>
                );
              })}
            </fieldset>
          )}
          <p className="caption">{t("Filters appear only for details that listings record. A listing that does not state a detail is left out when you filter on it.")}</p>
        </div>
      </FilterPopover>
    </div>
  );
}
