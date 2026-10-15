# P1 source audits

**Current team decision (16 Oct): DDproperty, Hipflat, FazWaz and Livinginsider are off-limits. Do not crawl, retry or work around them.** P1T01b and OSM findings follow the historical audit below.

## P1T01 — initial audit

Checked **16 October 2026, approximately 05:24–05:28 ICT** for the U-Estate hackathon demo. Scope: DDproperty, Hipflat, FazWaz and Livinginsider. This is a permission/access audit, not a crawl or a listing snapshot.

## Decision

**No approved primary or backup source. Do not start P1T02 against these sites.** All four failed the access gate; published policies also restrict collection or reuse. A readable robots file alone does not grant permission to extract or republish content.

The initial audit identified FazWaz/Livinginsider only as possible permission-request priorities. **Those priorities are withdrawn by the subsequent team decision: all four remain off-limits.**

The current `src/data/market/listings.json` stays unchanged with `source: "fixture"` and `is_sample: true`. If no eligible source is supplied by **06:15 ICT**, keep that labelled fixture under WORKPLAN §8. No synthetic rows or real-data claims were added in this task.

## Method and limits

Direct requests used this honest User-Agent:

```text
U-Estate-Hackathon/0.1 (+https://github.com/kyawswarheinm/u-estate-by-duwun; source-permission-audit)
```

One robots request per site; only the two sites with readable robots received a later homepage request, more than two seconds later. Sites were checked independently, with one request at a time per domain. No login, cookies from a logged-in browser, CAPTCHA solving, alternate host, proxy rotation, browser impersonation, hidden API, or retry of a denied request was used. Direct page responses were inspected in memory and discarded; no raw listing HTML was written into the repo. Temporary robots text was held outside the repository under `/tmp/u-estate-p1-audit/`.

Official policy documents were researched separately using the web search reader, including the operator's LIFULL Connect policy pages. Search-reader results may be cached and are not proof that our crawler can access a site now. Direct status codes below take precedence for the access gate. A 401/403 alone does not establish whether denial came from the origin, a WAF, or an intermediary; it still means stop under our no-bypass rule.

## Candidate results

