"""Offline batch coordinates; no generic app-facing geocoding service."""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import threading
import unicodedata
import re
import time
from urllib.error import HTTPError

try:  # POSIX
    import fcntl
except ImportError:  # Windows: the team's laptops
    fcntl = None
    import msvcrt


def lock_exclusive_nonblocking(f):
    """Take an exclusive lock on an open file or raise OSError if another process holds it."""
    if fcntl is not None:
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
    else:
        f.seek(0)
        msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
from urllib.parse import unquote, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from protego import Protego

from estate_scraper.clean import CONTACT, district
from estate_scraper.listings import number
from estate_scraper.spiders.licensed_listings import REFUSED
from estate_scraper.market_export import DISTRICT_NAMES, PROVINCES, collection_time, safe_text, source_url

ENDPOINT = "https://nominatim.openstreetmap.org/search"
OSM_CREDIT = "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)"


def point(lat, lng):
    lat, lng = number(lat), number(lng)
    if lat is None or lng is None or not (5 <= lat <= 21 and 97 <= lng <= 106):
        return None
    return {"lat": round(lat, 3), "lng": round(lng, 3)}


def key_text(value):
    return "".join(character for character in value.casefold() if unicodedata.category(character)[0] in {"L", "N", "M"})


def district_key(value):
    value = district(safe_text(value, 60))
    if not value:
        return ""
    value = re.sub(r"^(?:khet|amphoe)\s+|\s+district$", "", value, flags=re.I)
    return key_text(DISTRICT_NAMES.get(key_text(value), value))


def matched_point(results, project, location, province):
    if not isinstance(results, list):
        raise ValueError("Invalid geocoder response")
    matches = set()
    for result in results:
        if not isinstance(result, dict):
            continue
        address = result.get("address")
        if not isinstance(address, dict) or address.get("country_code") != "th":
            continue
        if result.get("category", result.get("class")) == "boundary":
            continue
        details = result.get("namedetails")
        names = [result.get("name")]
        if isinstance(details, dict):
            names.extend(details.get(field) for field in ("name", "name:en", "name:th"))
        names = [safe_text(name) for name in names if isinstance(name, str)]
        if not any(name and key_text(name) == key_text(project) for name in names):
            continue
        districts = [address.get(field) for field in ("city_district", "borough", "district", "county", "suburb")]
        if not any(district_key(value) == district_key(location) for value in districts if isinstance(value, str)):
            continue
        provinces = [safe_text(address.get(field), 60) for field in ("state", "province", "city")]
        provinces = [value.removeprefix("จังหวัด").removesuffix(" Province").strip() for value in provinces if value]
        if not any(PROVINCES.get(value.casefold()) == province for value in provinces):
            continue
        candidate = point(result.get("lat"), result.get("lon"))
        if candidate:
            matches.add((candidate["lat"], candidate["lng"]))
    return dict(zip(("lat", "lng"), next(iter(matches)))) if len(matches) == 1 else None


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def fetch(url, headers):
    """No automatic retries/redirects, cookies, raw response cache or contact logs."""
    opener = build_opener(NoRedirect())
    try:
        with opener.open(Request(url, headers=headers), timeout=20) as response:
            body = response.read(262145)
            if len(body) > 262144:
                raise ValueError("Geocoder response exceeds size limit")
            return response.status, body.decode("utf8")
    except HTTPError as error:
        return error.code, ""  # Never persist a challenge/error page.


