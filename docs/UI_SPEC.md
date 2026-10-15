# UI_SPEC: design system and screens (from the Figma "U-Estate Web App Design")

**Source of truth:** `docs/design-reference/App.tsx.txt` (screens, copy, structure) and `docs/design-reference/index.css` (all styles). Copy the look; **don't copy** the mock numbers, the testnet investing, or unverified claims (D-01, D-24, D-25).

## 1. Design tokens (put in `src/app/globals.css` `:root` and map them in `@theme inline`)

| Token | Value | Use |
|---|---|---|
| `--midnight` | `#101e32` | Primary text, primary buttons, dark sections (hero, ask-card, recommend-card, footer) |
| `--deep` | `#253e5b` | Secondary text, kicker labels |
| `--blue-grey` | `#748598` | Muted text, captions |
| `--ice` | `#eef3f8` | Page background, soft fills |
| `--silver` | `#c7d4de` | Borders, dividers |
| `--white` | `#ffffff` | Cards |
| `--blue` | `#2f7df6` | Accent: active nav underline, links, likely-value marker, "AI pick", logo diamond |
| `--green` / `--green-bg` | `#168347` / `#e9f7ef` | Good value, low risk, success |
| `--amber` / `--amber-bg` | `#a76100` / `#fff6df` | Overpriced, medium risk, warnings, SAMPLE/test-money labels |
| `--red` / `--red-bg` | `#c72e2e` / `#fff0f0` | Scam alert, high risk, errors |
| `--shadow` | `0 12px 35px rgba(16,30,50,.08)` | Floating cards |

- **Radii:** cards 14px; buttons 12px (10px on mobile); badges 20px (pill); small elements 8px.
- **Buttons:** `.btn` min-height 48px, padding 12×19. Kinds: primary (midnight bg, white), secondary (white, silver border), ghost (transparent, silver border), danger (red).

## 2. Typography

| Role | Font | Notes |
|---|---|---|
| Body + headings | **Manrope** 400/600/700 | h1/h2 letter-spacing −0.035em |
| Display accent | **Cormorant Garamond** 500 *italic* | Only for short accent phrases (e.g. Model Card hero "*clear evidence.*") |
| Thai | **Noto Sans Thai** 400/600 | Fallback in the font stack |
| Arabic | **Noto Sans Arabic** 400/600 | Fallback; RTL |
| Traditional Chinese | **Noto Sans TC** 400/600 | Fallback |
| Logo wordmark | Manrope 600 | The design references "Poppins" without loading it; use Manrope |

**Kicker / eyebrow:** uppercase, 11px, weight 600, letter-spacing 0.16em, colour `--deep` (`--silver` on dark).

**Load with `next/font/google`:** `Manrope`, `Cormorant_Garamond` (style italic), `Noto_Sans_Thai`, `Noto_Sans_Arabic`, `Noto_Sans_TC`. Font stack: `var(--font-manrope), var(--font-noto-thai), var(--font-noto-arabic), var(--font-noto-tc), Arial, sans-serif`.

**Logo (16 Oct):** the official **U with a keyhole** mark. Masters are in `/logo`:
- `u-estate-mark-midnight.png` (light backgrounds)
- `u-estate-mark-white.png` (dark backgrounds)
- `u-estate-app-icon.png` (rounded app icon)

`npm run brand` generates `public/brand/*`, `src/app/icon.png` and `src/app/apple-icon.png`. `Logo` in `SiteHeader.tsx` = mark + "U-Estate" wordmark (Manrope 700). The old CSS mark is retired.

## 3. Screen map (design → our app)

