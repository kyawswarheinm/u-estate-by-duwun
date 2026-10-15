"""One bounded, cached query. No prices, contacts, contributor metadata or images."""
import json
from datetime import datetime, timezone
from pathlib import Path

import scrapy
from scrapy.exceptions import CloseSpider
from estate_scraper.clean import place, district

ENDPOINT = "https://overpass.kumi.systems/api/interpreter"
BBOX = "13.4,100.2,14.15,101.0"
QUERY = f'''[out:json][timeout:45][maxsize:67108864];
(
 nwr["name"]["building"~"^(apartments|residential)$"]({BBOX});
 nwr["name"]["landuse"="residential"]({BBOX});
 nwr["name"]["railway"="station"]({BBOX});
 nwr["name"]["public_transport"="station"]({BBOX});
 relation["boundary"="administrative"]["admin_level"="6"]["name:en"]({BBOX});
);
out center tags;'''


class OsmPlacesSpider(scrapy.Spider):
    name = "osm_places"
    allowed_domains = ["overpass.kumi.systems"]
    custom_settings = {"FEEDS": {"out/places.json": {"format": "json", "overwrite": True}}}

    async def start(self):
        yield scrapy.FormRequest(ENDPOINT, formdata={"data": QUERY}, callback=self.parse,
                                 errback=self.failed, meta={"handle_httpstatus_list": [400, 401, 403, 404, 429, 500, 502, 503, 504]})

    def failed(self, failure):
        raise CloseSpider("request_failed_no_retry")

    def parse(self, response):
        if response.status != 200:
            raise CloseSpider(f"http_{response.status}_no_retry")
        try:
            data = response.json()
        except ValueError:
            raise CloseSpider("non_json_response_no_retry")
        if data.get("remark") or not isinstance(data.get("elements"), list):
            raise CloseSpider("incomplete_overpass_response")
        # Preserve the original collection timestamp when replaying the HTTP cache.
        fetched_at = response.headers.get("Date", b"").decode()
        if fetched_at:
            from email.utils import parsedate_to_datetime
            fetched_at = parsedate_to_datetime(fetched_at).isoformat()
        else:
            fetched_at = datetime.now(timezone.utc).isoformat()
        centres = {}
        seen = set()
        for element in data["elements"]:
            tags = element.get("tags", {})
            if tags.get("boundary") == "administrative" and tags.get("admin_level") == "6":
                name = district(tags.get("name:en"))
                centre = element.get("center", {})
                if name and "lat" in centre and "lon" in centre:
                    centres[name] = {"lat": round(centre["lat"], 3), "lng": round(centre["lon"], 3),
                                     "osm_id": f'relation/{element["id"]}'}
                continue
            row = place(element, fetched_at)
            if row and row["osm_id"] not in seen:
                seen.add(row["osm_id"])
                yield row
        Path("out").mkdir(exist_ok=True)
        Path("out/district-centres.json").write_text(json.dumps({"source": "OpenStreetMap", "fetched_at": fetched_at,
            "centres": centres}, ensure_ascii=False, indent=2) + "\n")
        self.crawler.stats.set_value("places/clean_count", len(seen))
        self.crawler.stats.set_value("places/osm_base_timestamp", data.get("osm3s", {}).get("timestamp_osm_base"))
