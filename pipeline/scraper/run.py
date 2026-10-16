"""Run an audited spider and return nonzero on unavailable/empty data."""
import argparse
from pathlib import Path
import json
from scrapy import signals
from scrapy.crawler import CrawlerProcess
from scrapy.utils.project import get_project_settings
from estate_scraper.spiders.osm_places import OsmPlacesSpider
from estate_scraper.spiders.osm_extract import OsmExtractSpider
from estate_scraper.spiders.licensed_listings import LicensedListingsSpider


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spider", choices=["osm_places", "osm_extract", "licensed_listings"])
    parser.add_argument("--offline", action="store_true", help="Cache only; fail instead of making a cache-miss request")
    parser.add_argument("--limit", type=int, default=0, help="Optional item smoke-test cap")
    parser.add_argument("--site", help="Human-authorized listing source slug")
    parser.add_argument("--start-url", action="append", default=[], help="Approved HTTPS URL; repeat for multiple pages")
    parser.add_argument("--link-css", help="Source-specific CSS selector ending in ::attr(href)")
    parser.add_argument("--min-items", type=int, default=1, help="Minimum clean listing count required for success")
    args = parser.parse_args()
    if args.min_items < 1:
        parser.error("min-items must be positive")
    if args.spider == "licensed_listings" and (not args.site or not args.start_url):
        parser.error("licensed_listings requires --site and at least one --start-url")
    if args.spider == "licensed_listings":
        if args.limit and args.min_items > args.limit:
            parser.error("min-items cannot exceed the item limit")
        try:
            LicensedListingsSpider(site=args.site, start_urls=args.start_url, link_css=args.link_css)
        except ValueError as error:
            parser.error(str(error))
    if args.limit < 0:
        parser.error("limit must not be negative")
    settings = get_project_settings()
    if args.offline:
        settings.set("HTTPCACHE_IGNORE_MISSING", True, priority="cmdline")
    if args.limit:
        settings.set("CLOSESPIDER_ITEMCOUNT", args.limit, priority="cmdline")
    process = CrawlerProcess(settings)
    crawler = process.create_crawler({"osm_places": OsmPlacesSpider, "osm_extract": OsmExtractSpider,
                                      "licensed_listings": LicensedListingsSpider}[args.spider])
    final = {}

    def closed(spider, reason):
        stats = crawler.stats.get_stats()
        for key in ("finish_reason", "item_scraped_count", "places/clean_count", "extract/downloaded_bytes", "httpcache/hit", "httpcache/miss", "places/osm_base_timestamp", "listings/clean_count", "listings/invalid_jsonld", "spider_exceptions/count"):
            if key in stats:
                final[key] = stats[key]
        final["finish_reason"] = reason
        Path("out").mkdir(exist_ok=True)
        Path(f"out/{args.spider}-stats.json").write_text(json.dumps(final, indent=2) + "\n")

    crawler.signals.connect(closed, signal=signals.spider_closed, weak=False)
    spider_args = {"site": args.site, "start_urls": args.start_url, "link_css": args.link_css} if args.spider == "licensed_listings" else {}
    process.crawl(crawler, **spider_args)
    process.start()
    count_key = {"osm_places": "places/clean_count", "osm_extract": "extract/downloaded_bytes",
                 "licensed_listings": "listings/clean_count"}[args.spider]
    minimum = args.min_items if args.spider == "licensed_listings" else 1
    success = (final.get("finish_reason") in {"finished", "closespider_itemcount"}
               and final.get(count_key, 0) >= minimum and not final.get("spider_exceptions/count", 0))
    if not success:
        raise SystemExit("No usable source data. Existing cleaned snapshots were not changed.")


if __name__ == "__main__":
    main()
