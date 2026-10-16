# U-Estate offline data pipeline (P1)

Read [SOURCES.md](SOURCES.md) before running a spider. DDproperty, Hipflat, FazWaz and Livinginsider are **off-limits**. No spider in this project targets them. The project has no generic arbitrary-URL crawler and no fabricated permission files.

## Python setup

Run from the repository root (Python **3.11**):

```sh
python3.11 -m venv pipeline/scraper/.venv
pipeline/scraper/.venv/bin/python -m pip install -r pipeline/scraper/requirements.txt
cd pipeline/scraper
```

Dependencies are `scrapy==2.19.0` and `osmium==4.2.0` for the explicitly labelled OSM regional-extract fallback. The venv, `.scrapy/` HTTP cache, `raw/` and `out/` are already git-ignored. Do not change `.gitignore` or add npm scripts.

## P1T02 property-listing adapter

The original acceptance target remains **50 real, clean sale listings**. The OSM place snapshot and generated tests do not meet that target. Time cut lines no longer close this task (latest human instruction). No eligible listing source is currently bound to this adapter.

`licensed_listings` implements the human-permission option previously requested. It fails before any request unless a human has supplied a nonempty `permissions/<site>.md` record of written permission. **The agent has not created a permission record.** The record must describe the approved domains/paths, automated facts-only collection and public redistribution rights; source robots/terms/access still need checking and recording in SOURCES. The four explicitly off-limits portals stay blocked even if such a file exists.

After a source is approved, inspect its JSON-LD and supply its actual URLs and link selector. For example (replace the reserved example domain with the approved source):

```sh
.venv/bin/python run.py licensed_listings --site approved-site \
  --start-url https://example.org/approved-sale-path \
  --link-css 'a.listing-link::attr(href)' --limit 50 --min-items 50
# Equivalent native Scrapy smoke-test setting:
.venv/bin/scrapy crawl licensed_listings -a site=approved-site \
  -a start_urls=https://example.org/approved-sale-path -s CLOSESPIDER_ITEMCOUNT=50
```

Output is ignored `out/listings.json`, with only frozen contract fields. The adapter accepts explicit in-stock THB sale offers for apartments/houses and strictly monthly condominium rental offers in Bangkok and the five surrounding provinces, with a scalar floor area and verified unit. It drops ranges, aggregates, unknown sale/rental intent, missing price/area and contact-bearing locations/URLs. Never multiply starting prices by arbitrary minimum unit sizes. Page coordinates are rounded, optional facts stay null when unknown, IDs hash the source URL, and cached identical bodies retain collection time. Link discovery is opt-in and restricted to approved hosts, with no credential/query-bearing links. Requests that fail or present a challenge stop the spider. The runner requires the requested minimum count and rejects spider exceptions. Successful raw items still need P1T03 cleaning/export before replacing the application snapshot.

Network-free engineering verification, **generated test fixtures only**:

```sh
.venv/bin/python -m tests.smoke_listings
.venv/bin/python -m unittest discover -s tests -v
```

The smoke test runs the actual Scrapy engine against in-memory responses, with permission mocked only in the test. It verifies exactly 50 generated rows and the item cap; no network or real permission file is used. These rows stay in `out/tests/` and never enter `src/data/market/listings.json`. Real-source settings retain the two-second delay, robots obedience, caching and AutoThrottle.

## P1T03 clean and export real listings

