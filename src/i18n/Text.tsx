"use client";
import { useI18n } from "./provider";
import { translateLabel, type MessageKey } from "./index";

export function Text({ message, values }: { message: MessageKey; values?: Record<string, string | number> }) {
  const { t } = useI18n();
  return t(message, values);
}
/** Only translate known system labels. User text remains unchanged. */
export function Label({ children }: { children: string }) {
  const { locale } = useI18n();
  return translateLabel(locale, children);
}
