"""Strict data projection. Never emit arbitrary OSM tags or listing descriptions."""
import math
import re

CONTACT = re.compile(r"(?:[\w.+-]+@[\w-]+\.[\w.]+|\bline\s*(?:id)?\s*[:@]|(?:\+66|\b0)[\s-]?[1-9](?:[\s-]?\d){7,8}\b|https?://|www\.)", re.I)
FIELDS = {"name", "kind", "district", "lat", "lng", "osm_id", "source", "fetched_at"}
DISTRICTS = {
    "Sathon": "Sathorn", "สาทร": "Sathorn", "บางนา": "Bang Na", "บางรัก": "Bang Rak",
    "บางซื่อ": "Bang Sue", "จตุจักร": "Chatuchak", "ห้วยขวาง": "Huai Khwang",
    "คลองเตย": "Khlong Toei", "ปทุมวัน": "Pathum Wan", "พญาไท": "Phaya Thai",
    "พระโขนง": "Phra Khanong", "ธนบุรี": "Thon Buri", "วัฒนา": "Watthana",
}


def text(value, limit=120):
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    if not value or len(value) > limit or CONTACT.search(value):
        return None
    return value


def district(value):
    value = text(value, 60)
    if value:
        value = re.sub(r"^(?:เขต|อำเภอ|Khet |Amphoe )", "", value).strip()
        return DISTRICTS.get(value, value)
    return None


def place(element, fetched_at):
    tags = element.get("tags", {})
    name = text(tags.get("name:en")) or text(tags.get("name"))
    if name is None:
        return None
    station = (tags.get("railway") == "station" or tags.get("public_transport") == "station") and (
        tags.get("station") in {"subway", "light_rail"}
        or any(re.search(r"\b(?:BTS|MRT|BEM|MRTA|BTSC|ARL|SRTET|Airport Rail Link)\b|รถไฟฟ้า|ขนส่งมวลชน", str(tags.get(k, "")), re.I)
               for k in ("network", "network:en", "operator", "operator:en")))
    building = tags.get("building") in {"apartments", "residential"} or tags.get("landuse") == "residential"
    if not (station or building):
        return None
    centre = element.get("center", element)
    lat, lng = centre.get("lat"), centre.get("lon")
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in (lat, lng)):
        return None
    if not (13.4 <= lat <= 14.15 and 100.2 <= lng <= 101.0):
        return None
    osm_type, osm_id = element.get("type"), element.get("id")
    if osm_type not in {"node", "way", "relation"} or not isinstance(osm_id, int) or osm_id <= 0:
        return None
    return {"name": name, "kind": "station" if station else "condo_building",
            "district": district(tags.get("addr:district")), "lat": round(lat, 3), "lng": round(lng, 3),
            "osm_id": f"{osm_type}/{osm_id}", "source": "OpenStreetMap", "fetched_at": fetched_at}
