# WORKPLAN: three developers in parallel, one merge

**Updated:** Fri 16 Oct 2026, ~05:00 ICT. Architecture: [TECH_STACK.md](TECH_STACK.md). This replaces T01–T41 for new work; the old IDs stay in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) as history.

**Goal:** add market intelligence behind the voice agent and the chatbox:
- scraped market listings (P1);
- descriptive analysis and a TimesFM forecast (P2);
- the tools, voice, chat and a map that make it usable (P3).

The three parts meet only through a **frozen contract** that is already on `main`, so nobody waits for anybody.

| Person | Part | Suggested owner (edit freely) | Branch |
|---|---|---|---|
| **P1** | Data: Scrapy + cleaning + geocoding + property finding | Backend developer + Claude | `p1/market-data` |
| **P2** | Analytics: descriptive stats + TimesFM forecast | Meena (wrote the valuation engine) | `p2/market-analytics` |
| **P3** | Experience: AI tools, voice agent, chatbox, OpenFreeMap map, `/market` page | Joanna (UI + i18n) | `p3/market-experience` |

## 1. Timeline (Fri 16 Oct, ICT)

| Time | What |
|---|---|
| 05:15 | Everyone pulls `main` (contract + fixtures are there) and creates their branch |
| 05:15–10:30 | Build. Push your branch at **08:00** and **10:00** at the latest |
| **08:00** | Checkpoint: P1 pushes the first real `listings.json`. P2 and P3 *try* it locally, without committing it (§6) |
| **10:30** | Pull request cut-off. Merge order P1 → P2 → P3 (§7) |
| 11:30 | Vercel deploy + smoke test |
| **12:00** | Feature freeze (HANDOFF). Then deck, video, submission by 13:30 |

## 2. Who owns which files (stay inside yours)

| Path | Owner |
|---|---|
| `pipeline/scraper/**`, `src/data/market/listings.json`, `src/lib/market-data/find.ts` (+ `find.test.ts`), `docs/work/P1.md` | **P1** |
| `pipeline/analytics/**`, `src/data/market/stats.json`, `src/data/market/forecast.json`, `src/lib/market-data/analytics.ts` (+ `analytics.test.ts`), `docs/MARKET_ANALYTICS.md`, `docs/work/P2.md`; stretch: `src/data/index-sample.ts` | **P2** |
| `src/lib/assistant-tools.ts`, `src/app/api/assistant/**`, `src/app/api/agent-tools/**`, `scripts/create-voice-agent.mjs`, `src/components/VoiceAgentDock.tsx`, `src/app/market/**`, `src/components/Market*.tsx`, `src/lib/market-data/district-centres.ts`, `src/app/listing/[id]/page.tsx`, `src/components/SiteHeader.tsx`, `src/i18n/*`, `package.json` + `package-lock.json`, `tests/partner-api.check.mjs`, `docs/DEMO_SCRIPT.md`, `docs/work/P3.md` | **P3** |
| **Frozen contract:** `src/lib/market-data/types.ts`, `index.ts`, `contract.test.ts`, `.gitignore`, `docs/DECISIONS.md` | All three agree → a tiny PR to `main` → everyone runs `git merge main` |
| `docs/HANDOFF.md`, `docs/TECH_STACK.md`, `docs/WORKPLAN.md` | Integrator, at merge time |
| Everything else | Nobody in this phase. Ask the team first |

**Rules:**
1. `git checkout main && git pull`, then `git checkout -b <your branch>`.
2. Commit small and often.
3. Run `npm run check` before every push; the contract test is part of it.
4. Never use `--no-verify`.
5. Don't merge other people's branches. Merge `main` into yours only when the contract changed.
6. Keep your progress notes in **your own** `docs/work/Pn.md`, not in HANDOFF, so the notes never conflict.
7. Keys go only in `.env.local` or Vercel. Raw pages, venvs and model weights are git-ignored, and must stay that way.

## 3. The contract (already on `main`)

