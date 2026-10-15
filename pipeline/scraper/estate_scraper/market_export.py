"""Deterministic cleaning of facts-only rows. No network or inferred prices."""
from collections import Counter, defaultdict
from datetime import date, datetime
import hashlib
import math
import re
import unicodedata
from urllib.parse import unquote, urlsplit

from estate_scraper.clean import CONTACT, DISTRICTS, district, text
from estate_scraper.listings import LISTING_FIELDS, area_sqm, number

TYPES = {"condo": "condo", "condominium": "condo", "apartment": "condo", "คอนโด": "condo",
         "house": "house", "single-family house": "house", "บ้าน": "house", "บ้านเดี่ยว": "house",
         "townhouse": "townhouse", "townhome": "townhouse", "ทาวน์เฮ้าส์": "townhouse",
         "land": "land", "ที่ดิน": "land"}
KINDS = {"sale": "sale", "for sale": "sale", "ขาย": "sale", "rent": "rent", "for rent": "rent", "ให้เช่า": "rent"}
PROVINCES = {name.casefold(): name for name in (
    "Bangkok", "Nonthaburi", "Pathum Thani", "Samut Prakan", "Samut Sakhon", "Nakhon Pathom")}
PROVINCES.update({"กรุงเทพมหานคร": "Bangkok", "กรุงเทพฯ": "Bangkok", "นนทบุรี": "Nonthaburi",
                  "ปทุมธานี": "Pathum Thani", "สมุทรปราการ": "Samut Prakan",
                  "สมุทรสาคร": "Samut Sakhon", "นครปฐม": "Nakhon Pathom"})
DISTRICT_NAMES = {re.sub(r"\s", "", name).casefold(): name for name in DISTRICTS.values()}
DISTRICT_NAMES.update({"sathon": "Sathorn", "wattana": "Watthana", "huaykwang": "Huai Khwang"})


def safe_text(value, limit=120):
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("Non-text location/project field")
    value = unicodedata.normalize("NFKC", value)
    if CONTACT.search(value):
        raise ValueError("Contact-bearing text: export refused")
    return text(value, limit)


def source_url(value):
    if not isinstance(value, str):
        raise ValueError("Missing source URL")
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or CONTACT.search(unicodedata.normalize("NFKC", unquote(parsed.path)))):
        raise ValueError("Unsafe source URL: export refused")
    return parsed


def collection_time(value):
    if not isinstance(value, str):
        raise ValueError("Missing collection timestamp")
    timestamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if timestamp.utcoffset() is None:
        raise ValueError("Collection timestamp must include its timezone")
    return timestamp


