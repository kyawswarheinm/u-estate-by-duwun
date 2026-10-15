// The five UI languages (D-23). Full UI translation arrives with T18; partner features use this now.
export const LOCALES = ["en", "th", "ar", "zh-Hant", "es"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_INFO: Record<Locale, { label: string; english: string; speech: string; agent: "en" | "th" | "ar" | "zh" | "es"; dir: "ltr" | "rtl" }> = {
  en: { label: "English", english: "English", speech: "en-US", agent: "en", dir: "ltr" },
  th: { label: "ภาษาไทย", english: "Thai", speech: "th-TH", agent: "th", dir: "ltr" },
  ar: { label: "العربية", english: "Arabic", speech: "ar-SA", agent: "ar", dir: "rtl" },
  "zh-Hant": { label: "繁體中文", english: "Traditional Chinese", speech: "zh-TW", agent: "zh", dir: "ltr" },
  es: { label: "Español", english: "Spanish", speech: "es-ES", agent: "es", dir: "ltr" },
};

export function asLocale(v: unknown): Locale {
  return (LOCALES as readonly string[]).includes(String(v)) ? (v as Locale) : "en";
}