| File | Written by | Shape |
|---|---|---|
| `src/data/market/listings.json` | P1 | `ListingsFile`: facts-only external listings + provenance (`meta.sites`, `scraped_at`, `is_sample`) |
| `src/data/market/stats.json` | P2 | `StatsFile`: per district × type × kind (and `"ALL"`): count, median / p25 / p75 price per m², median price, median area |
| `src/data/market/forecast.json` | P2 | `ForecastFile`: per series: history + forecast `p10/p50/p90`, model, source, backtest |

- All three types are in `src/lib/market-data/types.ts`.
- Today each file holds a **FIXTURE** labelled `is_sample: true`. Replace it with real data in the same shape.
- `contract.test.ts` rejects unknown fields, phone numbers, emails, LINE IDs, unordered quartiles and quantiles.

**Functions P3 calls** (keep the names and return shapes; improve the insides):

| Function | File (owner) | AI tool name (P3 registers it) |
|---|---|---|
| `findMarketListings(MarketSearchSchema)` | `find.ts` (P1) | `search_market_listings` |
| `getMarketStats(MarketStatsSchema)` | `analytics.ts` (P2) | `get_market_stats` |
| `getPriceForecast(PriceForecastSchema)` | `analytics.ts` (P2) | `get_price_forecast` |
| `compareToMarket({priceThb, areaSqm, district, type, kind})` | `analytics.ts` (P2) | `compare_to_market {listing_id}` (P3 combines it with `listingFacts`) |

## 4. P1: Data (scraping, cleaning, property finding)

| ID | Task (time box) | Done when |
|---|---|---|
| **P1T01** | **Pick sources (30 min).** Check 3–4 candidate Thai listing sites (for example DDproperty, Hipflat, FazWaz, Livinginsider, Dot Property). Assume nothing; check each one: `robots.txt` for the search and listing paths, terms on automated access, any anti-bot challenge (if there is one, **skip the site**), and the fields on the page (price, size, district, coordinates in JSON-LD or embedded page data). Search GitHub for an open-source spider for the chosen site ("real estate finding repo"); reuse it only under MIT, BSD or Apache, and credit it. | `pipeline/scraper/SOURCES.md` names one primary and one backup site, with dates, the robots result, the terms note and the reasons |
| **P1T02** | **Scrapy project (75 min).** `pipeline/scraper/`, with `requirements.txt` pinning `scrapy==2.19.0`. Settings follow TECH_STACK §4: `ROBOTSTXT_OBEY=True`, `CONCURRENT_REQUESTS_PER_DOMAIN=1`, `DOWNLOAD_DELAY=2`, AutoThrottle on, `HTTPCACHE_ENABLED=True`, an honest `USER_AGENT`. Spider for site 1: Bangkok + vicinity, condos and houses for sale (condo rent is optional). The item has **only** the contract fields. Try `-s CLOSESPIDER_ITEMCOUNT=50` first. | 50 clean items in `pipeline/scraper/out/` (git-ignored) |
| **P1T03** | **Clean + export (45 min).** `pipeline/scraper/export.py`:<br>• normalise type, kind and district to U-Estate's English spelling (Sathorn, Bang Na…);<br>• convert land units (1 rai = 1,600 m², 1 square wa = 4 m²);<br>• drop rows with no price or area;<br>• dedupe on project + area + price;<br>• drop price-per-m² outliers outside the 1st–99th percentile per type;<br>• round coordinates to 3 decimals;<br>• ids are `ext-<site>-<sha1(url)[:10]>`.<br>Write `src/data/market/listings.json` with `meta.source: "scrape"`, `is_sample: false`. | 200–500 listings; `npm test` is green. **Push by 08:00** |
| **P1T04** | **Coordinates (45 min).** Page coordinates if present → `exact`. Else Nominatim on "project, district, Bangkok" → `project` (max 1 request/s, a User-Agent with a contact address, cached in `pipeline/scraper/cache/`). Else the district centre → `district`. | ≥ 80% of rows have coordinates |
| **P1T05** | **Property finding (45 min).** Improve `findMarketListings`: a sort option (price, price per m², newest), `near` search, a clear empty result. Add `src/lib/market-data/find.test.ts`. | Tests green; exported names unchanged |
| **P1T06** | *Stretch (45 min):* the backup site or condo rentals, through the same export. Skip it if you're behind. | More rows; contract still green |

