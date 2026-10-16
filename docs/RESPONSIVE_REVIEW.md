# Responsive implementation and verification — 16 October 2026

Work stays on `ksh-final-branch`. No merge, rebase, push, or pull request was performed. Existing uncommitted theme, currency, translation and presentation work was preserved. Changes remain uncommitted because those files contain shared work.

## Design and implementation

The existing white/navy/blue palette and Inter/Noto typography remain the visual basis: white `#ffffff`, ink `#1d1d1f`, navy `#101d32`, blue `#0071e3`, soft surface `#f5f5f7`; dark mode uses the existing semantic token equivalents. Property information and financial values remain the priority. Layout direction follows the locale.

- A compact header opens a native modal mobile menu. It scrolls independently, keeps Close reachable, traps keyboard focus, restores focus on dismissal, and handles nested preference-menu Escape separately. Desktop navigation appears at 1280px, avoiding a crowded tablet header. Preferences expand in the sheet instead of floating outside it.
- Shared `src/app/responsive.css` handles fluid gutters, 320px headings, minimum control sizes, safe areas, landscape, reduced motion, long strings and input sizing. Overflow is addressed in components rather than hidden at the page boundary.
- Wallet activity, ranked offers, co-buy participants and listing fees use labelled mobile records while retaining table headers and every value/action. Wide market comparison tables have named, keyboard-focusable scrolling regions.
- Property grids, seller controls, deed details, market filters, password fields, language controls and search forms adapt to smaller widths. Market pagination now uses 12 external listings rather than 24, with all results still accessible.
- The mobile market map opens on demand; desktop keeps the map beside listings. “Show on map” opens the map and selects the correct marker. Map controls and marker hit areas are 44px; coincident markers are spaced farther apart.
- Voice uses a compact mobile launcher and a bounded scrollable panel. The launcher hides while a main-page input is focused. The WebRTC SDK loads after the user opens voice; its session then stays mounted across navigation. Token/network failures remain visible instead of producing unhandled rejections.
- Shared loading, retry and not-found states use localized messages. Font loading explicitly uses swap. The viewport allows zoom, respects safe areas and requests content resizing for virtual keyboards on supporting browsers.

Native menu, form and link behavior is used without an animation or component framework dependency. A permanent bottom bar was deliberately avoided: the existing property/account navigation and voice control already provide the necessary destinations without consuming another fixed strip of screen space.

## Skills and tooling

Inspected the installed skill-installer instructions and repository-local `frontend-design` and `webapp-testing` skills, including their source/provenance files. Used those existing skills rather than installing duplicate third-party skills. Read the installed Next.js 16.4 documentation for layouts, viewport, lazy loading and error boundaries before changing those APIs.

Python Playwright and axe-core were installed only in ignored `tmp/` tooling directories. No application dependency or lockfile changes were needed.

## Verification

### Build and static checks

- Production build: passed.
- TypeScript: passed.
- Vitest: 139 tests passed across 13 files.
- ESLint over `src/app`, `src/components`, `src/i18n`: passed without warnings.
- Repository-wide lint also inspected: an unrelated unused-variable warning remains in the pre-existing presentation build script `.codex-slides-build/build.mjs`.

### Browser coverage

Headless Microsoft Edge, against the local app using the configured hosted demo backend. Existing demo personas were used; no offers, commitments, listings or account profiles were created or modified for these checks. Browser-only API mocks tested AI/voice failures without paid requests.

1. **160 route/viewport checks:** 20 route/state variants at 320, 375, 430, 768, 1024, 1280, 1440 and 1920px. No unexpected page overflow or page JavaScript errors.
2. **251 additional layout checks:** all five locales and both themes on home, market and wallet; broader Arabic coverage across routes; 320/768/1440px and 667×375 landscape; additional 200% root-text-size checks. No unexpected overflow. This text-size test is not a substitute for testing each browser's zoom implementation.
3. Keyboard checks passed for menu focus containment, nested Escape and focus restoration. Landscape menu Close remains reachable. Lazy voice opens, fits, reports a mocked failure and closes. The launcher stays out of focused form fields. A mocked assistant rate-limit response remains readable.
4. Additional checks passed for inline empty-password validation, empty market search, localized 404, aborted voice-token requests and the open voice panel at all eight widths.
5. After the map-loading change, verified the closed mobile map, card-triggered opening/selection, collapse, desktop map visibility and reflow at all eight widths.

Routes included home, sign-in, sign-up, market, assistant, partners, ledger, sell, all four account screens, messages, a real message thread, notifications, condo/house detail, open and decided offer rooms, and a populated co-buy group. Dynamic fixture identifiers were discovered from the existing demo data, not guessed.

### Accessibility

axe-core WCAG 2 A/AA, 2.1 AA and 2.2 AA checks ran on 20 route/state variants in light and dark mode at 375px. All tested routes except the expanded map reported no violations. The final collapsed mobile market view also reports no violations in either theme.

**Remaining map finding:** some geographic marker hit areas overlap at the initial zoom. They are 44×44px, but axe flags partially obscured targets. Corresponding listing cards provide separate accessible “Show on map” controls. This needs manual accessibility review; it is not reported as a clean expanded-map scan. No WCAG conformance certification is claimed. axe also returns checks requiring manual review, retained in the local report.

### Local production performance

One sample per route, cold browser cache, 375×812, device scale 1, Edge CPU slowdown 4×, 150ms latency, 1.6Mbps download. These are local laboratory observations, not deployment or field Core Web Vitals.

| Route | LCP | CLS observed | Longest recorded menu interaction | Initial JS transfer |
|---|---:|---:|---:|---:|
| Home | 2.548s | 0 | 112ms | 318,664 bytes |
| Market | 2.740s | 0 | 112ms | 319,203 bytes |
| Sign-in | 2.644s | 0 | 72ms | 317,147 bytes |

The earlier market sample transferred 605,058 JS bytes; opening the map on demand reduced that by about 47%. LCP did not improve in the single subsequent sample, and server response times varied. The 2.5s LCP target is **not yet demonstrated**. Menu timing is not a full-session INP measurement. More representative deployed measurements and real-device checks are required before claiming production performance targets.

## Reproduce and review

Scripts:

- `scripts/browser/responsive-audit.py`: route/width sweep, screenshots, overflow/error report. Supports comma-separated `EXTRA_ROUTES` for existing co-buy/closed-offer/message fixtures.
- `scripts/browser/responsive-interactions.py`: keyboard, mocked failures, locale/theme/landscape/text sizing.
- `scripts/browser/responsive-quality.py`: axe checks plus throttled production lab samples. Optional `QUALITY_ROUTES` selects changed routes for a targeted rerun.

All scripts use `TEST_BASE_URL` (default `http://localhost:3000`). The quality check should use a production `next start` server, not development mode. They require Python Playwright with installed Edge; quality also expects `tmp/responsive-tools/node_modules/axe-core/axe.min.js`.

Local evidence is in ignored `tmp/responsive/`: `audit.json`, `interactions.json`, `accessibility-full.json`, the final targeted `accessibility.json`, `performance.json`, the before-map performance sample, and screenshots. Do not publish screenshots containing demo account or conversation content as real customer data.

Remaining human verification: physical iOS Safari and Android keyboards/safe areas, screen-reader table navigation, expanded-map target accessibility, live microphone/call continuity, and deployed performance under realistic network/device conditions. Browser automation did not perform financial transactions, place real calls, or certify every possible backend response state.
