"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";
import { CURRENCIES, LOCALES } from "@/i18n";
import { LOCALE_INFO } from "@/lib/locale";
import { savePreferences } from "@/i18n/actions";

export function LocaleSwitcher() {
  const { locale, currency, t } = useI18n();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);
  return (
    <form className="flex flex-wrap items-end gap-2" action={(form) => {
      setError(false);
      startTransition(async () => {
        try { await savePreferences(form); } catch { setError(true); }
      });
    }}>
      <label className="field text-sm">{t("Language")}
        <select key={locale} name="locale" defaultValue={locale} className="input" disabled={pending}>
          {LOCALES.map((value) => <option key={value} value={value} lang={value}>{LOCALE_INFO[value].label}</option>)}
        </select>
      </label>
      <label className="field text-sm">{t("Currency")}
        <select key={currency} name="currency" defaultValue={currency} className="input" disabled={pending}>
          {CURRENCIES.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <button className="btn btn-secondary" disabled={pending}>{t(pending ? "Saving…" : "Apply")}</button>
      <p role="status" className="w-full text-sm">{error ? t("Could not save preferences. Try again.") : ""}</p>
    </form>
  );
}
