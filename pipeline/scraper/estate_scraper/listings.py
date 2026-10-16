"""Project explicit JSON-LD sale offers into the frozen listing contract."""
from datetime import date
import hashlib
import math
import re
import unicodedata
from urllib.parse import urlsplit

from estate_scraper.clean import CONTACT, district, text

LISTING_FIELDS = {"id", "site", "source_url", "kind", "type", "project", "district", "province",
                  "lat", "lng", "geo_precision", "price_thb", "area_sqm", "price_per_sqm",
                  "bedrooms", "listed_at", "scraped_at"}


def number(value):
    # Ranges, localized marketing strings and booleans are deliberately not numbers.
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, OverflowError):
        return None


def area_sqm(value):
    if not isinstance(value, dict):
        return None
    if "minValue" in value or "maxValue" in value:
        return None
    amount = number(value.get("value"))
    unit = value.get("unitCode") or value.get("unitText")
    if not isinstance(unit, str) or amount is None or amount <= 0:
        return None
    multiplier = {"mtk": 1, "sqm": 1, "m²": 1, "m2": 1, "square metre": 1,
                  "square meter": 1, "ตร.ม.": 1, "rai": 1600, "ไร่": 1600,
                  "square wa": 4, "square wah": 4, "ตร.ว.": 4}.get(unit.strip().lower())
    return amount * multiplier if multiplier else None


def sale_listing(document, url, site, fetched_at):
    """Accept an explicit single sale offer, never pair unrelated price/size minima."""
    if not isinstance(document, dict):
        return None
    parsed = urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        return None
    if CONTACT.search(parsed.path):
        return None
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", site):
        return None
    offer = document if document.get("@type") == "Offer" else document.get("offers")
    if not isinstance(offer, dict) or offer.get("@type") != "Offer":
        return None
    function = offer.get("businessFunction")
    if function not in ("Sell", "http://purl.org/goodrelations/v1#Sell", "https://purl.org/goodrelations/v1#Sell"):
        return None  # An unknown offer might be monthly rent; never guess sale.
    if offer.get("availability") not in ("InStock", "https://schema.org/InStock", "http://schema.org/InStock"):
        return None
    residence = offer.get("itemOffered")
    if not isinstance(residence, dict):
        residence = document.get("mainEntity")
    if not isinstance(residence, dict):
        return None
    kind = {"Apartment": "condo", "House": "house", "SingleFamilyResidence": "house"}.get(residence.get("@type") if isinstance(residence.get("@type"), str) else None)
    address = residence.get("address")
    if kind is None or not isinstance(address, dict):
        return None
    country = address.get("addressCountry")
    if isinstance(country, dict):
        country = country.get("name")
    if country not in ("TH", "Thailand", "ประเทศไทย"):
        return None
    location = district(address.get("addressLocality"))
    province = text(address.get("addressRegion"), 60)
    province = {"กรุงเทพมหานคร": "Bangkok", "กรุงเทพฯ": "Bangkok"}.get(province, province)
    if not location or province not in {"Bangkok", "Nonthaburi", "Pathum Thani", "Samut Prakan", "Samut Sakhon", "Nakhon Pathom"}:
        return None
    price = number(offer.get("price"))
    size = area_sqm(residence.get("floorSize"))
    if offer.get("priceCurrency") != "THB" or price is None or price <= 0 or size is None:
        return None
    unit_price = price / size
    if not math.isfinite(unit_price) or unit_price <= 0:
        return None
    geo = residence.get("geo")
    geo = geo if isinstance(geo, dict) else {}
    lat, lng = number(geo.get("latitude")), number(geo.get("longitude"))
    if lat is None or lng is None or not (5 <= lat <= 21 and 97 <= lng <= 106):
        lat = lng = None
    bedrooms = number(residence.get("numberOfBedrooms"))
    bedrooms = int(bedrooms) if bedrooms is not None and bedrooms >= 0 and bedrooms.is_integer() else None
    listed_at = document.get("datePosted")
    try:
        listed_at = date.fromisoformat(listed_at).isoformat() if isinstance(listed_at, str) else None
    except ValueError:
        listed_at = None
    parent = residence.get("containedInPlace")
    name = parent.get("name") if isinstance(parent, dict) and parent.get("@type") == "ApartmentComplex" else None
    project = text(unicodedata.normalize("NFKC", name)) if isinstance(name, str) else None
    return {"id": "ext-" + site + "-" + hashlib.sha1(url.encode()).hexdigest()[:10],
            "site": site, "source_url": url, "kind": "sale", "type": kind,
            "project": project, "district": location, "province": province,
            "lat": round(lat, 3) if lat is not None else None,
            "lng": round(lng, 3) if lng is not None else None,
            "geo_precision": "exact" if lat is not None else "none", "price_thb": price,
            "area_sqm": size, "price_per_sqm": unit_price, "bedrooms": bedrooms,
            "listed_at": listed_at, "scraped_at": fetched_at}
