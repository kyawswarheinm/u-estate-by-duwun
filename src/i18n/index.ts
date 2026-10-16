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
// ECB reference rates via Frankfurter. A fixed, dated snapshot shown next to every conversion; never used
// for settlement, rules, offers or balances (THB is always the real amount). Refresh numbers and date together:
// https://api.frankfurter.dev/v1/2026-10-15?base=THB&symbols=USD,EUR,CNY  (previous snapshot: 2025-01-02)
export const FX_DATE = "2026-10-15";
export const FX_SOURCE = "European Central Bank reference rates (via Frankfurter)";
export const FX_RATES: Record<Currency, number> = { THB: 1, USD: 0.02981, EUR: 0.0266, CNY: 0.19949 };
/** Flag shown for each currency: its issuer. The euro is issued for the euro area, so it gets the EU flag. */
export const CURRENCY_ISSUER: Record<Currency, "TH" | "US" | "EU" | "CN"> = { THB: "TH", USD: "US", EUR: "EU", CNY: "CN" };
export function formatMoney(amountThb: number, locale: Locale, currency: Currency = "THB") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, numberingSystem: "latn", maximumFractionDigits: 0 })
    .format(amountThb * FX_RATES[currency]);
}
/** The authoritative THB amount, plus an approximate reference in the chosen currency ("฿4,000,000 (≈ $119,240)"). */
export function formatMoneyRef(amountThb: number, locale: Locale, currency: Currency = "THB") {
  const thb = formatMoney(amountThb, locale);
  // U+2068…U+2069 (first-strong isolate) keep the amount and its reference together as one unit inside any
  // sentence; the direction follows the formatted numbers (right-to-left in Arabic, left-to-right otherwise).
  return currency === "THB" ? thb : `\u2068${thb} (≈ ${formatMoney(amountThb, locale, currency)})\u2069`;
}
/** Localized currency name from the platform's CLDR data, e.g. "Thai Baht", "บาท". */
export function currencyName(currency: Currency, locale: Locale) {
  try { return new Intl.DisplayNames([locale], { type: "currency" }).of(currency) ?? currency; } catch { return currency; }
}
/** Narrow symbol, e.g. ฿ $ € ¥. */
export function currencySymbol(currency: Currency, locale: Locale) {
  const part = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol" }).formatToParts(0).find((x) => x.type === "currency");
  return part?.value ?? currency;
}
/** Short form for tight labels, e.g. "฿3K", "$146", "฿2.5M". Same conversion as formatMoney. */
export function formatMoneyCompact(amountThb: number, locale: Locale, currency: Currency = "THB") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "narrowSymbol", numberingSystem: "latn", notation: "compact", maximumFractionDigits: 1 })
    .format(amountThb * FX_RATES[currency]);
}
export function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { numberingSystem: "latn" }).format(value);
}
