import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

from scrapy.exceptions import CloseSpider
from scrapy.http import HtmlResponse

from estate_scraper.listings import LISTING_FIELDS, area_sqm, sale_listing
from estate_scraper.spiders.licensed_listings import LicensedListingsSpider

STAMP = "2026-10-16T00:00:00+00:00"
URL = "https://example.org/sale/unit-a"


def document():
    return {"@type": "RealEstateListing", "datePosted": "2026-10-15", "offers": {
        "@type": "Offer", "price": "4000000", "priceCurrency": "THB",
        "businessFunction": "http://purl.org/goodrelations/v1#Sell", "availability": "https://schema.org/InStock",
        "itemOffered": {"@type": "Apartment", "floorSize": {"value": 40, "unitCode": "MTK"},
            "address": {"addressLocality": "เขตสาทร", "addressRegion": "กรุงเทพมหานคร", "addressCountry": "TH"},
            "geo": {"latitude": 13.72345, "longitude": 100.53156}, "numberOfBedrooms": 1,
            "description": "discard", "seller": {"name": "discard", "email": "test@example.com"}}}}


class ListingProjection(unittest.TestCase):
    def test_scalar_sale_offer_projects_only_contract_fields(self):
        row = sale_listing(document(), URL, "fixture", STAMP)
        self.assertEqual(set(row), LISTING_FIELDS)
        self.assertEqual((row["district"], row["province"]), ("Sathorn", "Bangkok"))
        self.assertEqual((row["lat"], row["lng"]), (13.723, 100.532))
        self.assertEqual(row["price_per_sqm"], 100000)
        self.assertIsNone(row["project"])
        self.assertEqual(row["id"], sale_listing(document(), URL, "fixture", STAMP)["id"])

    def test_converts_only_explicit_area_units_and_rejects_ranges(self):
        self.assertEqual(area_sqm({"value": 1, "unitText": "rai"}), 1600)
        self.assertEqual(area_sqm({"value": 50, "unitText": "square wa"}), 200)
        for value in [{"value": "40-60", "unitCode": "MTK"}, {"minValue": 40, "maxValue": 60, "unitCode": "MTK"},
                      {"value": 40, "minValue": 40, "maxValue": 60, "unitCode": "MTK"},
                      {"value": True, "unitCode": "MTK"}, {"value": 40}, {"value": "NaN", "unitCode": "MTK"}]:
            self.assertIsNone(area_sqm(value))

    def test_rejects_rent_unknown_currency_aggregate_and_missing_facts(self):
        for key, value in [("businessFunction", "LeaseOut"), ("businessFunction", None), ("priceCurrency", "USD"),
                           ("availability", "SoldOut"), ("price", 0), ("price", "1.5M"), ("price", 10 ** 1000), ("@type", "AggregateOffer")]:
            data = document(); data["offers"][key] = value
            self.assertIsNone(sale_listing(data, URL, "fixture", STAMP))
        data = document(); del data["offers"]["itemOffered"]["floorSize"]
        self.assertIsNone(sale_listing(data, URL, "fixture", STAMP))

    def test_missing_coordinates_and_invalid_optional_facts_stay_null(self):
        data = document(); item = data["offers"]["itemOffered"]
        item["geo"] = {"latitude": "NaN", "longitude": 100}
        item["numberOfBedrooms"] = -1
        data["datePosted"] = "2026-02-31"
        row = sale_listing(data, URL, "fixture", STAMP)
        for key in ("lat", "lng", "bedrooms", "listed_at"):
            self.assertIsNone(row[key])
        self.assertEqual(row["geo_precision"], "none")

    def test_rejects_contacts_in_location_or_source_url_and_non_thai_addresses(self):
        for url in [URL + "?email=test@example.com", "https://test@example.org/unit", URL + "#contact", "http://example.org/unit"]:
            self.assertIsNone(sale_listing(document(), url, "fixture", STAMP))
        for key, value in [("addressLocality", "LINE ID: sample"), ("addressCountry", "US"), ("addressRegion", "Unknown")]:
            data = document(); data["offers"]["itemOffered"]["address"][key] = value
            self.assertIsNone(sale_listing(data, URL, "fixture", STAMP))

    def test_unexpected_json_shapes_are_skipped(self):
        for key in ("businessFunction", "availability", "price"):
            data = document(); data["offers"][key] = {"unexpected": "shape"}
            self.assertIsNone(sale_listing(data, URL, "fixture", STAMP))
        data = document(); data["offers"]["itemOffered"]["@type"] = ["Apartment", "Place"]
        self.assertIsNone(sale_listing(data, URL, "fixture", STAMP))


class LicensedSpider(unittest.TestCase):
    def authorized_test_spider(self, **kwargs):
        # Mock permission ONLY for local unit tests; no permission file is created.
        with patch.object(Path, "is_file", return_value=True), patch.object(Path, "is_symlink", return_value=False), \
                patch.object(Path, "read_text", return_value="TEST ONLY: mocked source permission"):
            return LicensedListingsSpider(site="fixture", start_urls=[URL], **kwargs)

    def test_no_permission_record_fails_before_any_request(self):
        with self.assertRaisesRegex(ValueError, "written permission"):
            LicensedListingsSpider(site="test-no-permission", start_urls=[URL])

    def test_off_limits_sources_stay_blocked_even_with_mocked_permission(self):
        with patch.object(Path, "is_file", return_value=True), patch.object(Path, "is_symlink", return_value=False), \
                patch.object(Path, "read_text", return_value="TEST ONLY"):
            for domain in ["www.ddproperty.com", "hipflat.co.th", "www.fazwaz.com", "livinginsider.com"]:
                with self.assertRaisesRegex(ValueError, "off-limits"):
                    LicensedListingsSpider(site="fixture", start_urls=["https://" + domain + "/sale"])

    def test_parse_graph_dedupes_and_cache_replay_preserves_collection_time(self):
        with tempfile.TemporaryDirectory() as directory:
            spider = self.authorized_test_spider(link_css="a::attr(href)")
            spider.crawler = Mock()
            spider.crawler.settings.getint.return_value = 0
            spider.collection_path = Path(directory) / "collection.json"
            content = json.dumps({"@graph": [document(), copy.deepcopy(document())]})
            response = HtmlResponse(URL, body=('<script type="application/ld+json">' + content + '</script>'
                '<a href="/sale/unit-b">next</a><a href="https://other.example/unit">offsite</a>').encode(), encoding="utf8")
            items = list(spider.parse(response))
            self.assertEqual(len([item for item in items if isinstance(item, dict)]), 1)
            self.assertEqual([item.url for item in items if not isinstance(item, dict)], ["https://example.org/sale/unit-b"])
            stamp = items[0]["scraped_at"]
            spider.seen.clear()
            self.assertEqual(list(spider.parse(response))[0]["scraped_at"], stamp)

    def test_challenge_stops_instead_of_emitting_items_or_following_links(self):
        spider = self.authorized_test_spider()
        response = HtmlResponse(URL, body=b"Verify you are human", encoding="utf8")
        with self.assertRaises(CloseSpider) as caught:
            list(spider.parse(response))
        self.assertEqual(caught.exception.reason, "source_challenge_stop")


if __name__ == "__main__":
    unittest.main()
