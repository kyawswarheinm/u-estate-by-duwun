"use client";

import { useSyncExternalStore, useState } from "react";
import { useI18n } from "@/i18n/provider";

const eventName = "uestate-saved-change";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}
function read(id: string) {
  try { return localStorage.getItem(`uestate:saved:${id}`) === "1"; }
  catch { return false; }
}

/** A browser-local shortlist; never implies an account or database write. */
export function FavoriteButton({ id }: { id: string }) {
  const { t } = useI18n();
  const saved = useSyncExternalStore(subscribe, () => read(id), () => false);
  const [unavailable, setUnavailable] = useState(false);
  return <button type="button" className="favorite-button" aria-pressed={saved}
    aria-label={t(saved ? "unsaveProperty" : "saveProperty")}
    title={unavailable ? t("saveUnavailable") : t("savedDevice")}
    onClick={() => {
      try {
        if (saved) localStorage.removeItem(`uestate:saved:${id}`);
        else localStorage.setItem(`uestate:saved:${id}`, "1");
        window.dispatchEvent(new Event(eventName));
      } catch { setUnavailable(true); }
    }}>
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
    {unavailable && <span className="favorite-error" role="status">{t("saveUnavailable")}</span>}
  </button>;
}
