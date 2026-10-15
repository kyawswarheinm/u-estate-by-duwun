# P1T01 — Thai listing source audit

Checked **16 October 2026, approximately 05:24–05:28 ICT** for the U-Estate hackathon demo. Scope: DDproperty, Hipflat, FazWaz and Livinginsider. This is a permission/access audit, not a crawl or a listing snapshot.

## Decision

**No approved primary or backup source. Do not start P1T02 against these sites.** All four failed the access gate; published policies also restrict collection or reuse. A readable robots file alone does not grant permission to extract or republish content.

If the team can obtain explicit permission for the one-off facts-only snapshot and a public access route requiring no bypass, the permission-request priorities are **FazWaz (conditional primary)** and **Livinginsider (conditional backup)**, because their robots files were readable and their ordinary HTML routes are not covered by the observed wildcard restrictions. These are **not approved crawl targets**. Neither policy grants our proposed extraction; written authorization and a new successful access check are required before selection. DDproperty and Hipflat are rejected for this run.

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
| **FazWaz** (`www.fazwaz.com`) | **200**, plain-text rules. | `User-agent: *` restricts `/api/`, `/graphql`, viewing/QR endpoints, advice search and URL parameters including `latLng`, `center`, `zoomLevel`, `radius`, `exclude`, `order_by`. Plain HTML `/property-for-sale/…` and `/property-sales/…` routes are not disallowed by the observed wildcard rules; these paths were not fetched. Several named crawler groups are entirely denied. | Subsequent homepage returned **403**. No further direct requests. Homepage content, listing markup and JSON-LD could not be checked. | [FazWaz terms §§2–3](https://www.lifullconnect.com/legal-notice-fazwaz/) require express authorization for compiling/reproducing content and restrict copying, extraction and distribution. The [other published terms page](https://www.lifullconnect.com/terms-and-conditions-fazwaz-en/) has matching restrictions. | **Reject for crawling now**. Conditional primary permission-request candidate only. |
| **Livinginsider** (`www.livinginsider.com`) | **200**, plain-text wildcard rules allow `/` except `/api/`, `/bclick` and `/*/bclick`. | Ordinary search/listing HTML routes are not disallowed by these rules. No search/listing pages fetched after homepage denial. APIs and tracking links must not be crawled. | Subsequent homepage returned **403**. No further direct requests. No specific CAPTCHA confirmed. | [Official terms, clause 2](https://www.livinginsider.com/manual?action=MTE%3D), in Thai, restrict copying, reproduction and publication outside the site without written permission. This is an operational paraphrase of the published text, not a finding that our intended use is licensed. | **Reject for crawling now**. Conditional backup permission-request candidate only. |

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

## Handoff / reopening the gate

1. A human supplies a source owner's explicit authorization or a licensed facts-only export, with permission to distribute the cleaned demo snapshot in the public repo. No credentials should be pasted into chat.
2. Confirm the permitted host/routes, data fields, attribution, request limits and redistribution scope. Recheck robots and public access; permission does not authorize bypassing a challenge.
3. Verify listing fields, dates and coordinate precision, then proceed to P1T02 with the required polite Scrapy settings and a 50-item cap.
4. Otherwise keep the existing fixture labelled SAMPLE. P2/P3 can continue against the frozen contract. Source approval remains blocked; P1T01's primary/backup selection acceptance is not claimed as passed.
