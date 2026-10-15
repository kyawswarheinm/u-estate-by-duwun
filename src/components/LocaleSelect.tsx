"use client";

import { LOCALE_INFO, LOCALES, type Locale } from "@/lib/locale";

export function LocaleSelect({ id, value, onChange, label = "Language" }: { id: string; value: Locale; onChange: (l: Locale) => void; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <label htmlFor={id} className="text-sm text-ink-soft">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as Locale)} className="min-h-11 rounded border border-line bg-paper px-2 py-2">
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>{LOCALE_INFO[l].label}</option>
        ))}
      </select>
    </span>
  );
}
