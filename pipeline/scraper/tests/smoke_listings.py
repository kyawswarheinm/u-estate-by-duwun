"""Network-free Scrapy smoke test. Generated fixtures NEVER count as real listings."""
import json
from pathlib import Path
from unittest.mock import patch

from scrapy.crawler import CrawlerProcess
from scrapy.http import HtmlResponse, TextResponse
from scrapy.utils.project import get_project_settings

from estate_scraper.listings import LISTING_FIELDS
from estate_scraper.spiders.licensed_listings import LicensedListingsSpider
from tests.test_listings import document


class FixtureDownloader:
    def process_request(self, request):
        if request.url == "https://example.org/robots.txt":
            return TextResponse(request.url, body=b"User-agent: *\nAllow: /\n", encoding="utf8", request=request)
        if not request.url.startswith("https://example.org/sale/fixture-"):
            raise RuntimeError("Unexpected URL: this smoke test must never access the network")
        body = '<script type="application/ld+json">' + json.dumps(document()) + '</script>'
        return HtmlResponse(request.url, body=body.encode(), encoding="utf8", request=request)


def main():
    output = Path("out/tests/listing-smoke.json")
    output.parent.mkdir(parents=True, exist_ok=True)
    settings = get_project_settings()
    # Test-only speed overrides; every request is satisfied by FixtureDownloader.
    settings.setdict({"DOWNLOADER_MIDDLEWARES": {"__main__.FixtureDownloader": 50},
        "DOWNLOAD_DELAY": 0, "AUTOTHROTTLE_ENABLED": False, "HTTPCACHE_ENABLED": False,
        "LOG_LEVEL": "ERROR", "CLOSESPIDER_ITEMCOUNT": 50}, priority="cmdline")
    process = CrawlerProcess(settings)
    crawler = process.create_crawler(LicensedListingsSpider)
    crawler.settings.set("FEEDS", {str(output): {"format": "json", "overwrite": True}}, priority="cmdline")
    # No real permission file is created; only the test's constructor is mocked.
    with patch.object(Path, "is_file", return_value=True), patch.object(Path, "is_symlink", return_value=False), \
            patch.object(Path, "read_text", return_value="TEST ONLY: generated fixture permission"):
        process.crawl(crawler, site="test-fixture", start_urls=[
            f"https://example.org/sale/fixture-{i}" for i in range(70)])
    process.start()
    rows = json.loads(output.read_text())
    assert crawler.stats.get_value("finish_reason") == "closespider_itemcount"
    assert len(rows) == 50, f"Expected 50 fixtures, got {len(rows)}"
    assert len({row["id"] for row in rows}) == 50
    assert all(set(row) == LISTING_FIELDS and row["site"] == "test-fixture" for row in rows)
    print("PASS: 50 GENERATED TEST FIXTURES through Scrapy; zero real listings, no network")


if __name__ == "__main__":
    main()
