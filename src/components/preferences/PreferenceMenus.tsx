"use client";
// Language and currency menus and the light/dark switch. Language and currency save through the existing server
// action (cookies + the signed-in profile), so every page re-renders in the new choice; the theme applies instantly.

import { useState, useSyncExternalStore, useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import { CURRENCIES, CURRENCY_ISSUER, FX_DATE, currencyName, currencySymbol, type Currency } from "@/i18n";
import { savePreferences } from "@/i18n/actions";
import { LOCALE_INFO, LOCALES, type Locale } from "@/lib/locale";
import { applyTheme, type Theme } from "@/lib/theme";
import { Flag } from "./Flag";
import { OptionMenu } from "./OptionMenu";

/** Languages are not countries: a code chip, never a flag. */
function LangChip({ code }: { code: Locale }) {
  return (
    <span aria-hidden="true" className="grid h-6 min-w-8 shrink-0 place-items-center rounded-md border border-silver bg-ice px-1 text-[11px] font-bold tracking-wide text-deep">
      {code.slice(0, 2).toUpperCase()}
    </span>
  );
}

const ICONS: Record<Theme | "globe", React.ReactNode> = {
  globe: <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm0 0c2 2 3 4.6 3 7.5s-1 5.5-3 7.5m0-15c-2 2-3 4.6-3 7.5s1 5.5 3 7.5M2.8 7.5h14.4M2.8 12.5h14.4" />,
  light: <path d="M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM10 2v1.6M10 16.4V18M2 10h1.6M16.4 10H18M4.3 4.3l1.2 1.2M14.5 14.5l1.2 1.2M4.3 15.7l1.2-1.2M14.5 5.5l1.2-1.2" />,
  dark: <path d="M16.5 12.4A6.8 6.8 0 0 1 7.6 3.5a6.8 6.8 0 1 0 8.9 8.9Z" />,
};
function Icon({ name, size = 18 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width={size} height={size} className="shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>
  );
}

function useSave() {
  const { locale, currency } = useI18n();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  const save = (next: { locale?: Locale; currency?: Currency }) => {
    const form = new FormData();
    form.set("locale", next.locale ?? locale);
    form.set("currency", next.currency ?? currency);
    setFailed(false);
    start(async () => { try { await savePreferences(form); } catch { setFailed(true); } });
  };
  return { save, pending, failed };
}

export function LanguageMenu({ block = false }: { block?: boolean }) {
  const { locale, t } = useI18n();
  const { save, pending, failed } = useSave();
  const names = new Intl.DisplayNames([locale], { type: "language" });
  return (
    <>
      <OptionMenu
        title={t("Language")}
        value={locale}
        block={block}
        pending={pending}
        currentLabel={t("Current")}
        compact={!block}
        triggerLabel={`${t("Language")}: ${LOCALE_INFO[locale].label}`}
        trigger={block
          ? <><Icon name="globe" /><span lang={locale}>{LOCALE_INFO[locale].label}</span></>
          : <><Icon name="globe" size={16} /><span className="font-semibold tracking-wide">{locale.slice(0, 2).toUpperCase()}</span></>}
        options={LOCALES.map((l) => ({
          value: l,
          text: `${LOCALE_INFO[l].label} ${LOCALE_INFO[l].english}`,
          lang: l,
          icon: <LangChip code={l} />,
          label: LOCALE_INFO[l].label,
          description: names.of(l) ?? LOCALE_INFO[l].english,
        }))}
        onSelect={(l) => save({ locale: l })}
      />
      {failed && <p role="status" className="text-xs text-red">{t("Could not save preferences. Try again.")}</p>}
    </>
  );
}

export function CurrencyMenu({ block = false }: { block?: boolean }) {
  const { locale, currency, t } = useI18n();
  const { save, pending, failed } = useSave();
  return (
    <>
      <OptionMenu
        title={t("Currency")}
        value={currency}
        block={block}
        pending={pending}
        currentLabel={t("Current")}
        compact={!block}
        triggerLabel={`${t("Currency")}: ${currencyName(currency, locale)} (${currency})`}
        trigger={<><Flag issuer={CURRENCY_ISSUER[currency]} /><span className="font-semibold tabular-nums">{currency}</span></>}
        options={CURRENCIES.map((c) => ({
          value: c,
          text: `${c} ${currencyName(c, locale)}`,
          icon: <Flag issuer={CURRENCY_ISSUER[c]} />,
          label: currencyName(c, locale),
          description: <span dir="ltr">{c} · {currencySymbol(c, locale)}</span>,
        }))}
        footer={t("Prices are in Thai baht. Other currencies are approximate references at the {date} ECB rate.", { date: FX_DATE })}
        onSelect={(c) => save({ currency: c })}
      />
      {failed && <p role="status" className="text-xs text-red">{t("Could not save preferences. Try again.")}</p>}
    </>
  );
}

// The current theme is whatever <html data-theme> says: the server sets a saved choice, the boot script the first default.
function subscribeTheme(changed: () => void) {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");

/** Two-state light/dark switch: sun and moon, the active one highlighted. A real toggle button (aria-pressed = dark). */
export function ThemeToggle({ initial, block = false }: { initial: Theme | null; block?: boolean }) {
  const { t } = useI18n();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => initial ?? "light");
  const dark = theme === "dark";
  const toggle = (
    <button
      type="button"
      aria-pressed={dark}
      aria-label={t("Dark mode")}
      title={dark ? t("Switch to light mode") : t("Switch to dark mode")}
      onClick={() => applyTheme(dark ? "light" : "dark")}
      className="theme-toggle"
    >
      <span className="theme-toggle-knob" aria-hidden="true" />
      <span className="theme-toggle-icon" data-on={!dark} aria-hidden="true"><Icon name="light" size={16} /></span>
      <span className="theme-toggle-icon" data-on={dark} aria-hidden="true"><Icon name="dark" size={16} /></span>
    </button>
  );
  if (!block) return toggle;
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-silver bg-paper px-3">
      <span className="text-sm font-medium">{t("Dark mode")}</span>
      {toggle}
    </div>
  );
}
