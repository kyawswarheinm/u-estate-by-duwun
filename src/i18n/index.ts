import { en, type Dictionary, type MessageKey } from "./en";
import { th } from "./th";
import { ar } from "./ar";
import { zhHant } from "./zh-Hant";
import { es } from "./es";
import { LOCALES, type Locale } from "../lib/locale";

export { LOCALES, type Locale, type Dictionary, type MessageKey };
export const dictionaries: Record<Locale, Dictionary> = { en, th, ar, "zh-Hant": zhHant, es };
export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.some((locale) => locale === value);
}
export function resolveLocale(cookie: unknown, profile: unknown): Locale {
  return isLocale(cookie) ? cookie : isLocale(profile) ? profile : "en";
}
export function translator(locale: Locale) {
  return (key: MessageKey, values: Record<string, string | number> = {}) =>
    (dictionaries[locale][key] ?? en[key] ?? String(key)).replace(/\{(\w+)\}/g, (token, name: string) =>
      Object.hasOwn(values, name) ? String(values[name]) : token);
}
/** Data and server validation messages can include source labels outside the UI dictionary.
 * Keep the original rather than inventing a translation for user-authored content. */
export function translateLabel(locale: Locale, source: string) {
  return Object.hasOwn(en, source) ? translator(locale)(source as MessageKey) : source;
}
export const CURRENCIES = ["THB", "USD", "EUR", "CNY"] as const;
export type Currency = typeof CURRENCIES[number];
export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && CURRENCIES.some((currency) => currency === value);
}
// ECB rates via Frankfurter. Fixed historical snapshot, never used for settlement or rules.
// https://api.frankfurter.dev/v1/2025-01-02?base=THB&symbols=USD,EUR,CNY
export const FX_DATE = "2025-01-02";
export const FX_RATES: Record<Currency, number> = { THB: 1, USD: 0.02919, EUR: 0.02828, CNY: 0.21309 };
export function formatMoney(amountThb: number, locale: Locale, currency: Currency = "THB") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, numberingSystem: "latn", maximumFractionDigits: 0 })
    .format(amountThb * FX_RATES[currency]);
}
/** Short form for tight labels, e.g. "฿3K", "$146", "฿2.5M". Same conversion as formatMoney. */
export function formatMoneyCompact(amountThb: number, locale: Locale, currency: Currency = "THB") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", numberingSystem: "latn", notation: "compact", maximumFractionDigits: 1 })
    .format(amountThb * FX_RATES[currency]);
}
export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(value);
}
