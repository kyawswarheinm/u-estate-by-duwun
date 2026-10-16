"use client";

import { LOCALE_INFO, LOCALES, type Locale } from "@/lib/locale";
import { useI18n } from "@/i18n/provider";

export function LocaleSelect({ id, value, onChange, label }: { id: string; value: Locale; onChange: (l: Locale) => void; label?: string }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      <label htmlFor={id} className="text-sm text-ink-soft">{label ?? t("Language")}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as Locale)} className="min-h-11 rounded border border-line bg-paper px-2 py-2">
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>{LOCALE_INFO[l].label}</option>
        ))}
      </select>
    </span>
  );
}
