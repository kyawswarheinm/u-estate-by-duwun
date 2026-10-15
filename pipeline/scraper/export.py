"""Clean exports only; never merge real OSM names with synthetic prices."""
import argparse
import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from estate_scraper.clean import FIELDS, district, text
from estate_scraper.market_export import clean_listings, collection_time, source_url

ROOT = Path(__file__).resolve().parents[2]
LICENSE = "https://opendatacommons.org/licenses/odbl/1-0/"


def write_json(path, payload):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n")
    temp.replace(path)


def clean_places(rows):
    result = {}
    for row in rows:
        if set(row) != FIELDS:
            raise ValueError("Unexpected place fields; refusing to export")
        if row["kind"] not in {"station", "condo_building"} or row["source"] != "OpenStreetMap":
            raise ValueError("Invalid place provenance/kind")
        if not text(row["name"]) or (row["district"] is not None and not text(row["district"], 60)):
            raise ValueError("Unsafe name or district")
        if not all(isinstance(row[k], (int, float)) and not isinstance(row[k], bool) and math.isfinite(row[k]) for k in ("lat", "lng")):
            raise ValueError("Invalid coordinates")
        if not (13.4 <= row["lat"] <= 14.15 and 100.2 <= row["lng"] <= 101):
            raise ValueError("Outside Bangkok/vicinity bounding box")
        import re
        if not re.fullmatch(r"(?:node|way|relation)/[1-9][0-9]*", row["osm_id"]):
            raise ValueError("Invalid OSM id")
        datetime.fromisoformat(row["fetched_at"].replace("Z", "+00:00"))
        row = dict(row, lat=round(row["lat"], 3), lng=round(row["lng"], 3))
        key = row["osm_id"]
        if key in result and result[key] != row:
            raise ValueError("Conflicting duplicate OSM id")
        result[key] = row
    if not result:
        raise ValueError("No places: refusing to overwrite a snapshot after a failed crawl")
    return sorted(result.values(), key=lambda row: row["osm_id"])


def export_places(source, output, extract_meta=None):
    rows = clean_places(json.loads(Path(source).read_text()))
    from estate_scraper.spiders.osm_places import ENDPOINT
    provenance = json.loads(Path(extract_meta).read_text()) if extract_meta else {}
    payload = {"meta": {"source": "OpenStreetMap", "attribution": "© OpenStreetMap contributors, ODbL 1.0",
        "license": "ODbL-1.0", "license_url": LICENSE,
        "endpoint": provenance.get("endpoint", ENDPOINT),
        "method": "regional_extract_fallback" if extract_meta else "overpass",
        "extract_url": provenance.get("resolved_url"),
        "extract_date": provenance.get("last_modified"),
        "extract_sha256": provenance.get("sha256"),
        "extract_last_modified": provenance.get("last_modified"),
        "bbox": [13.4, 100.2, 14.15, 101.0], "fetched_at": max(row["fetched_at"] for row in rows),
        "note": "Named residential features and BTS/MRT/ARL stations, not listings. No prices. Positions rounded to 3 decimals; regional-extract ways use polygon centroids (line-length centroids for open/degenerate ways); Overpass centres are bounding-box centres. District is null unless tagged. condo_building includes named residential areas; it is not proof of condominium status. The regional-extract fallback includes nodes and ways only, omitting relations."}, "places": rows}
    write_json(output, payload)
    return len(rows)


def synthetic_rows(source, centres, fetched_at):
    result, seen = [], set()
    with Path(source).open(newline="") as handle:
        for line, item in enumerate(csv.DictReader(handle), start=2):
            if item["is_synthetic"].lower() != "true":
                raise ValueError("Every source row must explicitly be synthetic")
            area, price = float(item["size_sqm"]), float(item["price_thb"])
            if not all(math.isfinite(v) and v > 0 for v in (area, price)):
                raise ValueError("Invalid source price/area")
            name = district(item["district"])
            if not name or name not in centres:
                raise ValueError("Missing district centre: " + str(name))
            point = centres[name]
            if not (5 <= point["lat"] <= 21 and 97 <= point["lng"] <= 106):
                raise ValueError("Invalid district centre")
            # Provenance links point to the synthetic source CSV, never a real property page.
            url = f"https://github.com/kyawswarheinm/u-estate-by-duwun/blob/main/data/valuation/demo_sales.csv#L{line}"
            identifier = "ext-synthetic-" + hashlib.sha1(url.encode()).hexdigest()[:10]
            if identifier in seen:
                raise ValueError("Duplicate synthetic id")
            seen.add(identifier)
            result.append({"id": identifier, "site": "synthetic", "source_url": url, "kind": "sale", "type": "condo",
                "project": None, "district": name, "province": "Bangkok", "lat": round(point["lat"], 3), "lng": round(point["lng"], 3),
                "geo_precision": "district", "price_thb": price, "area_sqm": area, "price_per_sqm": round(price / area, 2),
                "bedrooms": None, "listed_at": None, "scraped_at": fetched_at})
    if not result:
        raise ValueError("No synthetic input")
    return result