## 5. P2: Analytics (descriptive + TimesFM)

| ID | Task (time box) | Done when |
|---|---|---|
| **P2T01** | **Real index data (30 min).** Download the Bank of Thailand residential property price index for Bangkok and vicinity (condominium, single-detached house, townhouse), monthly if available, otherwise quarterly. Save `pipeline/analytics/data/bot_rppi.csv` (`period,series_key,value`) and `SOURCE.md` (exact URL, table name, base year, download date). If it's blocked after 30 min, keep the fixture series and leave `is_sample: true`. | The CSV and its source note are committed |
| **P2T02** | **TimesFM forecast (75 min, hard stop 07:45).** Venv with Python 3.11; `pipeline/analytics/requirements.txt` with `timesfm[torch]==3.0.2`. `forecast.py`: whole history as context, 12 months (or 4 quarters) ahead, quantiles 0.1 / 0.5 / 0.9 → `p10/p50/p90`, `device="cpu"`. Follow the installed version's README: 3.0 uses `timesfm3.TimesFM3Evaluator` + `ModelConfig` with checkpoint `google/timesfm-3.0-pytorch`. Write `src/data/market/forecast.json` with `source: "timesfm"`. **If there's no output by 07:45:** write the same file from the existing log-linear method (`src/lib/valuation/forecast.ts`) with `source: "fallback"` and move on. | `forecast.json` is real; contract green |
| **P2T03** | **Backtest (30 min).** Hold out the last 12 months. Compute the MAPE of TimesFM's p50 against the log-linear baseline and write it to `meta.backtest`. Report it honestly even if TimesFM loses (D-25). | `meta.backtest` is filled by the script |
| **P2T04** | **Descriptive analysis (60 min).** `pipeline/analytics/describe.py --listings <path>` (pandas or DuckDB). By district × type × kind, plus `"ALL"`: count, median / p25 / p75 price per m², median price, median area. `min_count = 5`. Write `src/data/market/stats.json`. Build it on the fixture now and on P1's 08:00 file locally. **Don't commit P1's file.** | Reruns in one command; contract green |
| **P2T05** | **`analytics.ts` (45 min).** Add `last_12m_change_pct` to `getPriceForecast`; per-district trend where the data allows; `src/lib/market-data/analytics.test.ts`. | Tests green; exported names unchanged |
| **P2T06** | **Model card (30 min).** `docs/MARKET_ANALYTICS.md`: the data source, the model, the horizon, the backtest numbers *as the script printed them*, and the limits (asking prices, not sales; an index, not one property). | Every number traces to a script output |
| **P2T07** | *Stretch, after 10:00 only if all green:* replace the SAMPLE index in `src/data/index-sample.ts` with the BOT series (the price panel and valuation use it). Run `npm run check`. | No SAMPLE label on the price chart |

## 6. P3: Experience (AI tools, voice, chat, map)

