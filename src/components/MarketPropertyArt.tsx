import { Text } from "@/i18n/Text";
// Editorial demo photography is labelled and never represents the actual property.
// Uploaded listing photos continue to take precedence in the calling components.

export type ArtVariant = "condo" | "luxury" | "townhouse" | "house" | "apartment" | "office" | "land";

/** Picks a drawing from the property type and title words (apartment / office / luxury). */
export function artVariant(type: string, title = ""): ArtVariant {
  if (/office/i.test(title)) return "office";
  if (/apartment/i.test(title)) return "apartment";
  if (/luxury/i.test(title)) return "luxury";
  if (type === "townhouse" || type === "house" || type === "land" || type === "condo") return type;
  return "apartment"; // other whole buildings
}

import Image from "next/image";

export function MarketPropertyArt({ variant, className = "" }: { variant: ArtVariant; className?: string }) {
  const photo = variant === "house" || variant === "townhouse" || variant === "land" ? "house" : variant === "luxury" ? "residence" : "interior";
  return <span className={`editorial-photo ${className}`}><Image src={`/photography/${photo}.jpg`} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" /><span className="photo-label"><Text message="demoPhotography" /></span></span>;
}