| Design screen | Route | Status in the app | Changes vs design |
|---|---|---|---|
| Home (hero, voice search, trust stats, market picker, how it works, featured, AI trust callout, ecosystem) | `/` | Rebuild | Trust stats must be **true**: "Every price shows its source", "Deed check on every listing", "Scam alerts on every listing". Remove "18,000+ projects analysed". Market picker: Thailand live; others "coming soon" |
| Smart Match | `/match` | New (P1) | Quiz → `/api/match` |
| Browse | `/browse` | Rebuild of the current `/` list | Filters + PropertyCard; loading / empty / error states as designed |
| Property detail | `/listing/[id]` | Restyle the current page | Fair-value card (our valuation), forecast tabs (our forecast), risk card, **stress-test card (new)**, "Why this price?" (real factors), neighbourhood, foreign-buyer guide (quota from DB), Ask AI panel (real assistant), owner message card → **link to the real conversation**. Sticky panel: Make an offer, **Join a co-buy group** (replaces Invest), Save, Ask AI |
| Offers (seller workspace) | `/listing/[id]/offers` | Restyle the current page | Sealed mode only (MVP); "AI pick" = top by the published weights; Accept / Decline (Counter P1) |
| AI Model Card | `/model-card` | New | Metrics from `model_cards` / `model-card.json`; dataset label (synthetic); data → model → explanation → voice flow; limitations; disclaimer |
| Voice overlay | Global **VoiceAgentDock** (*Talk to U-Estate*) | **Built (E3)** | ElevenLabs live agent; states: closed / connecting / listening / speaking / error; transcript + tool chips; typed input during the call; survives navigation (root layout) |
| Invest modal | **Co-buy modal** | Replace | Steps: Review (lane, amount, rules, quota/FET) → Confirm (test money) → Success (ledger link). **No testnet, no explorer** |
| Saved dashboard | `/dashboard` | New (P1) | Saved properties, recent AI checks, **my co-buy groups** (not "simulated investments") |
| — (new) | `/messages`, `/messages/[id]` | New (P0) | Chat in the dark ask-card style for AI, light bubbles for people; translation banner; scam warning banner |
| — (new) | `/sell` | Restyle | Create listing + deed check |
| — (new) | `/cobuy/[id]` | Restyle | Progress, quota meter, participants, agreement summary |
| — (new) | `/ledger` | Restyle | Transparency ledger table |
| — (new) | `/market/[district]` | New (P1) | District overview |
| — (new) | `/demo` | **Built as `/signin#personas`** (DEMO_MODE) | Persona sign-in grid, one click |
| Header / menu bar | All | **Built** | Sticky white bar. Left: logo. Centre: Find a home, Sell, Ask AI, Ledger, Partners, with a blue underline on the current page. Right: **Sign in** + **Create account** for guests; for signed-in users, an avatar button showing name and test-money balance that opens the account menu (Overview, My properties, Wallet, Account settings, List a property, Switch demo persona, Sign out). Below 768 px: logo + avatar + ☰ menu |
| — (new) | `/signin`, `/signup` | **Built** | Panel form with a Cormorant title, beside a personas / benefits column. Hint: "Any non-real email to demo, e.g. anythings@example.com". Show/hide password |
| — (new) | `/account`, `/account/properties`, `/account/wallet`, `/account/settings` | **Built** | Side navigation (horizontal on mobile); midnight balance card on Wallet |
| — (new) | `/assistant` | **Built** | Typed real-time chat (streamed), language select, tool chips, 🔊 per answer |
| — (new) | `/partners` | **Built** | Partner live/fallback status + "what data we send" table (D-37) |
| Home voice search | `/` | **Built (E2)** | VoiceSearch card under the hero: text field + 🎙 Speak + language select; results + spoken answer |
| — | `/cobuy/[id]`, `/listing/[id]/offers` | **Built (T1)** | TokenCheck `<details>` under the join/offer form |
| — | `/ledger` | **Built (A1)** | AnchorPanel above the table + per-row fingerprint ("on Avalanche ✓" / "not yet published") |
| Footer | All | Restyle | Text: "U-Estate is a technology marketplace. AI results are estimates, not financial or legal advice. Co-buy uses test money in this demo." (remove "testnet simulations") |
| Bottom tabs (mobile) | All | Restyle | Home, Browse, Ask AI (voice), Messages, Saved |

**Built styling (15 Oct):**
- `globals.css` maps the old prototype tokens (`ink`, `mist`, `line`, `teal`) onto the Figma tokens.
- New classes:
  - buttons: `.btn` with `btn-primary`, `btn-accent`, `btn-secondary`, `btn-on-dark`, `btn-ghost-dark`
  - forms: `.input`, `.field`, `.hint`
  - surfaces: `.panel`, `.pill`
  - brand and navigation: `.logo-mark`, `.nav-link`
