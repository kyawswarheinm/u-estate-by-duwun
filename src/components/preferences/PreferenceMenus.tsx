"use client";
// Language, currency and theme menus. Language and currency save through the existing server action
// (cookies + the signed-in profile), so every page re-renders in the new choice; theme applies instantly.

import { useEffect, useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import { CURRENCIES, CURRENCY_ISSUER, FX_DATE, currencyName, currencySymbol, type Currency } from "@/i18n";
import { savePreferences } from "@/i18n/actions";
import { LOCALE_INFO, LOCALES, type Locale } from "@/lib/locale";
import { applyThemePref, THEME_PREFS, type ThemePref } from "@/lib/theme";
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

const ICONS: Record<ThemePref | "globe", React.ReactNode> = {
  globe: <path d="M10 2.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Zm0 0c2 2 3 4.6 3 7.5s-1 5.5-3 7.5m0-15c-2 2-3 4.6-3 7.5s1 5.5 3 7.5M2.8 7.5h14.4M2.8 12.5h14.4" />,
  light: <path d="M10 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM10 2v1.6M10 16.4V18M2 10h1.6M16.4 10H18M4.3 4.3l1.2 1.2M14.5 14.5l1.2 1.2M4.3 15.7l1.2-1.2M14.5 5.5l1.2-1.2" />,
  dark: <path d="M16.5 12.4A6.8 6.8 0 0 1 7.6 3.5a6.8 6.8 0 1 0 8.9 8.9Z" />,
  system: <path d="M3 4.5h14v9H3zM7.5 16.5h5M10 13.5v3" />,
};
function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</svg>
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
        triggerLabel={`${t("Language")}: ${LOCALE_INFO[locale].label}`}
        trigger={<><Icon name="globe" /><span lang={locale} className={block ? "" : "hidden xl:inline"}>{LOCALE_INFO[locale].label}</span><span className={block ? "hidden" : "xl:hidden"}>{locale.slice(0, 2).toUpperCase()}</span></>}
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
        triggerLabel={`${t("Currency")}: ${currencyName(currency, locale)} (${currency})`}
        trigger={<><Flag issuer={CURRENCY_ISSUER[currency]} /><span className="tabular-nums">{currency}</span></>}
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

/** Keeps "system" in step with the device while the page is open. */
export function useSystemThemeSync(pref: ThemePref) {
  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const sync = () => document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [pref]);
}

export function ThemeMenu({ pref, onChange, block = false }: { pref: ThemePref; onChange: (p: ThemePref) => void; block?: boolean }) {
  const { t } = useI18n();
  const LABEL = { system: t("System"), light: t("Light"), dark: t("Dark") } as const;
  return (
    <OptionMenu
      title={t("Theme")}
      value={pref}
      block={block}
      currentLabel={t("Current")}
      triggerLabel={`${t("Theme")}: ${LABEL[pref]}`}
      trigger={<><Icon name={pref} /><span className={block ? "" : "sr-only"}>{LABEL[pref]}</span></>}
      options={THEME_PREFS.map((p) => ({
        value: p,
        text: LABEL[p],
        icon: <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-silver bg-ice text-ink"><Icon name={p} /></span>,
        label: LABEL[p],
        description: p === "system" ? t("Use your device setting") : undefined,
      }))}
      onSelect={(p) => { applyThemePref(p); onChange(p); }}
    />
  );
}
