// Google Maps links (Maps URLs API: https://developers.google.com/maps/documentation/urls/get-started).
// Plain links, no API key. Coordinates are used only when they are real (exact or project level); otherwise a text
// search for the project and area. A district-level point is a district centre, never a building, so it is searched
// by name. With nothing usable the caller shows "Location unavailable".

export type MapPrecision = "exact" | "project" | "district" | "none";
export type MapsLink = { url: string; precision: "exact" | "project" | "area" };

export function googleMapsLink(p: {
  lat?: number | null;
  lng?: number | null;
  precision?: MapPrecision | null;
  project?: string | null;
  district?: string | null;
  province?: string | null;
}): MapsLink | null {
  const search = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  const hasPoint = p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng);
  if (hasPoint && (p.precision === "exact" || p.precision === "project")) {
    return { url: search(`${p.lat},${p.lng}`), precision: p.precision };
  }
  const area = [p.district, p.province].map((x) => x?.trim()).filter(Boolean);
  const project = p.project?.trim();
  if (project && area.length) return { url: search([project, ...area].join(", ")), precision: "project" };
  if (area.length) return { url: search([...area, "Thailand"].join(", ")), precision: "area" };
  return null;
}
