"""JSON-LD adapter, disabled until a human records written source permission."""
from datetime import datetime, timezone
import json
import hashlib
from pathlib import Path
import re
from urllib.parse import urlsplit

import scrapy
from scrapy.exceptions import CloseSpider

from estate_scraper.listings import market_listing

REFUSED = {"ddproperty.com", "hipflat.co.th", "hipflat.com", "fazwaz.com", "livinginsider.com"}


class LicensedListingsSpider(scrapy.Spider):
    name = "licensed_listings"
    custom_settings = {"FEEDS": {"out/listings.json": {"format": "json", "overwrite": True}}}

    def __init__(self, site=None, start_urls=None, link_css=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if not isinstance(site, str) or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", site):
            raise ValueError("A source site slug is required")
        permission = Path(__file__).resolve().parents[2] / "permissions" / f"{site}.md"
        if not permission.is_file() or permission.is_symlink() or not permission.read_text().strip():
            raise ValueError("Missing human-held written permission record: permissions/<site>.md")
        urls = start_urls.split(",") if isinstance(start_urls, str) else list(start_urls or [])
        if not urls or len(urls) > 500:
            raise ValueError("Supply between 1 and 500 approved public start URLs")
        hosts = set()
        for url in urls:
            parsed = urlsplit(url)
            host = parsed.hostname or ""
            if parsed.scheme != "https" or not host or parsed.username or parsed.password or parsed.query or parsed.fragment:
                raise ValueError("Use clean HTTPS source URLs without credentials or query parameters")
            if any(host == domain or host.endswith("." + domain) for domain in REFUSED):
                raise ValueError("This source is off-limits; no request was sent")
            hosts.add(host)
        self.site = site
        self.collection_path = Path("out") / f"{site}-collection.json"
        self.start_urls = urls
        self.allowed_domains = sorted(hosts)
        # Site-specific link discovery is opt-in after inspection of an eligible page.
        self.link_css = link_css
        self.seen = set()

    async def start(self):
        for url in self.start_urls:
            yield scrapy.Request(url, callback=self.parse, errback=self.failed)

    def failed(self, failure):
        raise CloseSpider("source_request_failed_no_retry")

    def parse(self, response):
        if re.search(r"cf-chl-|g-recaptcha|hcaptcha|verify you are human", response.text, re.I):
            raise CloseSpider("source_challenge_stop")
        record_path = self.collection_path
        records = json.loads(record_path.read_text()) if record_path.exists() else {}
        digest = hashlib.sha256(response.body).hexdigest()
        previous = records.get(response.url, {})
        stamp = previous["fetched_at"] if previous.get("sha256") == digest else datetime.now(timezone.utc).isoformat()
        records[response.url] = {"sha256": digest, "fetched_at": stamp}
        record_path.parent.mkdir(exist_ok=True)
        record_path.write_text(json.dumps(records, indent=2) + "\n")
        limit = self.crawler.settings.getint("CLOSESPIDER_ITEMCOUNT", 0)
        for script in response.css('script[type="application/ld+json"]::text').getall():
            try:
                document = json.loads(script)
            except ValueError:
                self.crawler.stats.inc_value("listings/invalid_jsonld")
                continue
            documents = document if isinstance(document, list) else [document]
            for entry in documents:
                entries = entry.get("@graph", [entry]) if isinstance(entry, dict) else []
                for candidate in entries if isinstance(entries, list) else []:
                    row = market_listing(candidate, response.url, self.site, stamp)
                    if limit and len(self.seen) >= limit:
                        return
                    if row and row["id"] not in self.seen:
                        self.seen.add(row["id"])
                        self.crawler.stats.inc_value("listings/clean_count")
                        yield row
        if self.link_css:
            for href in response.css(self.link_css).getall():
                target = response.urljoin(href)
                parsed = urlsplit(target)
                if parsed.scheme == "https" and parsed.hostname in self.allowed_domains and not parsed.query and not parsed.fragment:
                    yield scrapy.Request(target, callback=self.parse, errback=self.failed)
