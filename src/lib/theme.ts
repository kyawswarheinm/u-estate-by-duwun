// Light / dark / system theme (globals.css: :root and :root[data-theme="dark"] tokens).
// The preference lives in a readable cookie so the server can render an explicit choice directly; for
// "system" the inline script below resolves prefers-color-scheme before the first paint (no flash).

export const THEME_PREFS = ["system", "light", "dark"] as const;
export type ThemePref = (typeof THEME_PREFS)[number];
export const THEME_COOKIE = "theme";

export function asThemePref(v: unknown): ThemePref {
  return (THEME_PREFS as readonly string[]).includes(String(v)) ? (v as ThemePref) : "system";
}

/** Runs in <head> before paint. Reads data-theme-pref set by the server; resolves "system". */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var p=d.getAttribute("data-theme-pref")||"system";if(p==="system"){d.setAttribute("data-theme",matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}}catch(e){}})();`;

/** Client-side: apply a preference now, persist it for a year, and animate the change briefly. */
export function applyThemePref(pref: ThemePref) {
  const d = document.documentElement;
  const resolved = pref === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : pref;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) d.classList.add("theme-switching");
  d.setAttribute("data-theme-pref", pref);
  d.setAttribute("data-theme", resolved);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE}=${pref}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  if (!reduce) window.setTimeout(() => d.classList.remove("theme-switching"), 260);
}