| ID | Task (time box) | Done when |
|---|---|---|
| **P3T01** | **Register 4 tools (45 min)** in `src/lib/assistant-tools.ts`: `search_market_listings`, `get_market_stats`, `get_price_forecast`, `compare_to_market {listing_id}`. Reuse the zod schemas from `find.ts` / `analytics.ts`. In the chat system prompt (`api/assistant/route.ts`) add TECH_STACK §5:<br>• show U-Estate listings first;<br>• label external listings "not checked by U-Estate" and link them;<br>• say "asking prices";<br>• give forecasts as a range, not a guarantee;<br>• say SAMPLE while `is_sample`. | `curl /api/agent-tools` returns each tool on the fixtures; the chat answers a market question with numbers + source |
| **P3T02** | **Voice agent (45 min).** Add the same 4 tools to `scripts/create-voice-agent.mjs` (TOOLS + PROMPT) and to `VoiceAgentDock.tsx` (`clientTools`, `TOOL_LABEL`). A human with the ElevenLabs key runs the script and puts the new `ELEVENLABS_AGENT_ID` in `.env.local` and Vercel. **Never in chat or git.** | Spoken: "How are condo prices in Sathorn?" gets numbers, a source and a date |
| **P3T03** | **Map (75 min).** `npm i maplibre-gl@6.14.0` (only P3 touches `package.json`). Client component `src/components/MarketMap.tsx`, dynamically imported:<br>• style `https://tiles.openfreemap.org/styles/liberty`;<br>• **keep the attribution visible**;<br>• external listings in a neutral colour (popup: price, m², price per m², site, date, "Open source ↗");<br>• U-Estate listings in the brand colour, linking to `/listing/<id>`, placed by `src/lib/market-data/district-centres.ts` until properties expose lat/lng. | The map renders on desktop and at 375 px; markers open |
| **P3T04** | **`/market` page (60 min).** `src/app/market/page.tsx` (server):<br>• filters (type, kind, district);<br>• a stats table (`getMarketStats`);<br>• a forecast chart with the p10–p90 band (adapt `IndexChart`);<br>• an external-listings table with source links (the accessible version of the map);<br>• a provenance line (snapshot date, sites, model, SAMPLE badge);<br>• an "Ask the AI about this market" button. | Works without the map too; keyboard reachable |
| **P3T05** | **Listing badge (30 min).** On `/listing/[id]`: "Compared with N asking prices in Sathorn: X% above / below the median" via `compareToMarket`, labelled. | Shows on the 3 demo listings |
| **P3T06** | **Nav + i18n + checks (45 min).** Add a "Market" link to `SiteHeader`. Put every new string in **all 5** dictionaries; the i18n test needs identical keys. Check 375 px and Arabic RTL. | `npm run check` green; RTL map controls usable |
| **P3T07** | **Demo script (20 min).** A 60-second market segment in `docs/DEMO_SCRIPT.md`: voice question → numbers → open the map → forecast range. Add 4 market checks to `tests/partner-api.check.mjs`. | Rehearsed once |

## 7. Merge (integrator, 10:30–11:45)

| ID | Step |
|---|---|
| **M01** | Each person opens a PR to `main`: what changed, the checks they ran, what's unfinished. The integrator runs `git diff --name-only main...<branch>`, and every path must be inside that person's §2 list. |
| **M02** | Merge **P1** → `npm run check`. |
| **M03** | Merge **P2**. Rerun `describe.py` on the merged real `listings.json` and commit the new `stats.json` → `npm run check`. |
| **M04** | Merge **P3** → `npm run check`, `npm run build`, the browser flow (`scripts/browser/verify-supabase.py`), `tests/partner-api.check.mjs`. Ask the 3 demo questions by chat **and** by voice. |
| **M05** | 11:30: Vercel deploy (env includes the new `ELEVENLABS_AGENT_ID`), smoke test on the URL, delete the merged branches, update HANDOFF. **12:00 freeze.** |

## 8. Cut lines (decide fast, say it in the team chat)

| If by | This isn't working | Then |
|---|---|---|
| 06:15 | No site passes the robots / terms / no-bypass check | Keep the labelled fixture. Grow it with clearly labelled SYNTHETIC rows, and say so in the demo |
| 07:45 | TimesFM gives no output | `source: "fallback"` (log-linear), labelled; show the backtest only if one exists |
| 09:30 | The map doesn't render | Ship `/market` with tables + chart; the map is optional |
| 10:00 | The new voice agent can't be created | Chat has the tools; voice keeps its current 6 tools |
| 10:30 | A branch isn't green | Merge only what is green; nothing half-done goes into `main` |

## 9. Prompt to paste into your AI assistant

```text
I am P<n> in docs/WORKPLAN.md of this repo. Read AGENTS.md, docs/TECH_STACK.md and docs/WORKPLAN.md first.
Work on branch p<n>/... only. Do my tasks P<n>T01 onward in order, respecting each time box and the cut lines in §8.
Edit only the files §2 gives to P<n>. Do not change the frozen contract (src/lib/market-data/types.ts, index.ts,
contract.test.ts). Follow the scraping rules in TECH_STACK §4 and the honesty labels in §5. Run `npm run check`
before every push, never use --no-verify, never commit keys, raw pages or model weights.
Log progress in docs/work/P<n>.md. Stop and ask me if a task needs a file outside my list.
```
