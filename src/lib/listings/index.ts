// Loads the real-listings file once and validates it, like the market snapshots (src/lib/market-data/index.ts).
import file from "../../data/market/verified-listings.json";
import { RealListingsFile } from "./schema";

export const REAL_LISTINGS = RealListingsFile.parse(file);
export * from "./schema";
export { googleMapsLink, type MapsLink } from "./maps";
