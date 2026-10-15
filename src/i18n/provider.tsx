"use client";

import { createContext, useContext, type ReactNode } from "react";
import { translator, type Locale, type Currency } from "./index";

const Context = createContext<{ locale: Locale; currency: Currency }>({ locale: "en", currency: "THB" });
export function I18nProvider({ locale, currency, children }: { locale: Locale; currency: Currency; children: ReactNode }) {
  return <Context.Provider value={{ locale, currency }}>{children}</Context.Provider>;
}
export function useI18n() {
  const preferences = useContext(Context);
  return { ...preferences, t: translator(preferences.locale) };
}
