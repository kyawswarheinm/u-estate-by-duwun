"use client";

// MapLibre needs the browser (WebGL), so the map is loaded on the client only, in its own bundle.
import dynamic from "next/dynamic";
import { useI18n } from "@/i18n/provider";

function Loading() {
  const { t } = useI18n();
  return <p role="status" className="grid h-[320px] place-items-center rounded-[14px] border border-line bg-white text-ink-soft sm:h-[440px]">{t("Loading map…")}</p>;
}

export const MarketMapLazy = dynamic(() => import("./MarketMap").then((m) => m.MarketMap), { ssr: false, loading: () => <Loading /> });
