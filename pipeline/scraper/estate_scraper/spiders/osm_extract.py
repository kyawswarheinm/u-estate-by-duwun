"""Public ODbL regional download fallback; explicitly not an Overpass result."""
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json

import scrapy
from scrapy.exceptions import CloseSpider

URL = "https://download.geofabrik.de/asia/thailand-latest.osm.pbf"


class OsmExtractSpider(scrapy.Spider):
    name = "osm_extract"
    allowed_domains = ["download.geofabrik.de"]
    custom_settings = {"DOWNLOAD_TIMEOUT": 600, "DOWNLOAD_MAXSIZE": 500 * 1024 * 1024,
                       "DOWNLOAD_WARNSIZE": 400 * 1024 * 1024}

    async def start(self):
        yield scrapy.Request(URL, callback=self.parse, errback=self.failed,
                             meta={"handle_httpstatus_list": [400, 401, 403, 404, 429, 500, 502, 503, 504]})

    def failed(self, failure):
        raise CloseSpider("extract_request_failed_no_retry")

    def parse(self, response):
        if response.status != 200 or len(response.body) < 1000 or b"<html" in response.body[:500].lower():
            raise CloseSpider("extract_download_failed_no_retry")
        Path("out").mkdir(exist_ok=True)
        Path("raw").mkdir(exist_ok=True)
        Path("raw/thailand.osm.pbf").write_bytes(response.body)
        # HTTP Date can be an upstream CDN cache date, not our collection time.
        digest = hashlib.sha256(response.body).hexdigest()
        meta_file = Path("out/extract-meta.json")
        previous = json.loads(meta_file.read_text()) if meta_file.exists() else {}
        same = previous.get("sha256") == digest and previous.get("collection_record_version") == 1
        fetched_at = previous["fetched_at"] if same else datetime.now(timezone.utc).isoformat()
        meta_file.write_text(json.dumps({"endpoint": URL, "resolved_url": response.url,
            "fetched_at": fetched_at, "collection_record_version": 1,
            "http_date": response.headers.get("Date", b"").decode(),
            "last_modified": response.headers.get("Last-Modified", b"").decode(),
            "sha256": digest, "bytes": len(response.body)}, indent=2) + "\n")
        self.crawler.stats.set_value("extract/downloaded_bytes", len(response.body))
