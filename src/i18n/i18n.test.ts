import { describe, expect, it } from "vitest";
import { CURRENCIES, CURRENCY_ISSUER, currencyName, currencySymbol, dictionaries, LOCALES, resolveLocale, translator, formatMoney, formatMoneyRef, formatNumber, FX_DATE, FX_RATES, translateLabel } from "./index";
import { en } from "./en";
import { LOCALE_INFO } from "../lib/locale";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("five-locale dictionaries", () => {
  for (const locale of LOCALES) {
    it(`${locale} has exactly the source keys, nonempty values and matching placeholders`, () => {
      const dictionary = dictionaries[locale];
      expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(dictionary[key].trim(), `${locale}: ${key}`).not.toBe("");
        expect(placeholders(dictionary[key]), `${locale}: ${key}`).toEqual(placeholders(en[key]));
      }
    });
  }
  it("resolves valid cookie, profile and default preferences without accepting inherited keys", () => {
    expect(resolveLocale("ar", "th")).toBe("ar");
    expect(resolveLocale("invalid", "th")).toBe("th");
    expect(resolveLocale(undefined, undefined)).toBe("en");
    expect(resolveLocale("__proto__", "constructor")).toBe("en");
    expect(LOCALE_INFO.ar.dir).toBe("rtl");
    expect(LOCALES.filter((locale) => LOCALE_INFO[locale].dir === "rtl")).toEqual(["ar"]);
  });
  it("interpolates values literally, preserves user content and does not execute markup", () => {
    expect(translator("es")("Hello, {name}", { name: "$& <script>" })).toBe("Hola, $& <script>");
    expect(translateLabel("ar", "User-authored property name")).toBe("User-authored property name");
  });
  it("uses Latin digits across locales and keeps reference FX separate from base THB", () => {
    for (const locale of LOCALES) {
      expect(formatNumber(123, locale)).toBe("123");
      expect(formatMoney(123456, locale).replace(/[^0-9]/g, "")).toBe("123456");
      expect(formatMoney(1000, locale, "USD")).toContain(String(Math.round(1000 * FX_RATES.USD)));
      // THB stays first and real; other currencies are an approximate reference next to it.
      expect(formatMoneyRef(1000, locale, "THB")).toBe(formatMoney(1000, locale));
      expect(formatMoneyRef(1000, locale, "EUR")).toBe(`\u2068${formatMoney(1000, locale)} (≈ ${formatMoney(1000, locale, "EUR")})\u2069`);
    }
    expect(FX_RATES.THB).toBe(1);
    expect(FX_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it("names every currency, gives it a symbol and an issuer flag", () => {
    for (const c of CURRENCIES) {
      expect(currencyName(c, "en").length).toBeGreaterThan(2);
      expect(currencySymbol(c, "en").length).toBeGreaterThan(0);
      expect(CURRENCY_ISSUER[c]).toMatch(/^[A-Z]{2}$/);
    }
    expect(currencySymbol("THB", "en")).toBe("฿");
    expect(CURRENCY_ISSUER.EUR).toBe("EU");
  });
});