- Fonts via `next/font`: Manrope (body), Cormorant Garamond (page titles and hero), Noto Sans Thai.
- Buttons with white text use `--blue-ink` (#1d5fd0) instead of `--blue`, for 4.5:1 contrast.
- The home hero is midnight. Its one bold element is the fee comparison ("who pays what on a ฿4,000,000 condo"), computed by the same fee rules as every listing.

## 4. Components (build once; one file each under `src/components/`)

`Logo`, `Button` (primary/secondary/ghost/danger), `Badge` (good/fair/warn/danger/sample), `AiLabel`, `Kicker`, `PropertyCard`, `IntelCard`, `ValueBar` (low/likely/high + asking marker), `ForecastChart` (SVG; central line + band, from data), `RiskList` (expandable rows: severity dot, label, evidence, "what to check next"), `StressTest` (preset chips + 4 sliders + result tiles), `FactorRow`, `FeeTable`, `OfferTable`, `RecommendCard`, `ChatThread` + `MessageBubble` (translation toggle, risk banner), `AskAiPanel` (streaming), `VoiceOverlay`, `CobuyModal`, `QuotaMeter`, `LedgerTable`, `LocaleSwitcher`, `CurrencySwitcher`, `EmptyState` / `ErrorState` / `LoadingState` (design `.state-card`).

**Partner components (built, restyle with tokens in T33):**
- `ExplainVoice` (5-language select + 🔊)
- `VoiceSearch`
- `VoiceAgentDock`
- `AssistantChat`
- `TokenCheck`
- `AnchorPanel`
- `LocaleSelect`
- `speak.ts` (TTS with browser fallback)

The bottom-tab "Ask AI (voice)" opens the dock.

## 5. Internationalisation (D-23)

- **Locales:** `en` (source), `th`, `ar`, `zh-Hant`, `es`. Dictionaries live in `src/i18n/<locale>.ts` as typed objects with the same keys. A unit test fails if any key is missing.
- The locale is stored in a cookie `locale` plus `profiles.locale`. The server sets `<html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"}>`.
- **RTL:** use **logical** utilities/properties only (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`, `text-start`). Mirror arrows and chevrons in RTL (`rtl:-scale-x-100`). Charts keep time flowing left → right.
- **Numbers and currency:** `Intl.NumberFormat(locale, {style:"currency", currency})`. Show THB as the base; other currencies get "≈ … for reference" from a static rate table with its date. Use Latin digits (`numberingSystem: "latn"`) for consistency across locales.
- **Machine-translated strings:** draft TH/AR/ZH-Hant/ES with Claude, mark the file header `// review: machine-translated`, and have a native speaker review Thai first.
- **Dynamic content** (descriptions, chat) is translated by `ai/translate` (AI_SPEC §3.3) and shown with the translation banner.

## 6. Accessibility and states

- Landmarks (`header`, `nav`, `main`, `footer`). Every input has a visible `label`. Status is never shown by colour alone (icon + text). `aria-live="polite"` for AI results, chat arrivals and form results.
- Dialogs (voice, co-buy) use `<dialog>` with focus trapping and Esc to close. Tap targets ≥ 44px. `:focus-visible` uses the design outline `3px rgba(47,125,246,.3)`.
- Each data view has loading, empty, error and success states, following the design's `.state-card`.

## 7. Honesty labels (always visible)

| Where | Label |
|---|---|
| AI results | `AI` label + "Estimate, not financial advice" |
| Translations | "AI translation: may contain errors · See original" |
| Sample or synthetic data | Amber `SAMPLE` / `SYNTHETIC DATA` badge |
| Co-buy and ledger | "Test money: no real funds or ownership" |
| Deed check | "Confirm ownership at the Land Office" |
| Voice | Which voice played ("ElevenLabs voice" / "built-in browser voice"); "We don't store recordings" |
| Voice agent | "AI · cannot move money or sign anything · not financial advice" |
| Token check | `SAMPLE DATA` for sample tokens; "U-Estate never accepts crypto"; "risk information, not investment advice"; buffer = "assumption" |
| Avalanche | "Only the fingerprint goes on-chain: no names, no money, no tokens"; "test network" |
