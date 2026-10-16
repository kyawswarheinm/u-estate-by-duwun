// Approximate district centres (WGS84, rounded to 3 decimals ≈ 100 m) for placing U-Estate listings on the market map
// until properties store their own coordinates. A centre is only a district-level location: the map says so.
// External listings use their own coordinates from the scrape snapshot.

export const DISTRICT_CENTRES: Record<string, { lat: number; lng: number }> = {
  // Bangkok
  "Bang Kapi": { lat: 13.766, lng: 100.647 },
  "Bang Kho Laem": { lat: 13.693, lng: 100.503 },
  "Bang Na": { lat: 13.668, lng: 100.604 },
  "Bang Rak": { lat: 13.73, lng: 100.524 },
  "Bang Sue": { lat: 13.809, lng: 100.531 },
  Chatuchak: { lat: 13.828, lng: 100.56 },
  "Din Daeng": { lat: 13.77, lng: 100.553 },
  "Don Mueang": { lat: 13.913, lng: 100.59 },
  "Huai Khwang": { lat: 13.777, lng: 100.579 },
  "Khlong San": { lat: 13.731, lng: 100.509 },
  "Khlong Toei": { lat: 13.708, lng: 100.584 },
  "Lat Phrao": { lat: 13.804, lng: 100.607 },
  "Pathum Wan": { lat: 13.744, lng: 100.522 },
  "Phaya Thai": { lat: 13.78, lng: 100.543 },
  "Phra Khanong": { lat: 13.702, lng: 100.601 },
  Prawet: { lat: 13.717, lng: 100.694 },
  Ratchathewi: { lat: 13.759, lng: 100.534 },
  Sathorn: { lat: 13.709, lng: 100.526 },
  "Suan Luang": { lat: 13.731, lng: 100.651 },
  "Thon Buri": { lat: 13.725, lng: 100.486 },
  Watthana: { lat: 13.742, lng: 100.585 },
  "Yan Nawa": { lat: 13.696, lng: 100.543 },
  // Nonthaburi
  "Bang Yai": { lat: 13.871, lng: 100.398 },
  "Mueang Nonthaburi": { lat: 13.86, lng: 100.514 },
  "Pak Kret": { lat: 13.913, lng: 100.498 },
};

/** Centre of a district by its English name (case-insensitive), or null when the table doesn't know it. */
export function districtCentre(district: string) {
  const key = Object.keys(DISTRICT_CENTRES).find((d) => d.toLowerCase() === district.trim().toLowerCase());
  return key ? DISTRICT_CENTRES[key] : null;
}

/**
 * Source links from the scrape snapshot, made safe to render: only http(s) URLs pass. The contract checks z.url(),
 * which also accepts "javascript:" URLs, and the map builds its popup links outside React's URL protection.
 */
export function safeSourceUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** Where the map should open when there is nothing to fit: central Bangkok. */
export const BANGKOK_CENTRE = { lat: 13.75, lng: 100.55 };