| Site | Direct robots result | Search/listing path assessment | Direct access / anti-bot observation | Terms assessment | Decision |
|---|---|---|---|---|---|
| **DDproperty** (`www.ddproperty.com`) | **403**, HTML response matched the audit's challenge/access-denial markers; body discarded. | Current rules could not be verified directly. The search reader had a cached [robots file](https://www.ddproperty.com/robots.txt), but it cannot clear the live failure. No search/listing request made. | Stopped at robots. No claim that a specific CAPTCHA or WAF vendor was confirmed. | Official [guidelines §§19–20](https://www.agentofferings.ddproperty.com/guidelines/) prohibit unauthorized bots/crawling and data mining. The document describes its membership scope; it supplies no permission for U-Estate. | **Reject**: access gate failed; no collection authorization. |
| **Hipflat** (`www.hipflat.co.th`) | **401**, text response matched an access-denial marker; body discarded. | Robots unverified. No search/listing request made. | Stopped at robots. Did not switch to another Hipflat country domain. | The operator's [brand-to-terms directory](https://www.lifullconnect.com/tc-intro-lifull-connect-en/) points Hipflat to [portal terms §§2–3](https://www.lifullconnect.com/legal-notice-direct/): compiling/reproducing website content requires express authorization; user obligations restrict extraction and distribution. | **Reject**: access gate failed and proposed reuse is not authorized. |
| **FazWaz** (`www.fazwaz.com`) | **200**, plain-text rules. | `User-agent: *` restricts `/api/`, `/graphql`, viewing/QR endpoints, advice search and URL parameters including `latLng`, `center`, `zoomLevel`, `radius`, `exclude`, `order_by`. Plain HTML `/property-for-sale/…` and `/property-sales/…` routes are not disallowed by the observed wildcard rules; these paths were not fetched. Several named crawler groups are entirely denied. | Subsequent homepage returned **403**. No further direct requests. Homepage content, listing markup and JSON-LD could not be checked. | [FazWaz terms §§2–3](https://www.lifullconnect.com/legal-notice-fazwaz/) require express authorization for compiling/reproducing content and restrict copying, extraction and distribution. The [other published terms page](https://www.lifullconnect.com/terms-and-conditions-fazwaz-en/) has matching restrictions. | **Reject for crawling now**. Off-limits under the subsequent team decision. |
| **Livinginsider** (`www.livinginsider.com`) | **200**, plain-text wildcard rules allow `/` except `/api/`, `/bclick` and `/*/bclick`. | Ordinary search/listing HTML routes are not disallowed by these rules. No search/listing pages fetched after homepage denial. APIs and tracking links must not be crawled. | Subsequent homepage returned **403**. No further direct requests. No specific CAPTCHA confirmed. | [Official terms, clause 2](https://www.livinginsider.com/manual?action=MTE%3D), in Thai, restrict copying, reproduction and publication outside the site without written permission. This is an operational paraphrase of the published text, not a finding that our intended use is licensed. | **Reject for crawling now**. Off-limits under the subsequent team decision. |

Successful direct robots response fingerprints (SHA-256 of returned bytes):

- FazWaz: `dc9f73388b8c31aa87eee9a42447d26fd105a21cd278804d8eb92517d268fa4b`
- Livinginsider: `ac4c84bd0e1fa4ace70764f5b569d8ec8dedfdbd981943f4fe974dbd445508e9`

### Field availability

For **all four sites**, live listing-level availability of price, usable floor area, land area, project, district/province, bedrooms, listing date and JSON-LD/embedded coordinates is **unverified**. The access checks stopped before a permitted listing response was available. We have not invented selectors or assumed that a map implies exact coordinates. Search snippets were not converted into records or treated as a substitute data source.

After authorization and an unblocked public route exist, verify these against one sale condo and one sale house page before a 50-item test:

| Contract field | Evidence needed from the page |
|---|---|
| `source_url`, `site`, `kind`, `type` | Canonical public URL, known domain and explicit sale/rent and property-type labels. No contact-bearing URL parameters. |
| `project`, `district`, `province` | Structured location/project fields; no free-form headline/description parsing that could retain contact details. `project` may be null. |
| `price_thb`, `area_sqm`, `price_per_sqm` | Explicit THB asking price and a clearly identified area measure. Distinguish usable floor area from land area; normalize units and compute price/m² in code. |
| `bedrooms`, `listed_at` | Structured values, otherwise null. A price-update date or scrape date must not be invented as the listing date. |
| `lat`, `lng`, `geo_precision` | Actual embedded/public coordinates and their stated precision. Round to three decimals. Project/district-centre fallbacks retain their respective precision labels. |
| `id`, `scraped_at` | Pipeline-generated stable URL hash and actual collection timestamp. |

Never retain descriptions, photos, names of agents/owners, phone numbers, LINE IDs or email addresses. Only the frozen `MarketListing` contract fields may be exported, with source metadata and external/unchecked labels.

## GitHub spider reuse audit

Searches on 16 October: `Scrapy FazWaz github`, `Scrapy Livinginsider github`, `Scrapy Hipflat github`, `Scrapy DDproperty github`, plus site-specific scraper/license searches. No compatible, licensed, site-specific Scrapy spider was verified. Public availability is not a license.

| Candidate / credit | Observed implementation and license evidence | Reuse decision |
|---|---|---|
| [ADM749 / Real-Estate-Pipeline](https://github.com/ADM749/Real-Estate-Pipeline) | README mentions Scrapy and a FazWaz script, but the actual default-branch tree returned no matching scraper Python file. GitHub reported `license: null`; the complete tree had no LICENSE/LICENCE/COPYING file. | Do not reuse code or data. A README path alone is not an available spider. |
| [hellomurphy / bot-condo](https://github.com/hellomurphy/bot-condo) | README describes Playwright; tree includes `scraper/livinginsider.py`. GitHub reported `license: null`; no license file in the complete tree. No MIT/BSD/Apache grant verified. | Do not reuse; it is also not the requested Scrapy implementation. |
| [ekapope / Predicting-condominium-price-using-data-from-webscraping](https://github.com/ekapope/Predicting-condominium-price-using-data-from-webscraping) | README describes Selenium/BeautifulSoup, with retrieve/scrape scripts present. GitHub reported `license: null`; no license file in the complete tree. | Do not reuse code or old datasets. |
| [Scrapy developers / Scrapy 2.19.0](https://github.com/scrapy/scrapy/tree/2.19.0) | Official framework and project templates under [BSD-3-Clause](https://github.com/scrapy/scrapy/blob/2.19.0/LICENSE). | Eligible framework/scaffolding for P1T02, **not a Thai-site spider**. No third-party spider code was copied in P1T01. Preserve the upstream copyright/license if templates are copied later. |

GitHub repository metadata and complete default-branch file trees were checked directly. The three candidate repositories had no detected license and no standalone license file; that is a rejection for this task, not a claim about rights the authors might grant later. Credits above record research only, not code adoption or endorsement.

## Initial handoff (superseded for the four excluded portals)

1. A human supplies a source owner's explicit authorization or a licensed facts-only export, with permission to distribute the cleaned demo snapshot in the public repo. No credentials should be pasted into chat.
2. Confirm the permitted host/routes, data fields, attribution, request limits and redistribution scope. Recheck robots and public access; permission does not authorize bypassing a challenge.
3. Verify listing fields, dates and coordinate precision, then proceed to P1T02 with the required polite Scrapy settings and a 50-item cap.
4. Otherwise keep the existing fixture labelled SAMPLE. P2/P3 can continue against the frozen contract. Source approval remains blocked; P1T01's primary/backup selection acceptance is not claimed as passed.


## P1T01b — additional sources, 16 Oct ~05:54–06:05 ICT

No excluded portal was contacted again. Policy checks used the same honest U-Estate User-Agent and at most one request per domain at a time. TLS-client failures were distinguished from access refusals; certificate verification was not disabled. No additional source passed the price-listing gate, so no live price listing spider was run.

| Source | Robots / allowed paths | Access and terms | Result |
|---|---|---|---|
| [PropertyHub](https://propertyhub.in.th/robots.txt) | Direct 200; wildcard allows `/`. | [Official terms](https://propertyhub.in.th/en/terms), Description of Service §3 and Copyright, prohibit automated collection/extraction without company consent. No listing requests after that finding; fields/coordinates not inspected. | **Refused**, terms gate. |
| [BAM](https://www.bam.co.th/robots.txt) | Direct 200; wildcard allows ordinary HTML, restricts `/api/`, previews, member/login/register routes. | [Official terms](https://www.bam.co.th/en/terms-and-conditions), Copyright, restrict copying, storing and disseminating website data for commercial purposes without prior written notice. This does not establish permission for our public marketplace snapshot. No listing requests; fields/coordinates unverified. | **Refused**, reuse not cleared. |
| [AP Thai](https://www.apthai.com/robots.txt) | Initial system Python TLS error; a modern TLS client then returned 200. Ordinary English condominium paths allowed; Thai search paths and several query parameters disallowed. | Direct [terms page](https://www.apthai.com/en/terms-conditions) loaded 200 without a challenge. Its intellectual-property clause requires prior written consent for copying/distribution/public disclosure. No project-page collection after this finding; price/area/coordinates unverified. | **Refused**, terms gate. |
| [Government Data Catalog / NHA vacant homes dataset](https://gdcatalog.go.th/en/dataset/gdpublish-03-44000) | Direct [robots](https://gdcatalog.go.th/robots.txt) 200; `User-agent: *` disallows `/`; separate Googlebot permissions do not apply to U-Estate. | Search-indexed catalogue metadata describes an open-data licence, but that does not override the host's robots rule. No dataset/API/file request made. Listing-level price, area and geographic coverage unverified. | **Refused**, robots gate. |
| [Bangkok open-data district geometry](https://data.bangkok.go.th/robots.txt) | Direct 200; wildcard disallows `/`. | Looked up only as a potential district-coordinate source. No geometry/dataset download; no reuse claim. | **Refused**, robots gate. |

These are failed source checks, not evidence that all Thai property sources prohibit collection. No primary/backup price source is approved. The explicitly authorized synthetic fallback remains labelled `fixture`, never `scrape`.

## OSM endpoint and download audit — 16 Oct ~05:55 onward

The [OSM copyright/licensing page](https://www.openstreetmap.org/copyright) permits copying and adapting OSM data under ODbL with attribution and share-alike requirements. All exported OSM places carry **© OpenStreetMap contributors, ODbL 1.0**, `license: ODbL-1.0` and the [licence URL](https://opendatacommons.org/licenses/odbl/1-0/). OSM supplies geography only; no price is attached to a named real feature.

| Host / service | Rules and live observation | Decision |
|---|---|---|
| `overpass-api.de` | Direct robots 200: `/api/` disallowed. The public service documentation permits queries but does not change this project's robots requirement. | **No API request**, robots respected. |
| `overpass.private.coffee` | Robots 404 (no exclusion rules); [operator terms](https://overpass.private.coffee/) explicitly allow programmatic use, including commercial projects, with privacy, fair resource use and attribution obligations. One bounded Scrapy POST and a later tiny diagnostic GET both returned **500**. | Source/service terms qualify; **live retrieval unavailable**. No automatic retries. |
| `overpass.kumi.systems` | Documented former hostname of Private.coffee in the [OSM public-instance directory](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances). Robots 404; one bounded Scrapy POST returned **500**. | Explicitly permitted service, **live retrieval unavailable**. No API data exported. |
| `maps.mail.ru` / `maps.vk.com` | The documented old VK robots URL redirected to a general HTML page. The canonical `maps.vk.com/robots.txt` then returned 200 with a wildcard default deny and only specific map UI paths allowed. | **No Overpass API request**; insufficient allowed API route. |
| `overpass.osm.jp` | Robots request failed certificate validation (expired certificate). | **No API request**; TLS verification was not disabled. |
| `api.openstreetmap.org` | Robots returned 301. Read the [core API policy](https://operations.osmfoundation.org/policies/api/), which says the editing API is not for read-only projects. | **No data request**; not a fallback for this scraper. |
| `download.geofabrik.de` | Robots redirects normally to `/robots.txt/`, which returns 404. [Official download information](https://www.geofabrik.de/data/download.html) and [Thailand extract page](https://download.geofabrik.de/asia/thailand.html) explicitly provide OSM files for download under ODbL. Public files omit contributor usernames/user IDs/changeset IDs. | **Eligible regional-extract fallback**, distinct from Overpass. Scrapy follows the normal latest-to-dated-file redirect, with one request at a time and cached responses. Live outcome recorded in P1 log. |

No parallel mirror racing, access-block retries, authentication, or spoofed User-Agent was used. Overpass's allowed provider failed with server errors, not a CAPTCHA. The regional download is a documented alternative delivery method for the same open OSM data, not a way around the four forbidden portals. The Overpass spider remains available; an extract result is never labelled as a successful Overpass call.

District-reference coordinates for the synthetic fixture are separately attributed to [Wikipedia contributors](https://en.wikipedia.org/w/index.php?title=List_of_districts_of_Bangkok&oldid=1369007874), CC BY-SA 4.0. Only twelve representative district points were transcribed and rounded. They are not polygon centroids, real building locations, or data from a blocked portal. The real OSM places and synthetic price records remain separate datasets.

### Approved extract checks — 16 Oct ~06:10 ICT

The human approved BBBike Bangkok as primary and Geofabrik Thailand as backup, and instructed no further Overpass retry loop. [BBBike robots](https://download.bbbike.org/robots.txt) returned HTTP 200 and explicitly disallows `/*.pbf$`. Its [Bangkok directory](https://download.bbbike.org/osm/bbbike/Bangkok/) offers OSM downloads, but the robots gate wins for this automated pipeline: **no PBF request to BBBike**. The approved Geofabrik backup remains eligible under the audit above. An in-flight Geofabrik request was interrupted on the proposed primary switch; after the BBBike robots failure the backup download was started again. No successful extract was downloaded twice. No additional Overpass calls were made.

The `osmium==4.2.0` Python binding (pyosmium) is used under [BSD-2-Clause](https://github.com/osmcode/pyosmium/blob/v4.2.0/LICENSE.TXT), separate from OSM data's ODbL. Ways use polygon area centroids (line-length centroids for open/degenerate geometries). Rail classification additionally recognizes ARL / Airport Rail Link / SRTET evidence. Download URL, dated resolved URL, Last-Modified and SHA-256 are retained in the cleaned metadata; raw PBF is stored only under ignored `raw/`.

### Live extraction outcome

Geofabrik completed at ~06:18 ICT: **328,698,576 bytes**, resolved `https://download.geofabrik.de/asia/thailand-261014.osm.pbf`, Last-Modified **15 Oct 2026 00:00:13 GMT**. SHA-256 and collection time are in `places.json` metadata. Native-filtered pyosmium extraction yielded **6,987** Bangkok/vicinity facts-only places (6,751 residential features, 236 transit stations). The successful full response was downloaded once; subsequent runs use only the local HTTP cache/PBF. This is an actual successful Scrapy extract retrieval and offline OSM parse, not a successful Overpass call or a source of prices.

## P1T02 continuation — 16 Oct ~06:29–06:40 ICT, no time cut

The human explicitly removed time-based scope cuts. The original 50-real-listing target remains open; the real OSM geography and synthetic price fixture do not satisfy it. None of the four excluded portals was retried.

| Additional source | Live robots result | Policy / field evidence | Outcome |
|---|---|---|---|
| Dot Property (`www.dotproperty.co.th`) | Honest U-Estate UA, HTTP 200; ordinary listing routes are not generally denied, with specific dashboard/contact/news restrictions. | `/en/terms` redirects to [Lifull Connect legal notice](https://www.lifullconnect.com/legal-notice-direct/). Sections 2–3 restrict compiling, copying, extracting and distributing website content. | **Refused**, terms; no listing crawl. |
| Thailand-Property (`www.thailand-property.com`, hyphenated domain) | Honest UA, HTTP 200; ordinary listing routes allowed except specific restrictions. | `/terms` points to the same [operator legal notice](https://www.lifullconnect.com/legal-notice-direct/), with extraction/reuse restrictions. This is distinct from the unhyphenated `thailandproperty.com` site returned by search. | **Refused**, terms; no listing crawl. |
| MLS Thai (`mls-thai.com`) | Honest UA, HTTP 200, ordinary HTML allowed; `/api/` and account/admin paths disallowed. | [Terms](https://mls-thai.com/terms) §6 forbids competing databases without permission; §7 restricts copying/exploitation. [Partner API](https://mls-thai.com/partners) requires application and authorization; no anonymous API was attempted. | **Refused for unlicensed collection**; licensed partner feed is a possible human-supplied source. |
| BaanScope (`baanscope.com`) | Honest UA, HTTP 200, wildcard allows `/`. Public machine-access docs load without a challenge; guessed `/terms` returns a not-found page, so it was not treated as the terms. | [API docs](https://baanscope.com/api-docs) explicitly permit machine access; [OpenAPI](https://baanscope.com/openapi.json) names `/about` as terms. [About](https://baanscope.com/about) and [open data](https://baanscope.com/data) license **aggregates** under CC BY 4.0. No per-project open export is offered. Inspected one public project fact sheet: price is a starting price and size is a range, so it does not establish a single priced unit with one area. | **Machine access / aggregate reuse eligible; not a qualified listing source for this contract.** Do not convert district medians, project entry prices or unrelated area minima into individual listings. No bulk project crawl or aggregate-to-listing conversion. |

Implementation now includes a permission-gated JSON-LD listing adapter for an approved source, contract-only projection, scalar-price/area checks, a hard 50-item cap, same-host opt-in link discovery, and stop-on-challenge/failure behavior. No real permission file was created and no new real price records were claimed. The 50-item engine smoke test uses generated fixtures only.