def normalise_row(raw):
    if not isinstance(raw, dict) or set(raw) - LISTING_FIELDS:
        raise ValueError("Unexpected listing fields: export refused")
    price = number(raw.get("price_thb"))
    value = raw.get("area_sqm")
    size = area_sqm(value) if isinstance(value, dict) else number(value)
    if price is None or size is None or price <= 0 or size <= 0 or not math.isfinite(size):
        return None, "missing_price_or_area"
    # Check all text for contacts before treating missing/invalid fields as droppable.
    project = safe_text(raw.get("project"))
    location = district(safe_text(raw.get("district"), 60))
    province = safe_text(raw.get("province"), 60)
    if location:
        location = re.sub(r"^(?:khet|amphoe)\s+|\s+district$", "", location, flags=re.I)
        location = DISTRICT_NAMES.get(re.sub(r"\s", "", location).casefold(), location)
    if location and re.search(r"[\u0e00-\u0e7f]", location):
        return None, "unmapped_district"
    province = PROVINCES.get(province.casefold()) if province else None
    kind_text, type_text = safe_text(raw.get("kind"), 30), safe_text(raw.get("type"), 40)
    kind = KINDS.get(kind_text.casefold()) if kind_text else None
    property_type = TYPES.get(type_text.casefold()) if type_text else None
    if not location or not province or not kind or not property_type:
        return None, "invalid_location_or_type"
    site = raw.get("site")
    if not isinstance(site, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", site):
        raise ValueError("Invalid source site slug")
    url = raw.get("source_url")
    source_url(url)
    collection_time(raw.get("scraped_at"))
    unit_price = price / size
    if not math.isfinite(unit_price) or unit_price <= 0:
        return None, "missing_price_or_area"
    lat, lng = number(raw.get("lat")), number(raw.get("lng"))
    precision = raw.get("geo_precision")
    if (lat is None or lng is None or not (5 <= lat <= 21 and 97 <= lng <= 106)
            or precision not in ("exact", "project", "district")):
        lat = lng = None
        precision = "none"
    bedrooms = number(raw.get("bedrooms"))
    bedrooms = int(bedrooms) if bedrooms is not None and 0 <= bedrooms <= 2**53 - 1 and bedrooms.is_integer() else None
    listed_at = raw.get("listed_at")
    if listed_at is not None:
        try:
            listed_at = date.fromisoformat(listed_at).isoformat()  # Normalize valid dates; unknowns stay null.
        except (TypeError, ValueError):
            listed_at = None
    return {"id": f"ext-{site}-" + hashlib.sha1(url.encode()).hexdigest()[:10],
            "site": site, "source_url": url, "kind": kind, "type": property_type,
            "project": project, "district": location, "province": province,
            "lat": round(lat, 3) if lat is not None else None,
            "lng": round(lng, 3) if lng is not None else None, "geo_precision": precision,
            "price_thb": price, "area_sqm": size, "price_per_sqm": unit_price,
            "bedrooms": bedrooms, "listed_at": listed_at, "scraped_at": raw["scraped_at"]}, None


def percentile(values, fraction):
    """Linear interpolation at (n-1)*p, with inclusive endpoints."""
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def clean_listings(raw_rows):
    if not isinstance(raw_rows, list):
        raise ValueError("Expected a Scrapy item array, not a fixture envelope")
    report = Counter(input=len(raw_rows), duplicates=0, outliers=0, retained=0,
                     missing_price_or_area=0, invalid_location_or_type=0, unmapped_district=0)
    by_url = {}
    # Refuse private/extra fields even on a row that would be dropped for no price.
    for raw in raw_rows:
        if not isinstance(raw, dict) or set(raw) - LISTING_FIELDS:
            raise ValueError("Unexpected listing fields: export refused")
        for key in ("project", "district", "province"):
            safe_text(raw.get(key))
        row, reason = normalise_row(raw)
        if row is None:
            report[reason] += 1
            continue
        key = row["source_url"]
        if key in by_url:
            previous = by_url[key]
            old_time, new_time = collection_time(previous["scraped_at"]), collection_time(row["scraped_at"])
            fields = LISTING_FIELDS - {"id", "site", "scraped_at"}
            if new_time == old_time and any(row[field] != previous[field] for field in fields):
                raise ValueError("Conflicting rows for the same URL and collection timestamp")
            report["duplicates"] += 1
            if new_time > old_time or (new_time == old_time and row["site"] < previous["site"]):
                by_url[key] = row
        else:
            by_url[key] = row
    unique = {}
    for row in sorted(by_url.values(), key=lambda item: (item["source_url"], item["site"])):
        # Unknown project is not a shared building: unrelated null-project rows survive.
        key = (row["province"], row["district"], row["type"], row["kind"], row["project"].casefold(),
               row["area_sqm"], row["price_thb"]) if row["project"] else (row["site"], row["source_url"])
        if key in unique:
            report["duplicates"] += 1
        else:
            unique[key] = row
    groups = defaultdict(list)
    for row in unique.values():
        groups[row["type"], row["kind"]].append(row)
    cleaned, cohorts = [], []
    for (property_type, kind), rows in sorted(groups.items()):
        values = [row["price_per_sqm"] for row in rows]
        lower, upper = percentile(values, .01), percentile(values, .99)
        kept = [row for row in rows if lower <= row["price_per_sqm"] <= upper]
        report["outliers"] += len(rows) - len(kept)
        cohorts.append({"type": property_type, "kind": kind, "count": len(rows), "p01": lower, "p99": upper})
        cleaned.extend(kept)
    cleaned.sort(key=lambda item: item["id"])
    if len({row["id"] for row in cleaned}) != len(cleaned):
        raise ValueError("Stable ID collision: export refused")
    report["retained"] = len(cleaned)
    return cleaned, {**report, "cohorts": cohorts}