class NominatimClient:
    def __init__(self, cache_dir, *, online=False, contact_url=None, endpoint=ENDPOINT,
                 max_lookups=500, transport=fetch, clock=time.monotonic, sleep=time.sleep, wall_clock=time.time):
        host = source_url(endpoint).hostname
        if any(host == domain or host.endswith("." + domain) for domain in REFUSED):
            raise ValueError("Geocoder endpoint is an off-limits source")
        if online and not contact_url:
            raise ValueError("Online geocoding requires a public operator --contact-url")
        if contact_url:
            source_url(contact_url)
        if not isinstance(max_lookups, int) or isinstance(max_lookups, bool) or not 0 <= max_lookups <= 500:
            raise ValueError("Geocoding budget must be between 0 and 500 lookups")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.online, self.endpoint, self.max_lookups = online, endpoint, max_lookups
        self.headers = {"User-Agent": f"U-Estate-Hackathon/0.1 ({contact_url or 'offline cache only'})",
                        "Accept": "application/json", "Accept-Language": "en,th"}
        self.transport, self.clock, self.sleep, self.wall_clock = transport, clock, sleep, wall_clock
        self.stats = Counter()
        self.last_request = None
        self.disabled = False
        self.robots_allowed = None
        self.thread = threading.get_ident()
        self.lock = None

    def __enter__(self):
        if self.online:
            self.lock = (self.cache_dir / ".batch.lock").open("a")
            try:
                lock_exclusive_nonblocking(self.lock)
                last_path = self.cache_dir / ".last-request"
                if last_path.exists():
                    previous = number(last_path.read_text())
                    if previous is None:
                        raise ValueError("Invalid rate-limit state")
                    age = max(0, self.wall_clock() - previous)
                    self.last_request = self.clock() - min(age, 2)
            except (OSError, ValueError):
                self.lock.close()
                self.lock = None
                raise ValueError("Another geocoding batch owns this cache; run one process on one machine")
        return self

    def __exit__(self, *args):
        if self.lock:
            self.lock.close()
            self.lock = None

    def _request(self, url):
        if self.last_request is not None:
            self.sleep(max(0, 2 - (self.clock() - self.last_request)))
        self.stats["network_requests"] += 1
        try:
            return self.transport(url, self.headers)
        finally:
            self.last_request = self.clock()
            state = self.cache_dir / ".last-request"
            temporary = state.with_suffix(".tmp")
            temporary.write_text(str(self.wall_clock()))
            temporary.replace(state)

    def _robots(self):
        if self.robots_allowed is None:
            origin = urlsplit(self.endpoint)
            status, body = self._request(f"https://{origin.netloc}/robots.txt")
            body = body.lstrip("\ufeff")
            if status == 404:
                self.robots_allowed = True
            elif status == 200 and not body.lstrip().startswith("<") and not re.search(r"captcha|cf-chl-|verify you are human|access denied", body, re.I):
                parser = Protego.parse(body)
                self.robots_allowed = parser.can_fetch(self.endpoint, self.headers["User-Agent"])
            else:
                raise ValueError("Robots policy unavailable; no lookup sent")
            if not self.robots_allowed:
                self.stats["robots_denied"] += 1
                self.disabled = True
        return self.robots_allowed

    def lookup(self, project, location, province):
        if threading.get_ident() != self.thread or (self.online and self.lock is None):
            raise ValueError("Use one geocoding thread inside the batch context manager")
        project, location, province = safe_text(project), safe_text(location, 60), safe_text(province, 60)
        if not project or not location or not province:
            return None
        query = f"{project}, {location}, {province}, Thailand"
        digest = hashlib.sha256(("match-v1\n" + self.endpoint + "\n" + query).encode()).hexdigest()
        path = self.cache_dir / f"{digest}.json"
        if path.exists():
            cached = json.loads(path.read_text())
            if not isinstance(cached, dict) or set(cached) != {"query", "endpoint", "result", "fetched_at"}:
                raise ValueError("Invalid geocoder cache record")
            result = cached["result"]
            collection_time(cached["fetched_at"])
            if cached.get("query") != query or cached.get("endpoint") != self.endpoint:
                raise ValueError("Geocoder cache provenance mismatch")
            if result is not None and (not isinstance(result, dict) or set(result) != {"lat", "lng"}
                                       or point(result["lat"], result["lng"]) != result):
                raise ValueError("Invalid cached point")
            self.stats["cache_hits"] += 1
            return result
        self.stats["cache_misses"] += 1
        if not self.online or self.disabled:
            return None
        if self.stats["lookups"] >= self.max_lookups:
            self.stats["budget_exhausted"] += 1
            return None
        try:
            if not self._robots():
                return None
            params = urlencode({"q": query, "format": "jsonv2", "countrycodes": "th", "limit": 3,
                                "addressdetails": 1, "namedetails": 1, "accept-language": "en,th"})
            self.stats["lookups"] += 1
            status, body = self._request(self.endpoint + "?" + params)
            if status != 200:
                raise ValueError("Geocoder unavailable; no retry")
            result = matched_point(json.loads(body), project, location, province)
        except (OSError, ValueError):
            self.stats["service_errors"] += 1
            self.disabled = True
            return None
        payload = {"query": query, "endpoint": self.endpoint, "result": result,
                   "fetched_at": datetime.now(timezone.utc).isoformat()}
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps(payload, ensure_ascii=False, allow_nan=False) + "\n")
        temp.replace(path)
        return result


def resolve_coordinates(rows, centres_file, client):
    registry = json.loads(Path(centres_file).read_text())
    if not isinstance(registry, dict) or not isinstance(registry.get("centres"), dict):
        raise ValueError("Invalid district reference registry")
    for field in ("source", "license"):
        registry[field] = safe_text(registry.get(field))
        if not registry[field]:
            raise ValueError("District references require source and licence attribution")
    for field in ("source_url", "license_url"):
        value = registry.get(field)
        if not isinstance(value, str):
            raise ValueError("Missing district reference URL")
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
                or CONTACT.search(unquote(parsed.path + "?" + parsed.query))):
            raise ValueError("Unsafe district reference URL")
    province = registry.get("province", "Bangkok")
    centres = {}
    for name, entry in registry["centres"].items():
        if not isinstance(entry, dict) or not safe_text(name, 60) or entry.get("province", province) not in PROVINCES.values():
            raise ValueError("Invalid district reference point")
        centres[entry.get("province", province), name] = entry
    counts, output = Counter(), []
    for original in rows:
        row = dict(original)
        if row["site"].split("-")[0] in {"synthetic", "fixture", "sample", "test", "demo"}:
            counts["sample_skipped"] += 1
            output.append(row)
            continue
        existing = point(row.get("lat"), row.get("lng"))
        if existing and row.get("geo_precision") in {"exact", "project", "district"}:
            row.update(existing)
            counts["retained_" + row["geo_precision"]] += 1
        else:
            candidate = client.lookup(row.get("project"), row["district"], row["province"]) if row.get("project") else None
            if candidate:
                row.update(candidate, geo_precision="project")
                counts["nominatim"] += 1
            else:
                entry = centres.get((row["province"], row["district"]), {})
                candidate = point(entry.get("lat"), entry.get("lng"))
                if candidate:
                    row.update(candidate, geo_precision="district")
                    counts["district_fallback"] += 1
                else:
                    row.update(lat=None, lng=None, geo_precision="none")
                    counts["unlocated"] += 1
        output.append(row)
    located = sum(point(row.get("lat"), row.get("lng")) is not None and row.get("geo_precision") in {"exact", "project", "district"} for row in output)
    return output, {**counts, "located": located, "total": len(output),
                    "coverage": located / len(output) if output else 0,
                    "client": dict(client.stats), "endpoint": client.endpoint,
                    "district_source": {key: registry.get(key) for key in ("source", "source_url", "license", "license_url")}}
