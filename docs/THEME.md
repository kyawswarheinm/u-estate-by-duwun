# Theme: light, dark and system

**Added:** 16 Oct 2026. Code: `src/app/globals.css` (tokens), `src/lib/theme.ts` (preference, boot script), `src/app/layout.tsx` (server attributes), `src/components/preferences/PreferenceMenus.tsx` (menu).

## How it works

1. **Tokens.** Every colour comes from semantic CSS variables in `globals.css`. `:root` holds the light values and `:root[data-theme="dark"]` the dark ones; the names are the same, so components never mention a theme:

   | Token | Role |
   |---|---|
   | `--bg` | page |
   | `--paper` | surfaces: cards, panels, inputs, menus |
   | `--ice` | subtle surface, hovers |
   | `--silver` | dividers and card borders |
   | `--field-border` | input outlines (≥ 3:1) |
   | `--ink` | primary text |
   | `--deep` | secondary text |
   | `--blue-grey` (`text-muted`) | muted text |
   | `--midnight` | strong: headings, primary buttons; flips to near-white in dark |
   | `--on-strong` | text on `--midnight` |
   | `--blue` | accent |
   | `--blue-ink` | links and accent buttons |
   | `--green` / `--amber` / `--red` + `-soft`/`-bg` | status |
   | `--brand-navy` | fixed brand colour (map markers), same in both themes |

   Tailwind utilities (`bg-paper`, `text-ink`, `text-muted`, `border-field`, `text-on-strong`…) map onto these. Use them; don't write `bg-white`, `#fff` or Tailwind's grey palette in components.

2. **Always-dark bands.** The footer, the "Your listing" owner bar and the wallet balance card use the `.band` class (and the home hero is treated the same way). Inside a band, the tokens are pinned to their light-on-dark values, so the normal classes (`text-ice`, `text-silver`, `btn-on-dark`, `btn-ghost-dark`) work in both themes.

3. **Preference.** A readable cookie `theme` = `system` | `light` | `dark`, kept for a year. The server reads it and renders `<html data-theme-pref="…" data-theme="…">` for an explicit choice. For `system`, a tiny inline script in `<head>` (`THEME_BOOT_SCRIPT`) resolves `prefers-color-scheme` before the first paint, so there is no flash. The header keeps `system` in step with the device while the page is open.

4. **Switching** (`applyThemePref`) sets the attributes immediately (no reload), saves the cookie, and adds a 220 ms colour transition only while switching (off with reduced motion).

5. **Browser integration.** `viewport.colorScheme = "light dark"` and the CSS `color-scheme` property tell browsers the site has its own dark theme. That stops Chrome/Edge auto-darkening the page (the source of the earlier grey-on-dark text) and themes native controls and scrollbars. Dark mode swaps the navy logo for the white mark (`dark:` variant = `[data-theme="dark"]`).

## Accessibility

All text pairs meet WCAG AA (4.5:1 normal text; 3:1 for field outlines). This was checked with axe-core's colour-contrast rule on 17 pages: 11 public pages and 6 signed-in account pages, in light and dark at 1280 px and 375 px. The result was 0 violations. Text over photos and gradients can't be measured automatically and was reviewed visually.

## Known limits

- The OpenFreeMap base map stays the light "liberty" style in dark mode. Its popups and controls follow the theme.
- Decorative photos are unchanged in dark mode.
