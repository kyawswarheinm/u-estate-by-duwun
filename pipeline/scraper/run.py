"""Run an audited spider and return nonzero on unavailable/empty data."""
import argparse
from pathlib import Path
import json
from scrapy import signals
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from estate_scraper.spiders.osm_places import OsmPlacesSpider
from estate_scraper.spiders.osm_extract import OsmExtractSpider


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spider", choices=["osm_places", "osm_extract"])
    parser.add_argument("--offline", action="store_true", help="Cache only; fail instead of making a cache-miss request")
    parser.add_argument("--limit", type=int, default=0, help="Optional item smoke-test cap")
    args = parser.parse_args()
    if args.limit < 0:
        parser.error("limit must not be negative")
    settings = get_project_settings()
    if args.offline:
        settings.set("HTTPCACHE_IGNORE_MISSING", True, priority="cmdline")
    if args.limit:
        settings.set("CLOSESPIDER_ITEMCOUNT", args.limit, priority="cmdline")
    process = CrawlerProcess(settings)
    crawler = process.create_crawler(OsmPlacesSpider if args.spider == "osm_places" else OsmExtractSpider)
    final = {}

    def closed(spider, reason):
        stats = crawler.stats.get_stats()
        for key in ("finish_reason", "item_scraped_count", "places/clean_count", "extract/downloaded_bytes", "httpcache/hit", "httpcache/miss", "places/osm_base_timestamp"):
            if key in stats:
                final[key] = stats[key]
        final["finish_reason"] = reason
        Path("out").mkdir(exist_ok=True)
        Path(f"out/{args.spider}-stats.json").write_text(json.dumps(final, indent=2) + "\n")

    crawler.signals.connect(closed, signal=signals.spider_closed, weak=False)
    process.crawl(crawler)
    process.start()
    success = final.get("finish_reason") in {"finished", "closespider_itemcount"} and (
        final.get("places/clean_count", 0) > 0 if args.spider == "osm_places" else final.get("extract/downloaded_bytes", 0) > 0)
    if not success:
        raise SystemExit("No usable source data. Existing cleaned snapshots were not changed.")


if __name__ == "__main__":
    main()