After P1T02 has collected eligible **real** items, supply the audited source metadata as `out/source-sites.json`: an array with exactly `name` (matching each row's site slug), `url` (the approved HTTPS host), and `robots_checked_at` (the actual YYYY-MM-DD audit date). The existing licensed-source adapter's human permission record must already exist; this command creates neither permission nor audit evidence. Synthetic/test site names and reserved example domains are rejected.

```sh
.venv/bin/python export.py listings --input out/listings.json \
  --sites out/source-sites.json
```

This writes the frozen `ListingsFile` shape to `src/data/market/listings.json` with `meta.source="scrape"` and `is_sample=false` **only after every check passes**. Default minimum: **200 rows after cleaning**, with no automatic reduction. `--min-items` is explicit for smaller source smoke tests; use `--output out/cleaned-smoke.json` for those. No real source items currently exist, so the app's labelled synthetic snapshot remains intact.

Cleaning rules:

- Normalize known type/kind aliases, Bangkok/vicinity province names and U-Estate's district spellings (including Sathon → Sathorn, case/whitespace variants and known Thai district names). Unmapped Thai district names are dropped rather than guessed into English.
- Normalize explicit area values: square metres, **1 rai = 1,600 m²**, **1 square wa = 4 m²**. P1T02 already emits scalar square metres; the same conversion also accepts explicit value/unit objects at the cleaning boundary. Output is always a number. Ranges, unknown units and missing/nonpositive/nonfinite price or area are dropped.
- Recompute IDs as `ext-<site>-<sha1(source_url)[:10]>` and price/m² from price/area. Keep collection timestamps; never turn export time into a collection date.
- Deduplicate source URLs, keeping the latest collection. Equal-time conflicting facts abort; equivalent source aliases resolve deterministically. For known projects, also dedupe project + area + price within province/district/type/kind. Null projects use URL identity, preserving unrelated properties with the same price and size.
- Remove values strictly outside the **1st–99th percentile per type**, with sale and monthly rent in separate cohorts. Percentiles use linear interpolation at `(n-1)*p`; boundary ties remain. A single value survives, but a tiny distinct cohort can become empty. Thresholds are never weakened automatically.
- Round valid Thai coordinates to three decimals and retain their precision label. Incomplete/invalid coordinates become null/`none`; no location is invented here. Optional unknown bedrooms/dates remain null.
- Reject extra fields, contact-bearing text/URLs, missing/unapproved provenance, source-host mismatches and timezone-free collection timestamps. Privacy violations abort the export instead of silently copying unsafe data.

Counters and per-cohort thresholds are written to ignored `out/listing-cleaning-report.json` (`--report` overrides the path). Re-running on the same original raw items is deterministic. Always use the original raw items, not a previously trimmed snapshot. Input, metadata, report and snapshot paths must differ. Validation and the minimum-count check finish before writing; each output is replaced atomically. Empty/undersized/invalid input preserves the previous snapshot. No new npm dependency/script or frozen-contract field was added.

## P1T04 coordinates

The real-listing export now resolves coordinates after cleaning, with a default **80% coverage gate**. Existing page coordinates keep `exact`; previously labelled project/district coordinates retain their precision. Missing coordinates use a strictly matched cached/project lookup (`project`), then an attributed district reference (`district`), otherwise null/`none`. Every new point is rounded to three decimals. No synthetic row is submitted for project lookup and the OSM places file is not joined to prices.

**Read the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/):** this is a small, one-time offline batch on **one thread, one process, one machine**, with cached results, attribution and at most one request per second. This client waits **two seconds after each request**, persists the rate state across runs, and locks the shared cache against concurrent batches. Do not schedule recurring jobs or offer this as an app/chat address-search service. The operator is responsible for choosing an eligible endpoint and supplying a real public contact URL. [Search API documentation](https://nominatim.org/release-docs/latest/api/Search/).

**Live source audit:** on 16 October, `https://nominatim.openstreetmap.org/robots.txt` returned 200 and explicitly disallowed `/search`. **No search query was sent.** The client enforces robots and stops online lookup on denial, challenge, HTTP error or timeout, with no retries or mirror rotation. The default public endpoint is therefore currently unavailable under our rules. Cache hits and district fallback still work. A separately configured Nominatim-compatible endpoint must have its terms/robots checked and recorded in SOURCES before use.

The ordinary command remains cache-only and needs no contact configuration:

```sh
.venv/bin/python export.py listings --sites out/source-sites.json
```

For a **separately audited, permitted endpoint only**, configure its real URL and the operator's public contact URL in the terminal, then:

```sh
.venv/bin/python export.py listings --sites out/source-sites.json \
  --geocode-online --geocode-endpoint "$UEST_NOMINATIM_ENDPOINT" \
  --contact-url "$UEST_OPERATOR_CONTACT_URL"
```

These are public URLs, not API credentials; the client rejects URL credentials/query strings. Nothing reads or modifies `.env.local`. The CLI endpoint is configurable without code changes. Live requests first check robots, use an identifying project User-Agent with the contact URL, enforce a 500-project-query budget, and stop after the first service failure. No personal addresses, descriptions, owner/agent names or contact details are submitted as queries. The listing adapter accepts a project name only from an explicit `containedInPlace` / `ApartmentComplex` object, not from headlines or seller fields.

`cache/nominatim/` (ignored) stores only the safe query, endpoint, collection time and rounded result or a cached no-match. No raw geocoder response, display-name/address payload, contact URL or arbitrary OSM tags are stored. Results must match the exact normalized public project name, tagged district/province and country `th`; ambiguous or administrative-boundary matches are rejected. Offline cache misses proceed to district fallback.

`district-centres.json` has twelve **Bangkok** representative reference points, with source/CC BY-SA attribution. They are not geometric centroids, entrances or verified property locations. Province matching prevents using a Bangkok reference for a similarly named district in another province. `--centres` accepts an attributed registry; each entry can specify its province, or inherit the registry's province. Missing districts remain unknown; no city-wide default point is invented.

The cleaning report includes `geocoding` counts, endpoint, cache/network counters, coordinate coverage and district provenance. Exported source notes credit Nominatim/OSM when used and the district reference source when used. P3 must preserve these credits and the distinction between `exact`, `project` and `district`. No new frozen-contract fields were added. `--min-coordinate-coverage` makes the threshold explicit; it defaults to `.8` and is never reduced automatically. A coverage failure leaves the prior snapshot intact, although legitimate lookup results may already be cached.

Network-free verification (generated fixtures, never real results):

```sh
.venv/bin/python -m tests.smoke_geocoding
.venv/bin/python -m unittest discover -s tests -v
```

The smoke test covers page → cached project → district → unknown, demonstrates **4/5 = 80% on generated fixtures**, and writes only labelled fixture artifacts under ignored `out/tests/`. It is not evidence of real-listing coverage. Real coverage remains unmeasurable until P1T02 supplies real eligible listing items.

## OSM via Overpass

```sh
.venv/bin/python run.py osm_places --limit 50
.venv/bin/python run.py osm_places
.venv/bin/python export.py places
```

This sends one bounded Overpass query for Bangkok/vicinity (south 13.4, west 100.2, north 14.15, east 101.0). It requests named `building=apartments|residential`, named `landuse=residential`, rail/public-transport stations, and district boundary references. The parser keeps BTS/MRT/ARL-compatible station tags and the eight allowed place fields only. It never produces prices, photos, descriptions, contacts or contributor metadata.

The public Private.coffee endpoint and its documented former Kumi hostname returned HTTP 500 during the live audit. The spider currently targets the audited former hostname; the current hostname is recorded in SOURCES. **A failed run is not a snapshot.** The wrapper exits nonzero on empty/failed data; the exporter rejects empty/invalid input and leaves existing cleaned output untouched. Do not repeatedly retry an unavailable service. There is no automatic mirror rotation.

## Permitted OSM regional-extract fallback

BBBike was approved as the first choice, but its live robots.txt disallows `.pbf` files, so it was not downloaded. The approved backup Geofabrik provides public ODbL regional files for offline use. This is real OSM data, **not a successful Overpass response**. Keep that distinction in the demo.

```sh
.venv/bin/python run.py osm_extract
.venv/bin/python extract_places.py
.venv/bin/python export.py places --extract-meta out/extract-meta.json
```

The download is about 313 MiB and remains in `raw/thailand.osm.pbf`; the HTTP cache avoids downloading it again. The parser filters locally to the same bounding box. It handles nodes and ways only; relations are omitted. Way positions use polygon area centroids, with line-length centroids for open or degenerate ways; these are not entrances. Parsing uses pyosmium `locations=True`. `out/extract-meta.json` records the local collection time (preserved for the same cached body), source URL, upstream HTTP Date, Last-Modified and SHA-256; the cleaned snapshot carries this provenance. No contributor metadata is requested. Only `src/data/market/places.json` is committed, with **© OpenStreetMap contributors, ODbL 1.0**, the ODbL link and a fallback-method label. The map and AI must credit this exact attribution; P3 must preserve attribution and must not attach synthetic prices to these real named features.

To demonstrate a cached, network-free rerun:

```sh
.venv/bin/python run.py osm_extract --offline
.venv/bin/python extract_places.py
.venv/bin/python export.py places --extract-meta out/extract-meta.json
```

`--offline` fails on a cache miss instead of requesting the network. Do not run multiple scraper instances concurrently. Success on `scrapy crawl` alone is not proof of usable data; use `run.py`, which checks the outcome and writes sanitized counters to `out/<spider>-stats.json`.

## Synthetic price fixture (separate from real OSM)

```sh
.venv/bin/python export.py synthetic
```

This projects all 1,200 generated rows in `data/valuation/demo_sales.csv` into the frozen listing contract. Every source row must say `is_synthetic=true`. Output has `meta.source="fixture"`, `is_sample=true`, `site="synthetic"`, `project=null`, `bedrooms=null`, `listed_at=null` and `geo_precision="district"`. These are **not real listings, asking prices or recorded transactions**. `scraped_at` is the local fixture export time. Provenance URLs link to the source CSV, not property adverts. Stable IDs hash those URLs. Prices per m² are computed from price/size, with no model predictions.

`district-centres.json` contains rounded representative district coordinates, attributed to Wikipedia contributors under CC BY-SA 4.0. They are not calculated polygon centroids or building locations. The generated fixture keeps all original rows; the real-listing outlier rule is not applied to synthetic model examples. It does not join, match or attach any price to the OSM places file. P2 must regenerate its own stats after taking this snapshot; P1 does not change P2's files.

## Checks

```sh
.venv/bin/python -m unittest discover -s tests -v
cd ../..
npx vitest run src/lib/market-data
npm run check
npm run build
```

Run the market-data tests after each export and `npm run check` before every push. Raw downloads, cached responses, virtual environments and build artifacts must remain untracked. The cleaned places schema and P3 integration limits are in `docs/work/P1.md`; this new file is outside the frozen listing/stats/forecast contract.


## P1T06 monthly condo rental support

The same `licensed_listings` spider and `export.py listings` commands accept explicit `LeaseOut` offers for `Apartment` items. `priceSpecification` must be a single `UnitPriceSpecification` with a positive scalar THB price and `referenceQuantity` of exactly one `MON` (month). This narrow mapping uses [Schema.org referenceQuantity](https://schema.org/referenceQuantity); it does not infer monthly rent from contractual `billingDuration`, page titles or bare prices. Price components, ranges, daily/yearly/multi-month units, conflicting top-level price/currency and non-condo rental types are rejected. No conversion from daily or annual rates is performed. The existing `sale_listing` Python helper remains sale-only; the spider uses `market_listing` for both kinds.

The cleaner/exporter already separates sale and rent percentile cohorts and preserves monthly rent in `price_thb` and monthly rent/m² in `price_per_sqm`. The same permission, robots, privacy, coordinate and minimum-row gates apply. Do not create permission records to enable a demo. RentHub was checked and refused under its terms (see SOURCES). There are still no eligible real rental items; no synthetic rents or additional application rows were manufactured. Live P1T06 acceptance (more real rows) remains open.