def export_synthetic(source, centre_file, output):
    now = datetime.now(timezone.utc).isoformat()
    centres = json.loads(Path(centre_file).read_text())["centres"]
    rows = synthetic_rows(source, centres, now)
    payload = {"meta": {"source": "fixture", "is_sample": True,
        "sites": [{"name": "synthetic", "url": "https://github.com/kyawswarheinm/u-estate-by-duwun/blob/main/data/valuation/demo_sales.csv", "robots_checked_at": now[:10]}],
        "scraped_at": now, "note": "SYNTHETIC: generated demo condo sales from data/valuation/demo_sales.csv, not real listings, asking prices or transactions. Portals forbid scraping or failed access checks; see pipeline/scraper/SOURCES.md. Project and listing date are null; coordinates are approximate district centres and must never be joined to a real named building. scraped_at is the fixture export time, not a portal collection date. Approximate district reference coordinates: Wikipedia contributors, CC BY-SA 4.0; see pipeline/scraper/district-centres.json for attribution. robots_checked_at is a contract-required export audit date, not permission to scrape GitHub."}, "listings": rows}
    write_json(output, payload)
    return len(rows)


def validate_listing_sources(sites):
    """Validate provenance for the existing human-authorized listing adapter."""
    from datetime import date
    from estate_scraper.spiders.licensed_listings import LicensedListingsSpider
    if not isinstance(sites, list) or not sites:
        raise ValueError("A nonempty SourceSite array is required")
    by_name = {}
    for site in sites:
        if not isinstance(site, dict) or set(site) != {"name", "url", "robots_checked_at"}:
            raise ValueError("Unexpected source metadata fields")
        name = site["name"]
        if not isinstance(name, str) or name.split("-")[0] in {"synthetic", "fixture", "sample", "test", "demo", "example"}:
            raise ValueError("Fixture/test sources cannot be exported as a real scrape")
        checked = site["robots_checked_at"]
        if not isinstance(checked, str) or date.fromisoformat(checked).isoformat() != checked:
            raise ValueError("Robots check date must use YYYY-MM-DD")
        parsed = source_url(site["url"])
        host = parsed.hostname
        if (host in {"localhost", "example.com", "example.net", "example.org"}
                or any(host.endswith("." + suffix) for suffix in ("example.com", "example.net", "example.org", "example", "test", "invalid", "localhost"))):
            raise ValueError("Reserved test domains cannot be exported as a real scrape")
        if name in by_name:
            raise ValueError("Duplicate source name")
        # Reuse P1T02's permission and off-limits gates; this does not send requests.
        LicensedListingsSpider(site=name, start_urls=[site["url"]])
        by_name[name] = site
    return by_name


def export_listings(source, sites_file, output, min_items=200, report_path="out/listing-cleaning-report.json"):
    if min_items < 1:
        raise ValueError("Minimum clean item count must be positive")
    if len({Path(path).resolve() for path in (source, sites_file, output, report_path)}) != 4:
        raise ValueError("Inputs, report and listing snapshot must use different paths")
    sites = validate_listing_sources(json.loads(Path(sites_file).read_text()))
    raw = json.loads(Path(source).read_text())
    if not isinstance(raw, list):
        raise ValueError("Expected raw Scrapy items, never an existing fixture envelope")
    # Check provenance even for rows that cleaning might subsequently drop.
    for row in raw:
        if not isinstance(row, dict) or not isinstance(row.get("site"), str) or row["site"] not in sites:
            raise ValueError("Listing site is missing from the approved source metadata")
        if source_url(row.get("source_url")).hostname != source_url(sites[row["site"]]["url"]).hostname:
            raise ValueError("Listing URL does not match its source host")
    rows, report = clean_listings(raw)
    if len(rows) < min_items:
        raise ValueError(f"Only {len(rows)} clean listings; {min_items} required. Existing snapshot preserved.")
    used = sorted({row["site"] for row in rows})
    payload = {"meta": {"source": "scrape", "is_sample": False,
        "sites": [sites[name] for name in used],
        "scraped_at": max(rows, key=lambda row: collection_time(row["scraped_at"]))["scraped_at"],
        "note": "External asking prices, not completed-sale prices; not checked by U-Estate. "
                "Open the source to confirm price and availability. Dates refer to collection, not export. "
                "Duplicate adverts and price-per-m² outliers removed. Coordinates rounded to 3 decimals; "
                "project/district locations are approximate. These records are separate from OSM geography and synthetic examples."}, "listings": rows}
    # Both files are atomic individually; finish all validation before touching either.
    write_json(report_path, report)
    write_json(output, payload)
    return len(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)
    places = sub.add_parser("places")
    places.add_argument("--input", default="out/places.json")
    places.add_argument("--output", default=str(ROOT / "src/data/market/places.json"))
    places.add_argument("--extract-meta", help="Use this for a regional PBF fallback; never label it as Overpass")
    synthetic = sub.add_parser("synthetic")
    synthetic.add_argument("--input", default=str(ROOT / "data/valuation/demo_sales.csv"))
    synthetic.add_argument("--centres", default="district-centres.json")
    synthetic.add_argument("--output", default=str(ROOT / "src/data/market/listings.json"))
    listings = sub.add_parser("listings", help="Clean real items from the authorized P1T02 listing adapter")
    listings.add_argument("--input", default="out/listings.json")
    listings.add_argument("--sites", required=True, help="Audited SourceSite array: name, url, robots_checked_at")
    listings.add_argument("--output", default=str(ROOT / "src/data/market/listings.json"))
    listings.add_argument("--min-items", type=int, default=200)
    listings.add_argument("--report", default="out/listing-cleaning-report.json")
    args = parser.parse_args()
    try:
        if args.mode == "places":
            count = export_places(args.input, args.output, args.extract_meta)
        elif args.mode == "listings":
            count = export_listings(args.input, args.sites, args.output, args.min_items, args.report)
        else:
            count = export_synthetic(args.input, args.centres, args.output)
    except (ValueError, OSError) as error:
        parser.exit(2, f"Export refused: {error}\n")
    print(f"Exported {count} {args.mode} rows")


if __name__ == "__main__":
    main()
