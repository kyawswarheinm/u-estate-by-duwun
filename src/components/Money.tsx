"use client";
import { useI18n } from "@/i18n/provider";
import { formatMoney, FX_DATE } from "@/i18n";

/** Always retain the authoritative THB amount; conversion is a labelled reference. */
export function Money({ amount }: { amount: number }) {
  const { locale, currency, t } = useI18n();
  return <span className="inline-flex max-w-full flex-col"><bdi>{formatMoney(amount, locale)}</bdi>{currency !== "THB" &&
    <small className="block whitespace-normal text-xs font-normal"><bdi>≈ {formatMoney(amount, locale, currency)}</bdi> · {t("Reference conversion only · {date}", { date: FX_DATE })}</small>}</span>;
}
