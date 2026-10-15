import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { currentUser } from "@/lib/session";
import { isCurrency, resolveLocale, translator, type Currency } from "./index";

export const getPreferences = cache(async () => {
  const [jar, me] = await Promise.all([cookies(), currentUser()]);
  const value = jar.get("currency")?.value;
  return {
    locale: resolveLocale(jar.get("locale")?.value, me?.locale),
    currency: (isCurrency(value) ? value : "THB") as Currency,
  };
});
export async function getTranslations() {
  return translator((await getPreferences()).locale);
}
