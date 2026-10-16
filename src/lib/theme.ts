// Light / dark theme (globals.css: :root and :root[data-theme="dark"] tokens). Two states only: there is no
// "system" option. The choice lives in a readable cookie so the server renders it directly; before anyone has
// chosen, the inline script below starts from the device setting before the first paint (no flash).

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "theme";

/** The saved choice, or null when there is none yet (older "system" cookies count as none). */
export function asTheme(v: unknown): Theme | null {
  return (THEMES as readonly string[]).includes(String(v)) ? (v as Theme) : null;
}

/** Runs in <head> before paint: without a saved choice, start from the device setting. */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;if(!d.getAttribute("data-theme")){d.setAttribute("data-theme",matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}}catch(e){}})();`;

/** Client-side: apply a theme now, persist it for a year, and animate the change briefly. */
export function applyTheme(theme: Theme) {
  const d = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) d.classList.add("theme-switching");
  d.setAttribute("data-theme", theme);
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  if (!reduce) window.setTimeout(() => d.classList.remove("theme-switching"), 260);
}
