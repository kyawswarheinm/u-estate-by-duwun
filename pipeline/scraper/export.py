"""Clean exports only; never merge real OSM names with synthetic prices."""
import argparse
import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path

from estate_scraper.clean import FIELDS, district, text

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
    args = parser.parse_args()
    count = export_places(args.input, args.output, args.extract_meta) if args.mode == "places" else export_synthetic(args.input, args.centres, args.output)
    print(f"Exported {count} {args.mode} rows")


if __name__ == "__main__":
    main()
