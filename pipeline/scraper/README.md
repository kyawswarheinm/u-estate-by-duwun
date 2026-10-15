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
