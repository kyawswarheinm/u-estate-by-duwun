import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from estate_scraper.market_export import clean_listings
from estate_scraper.listings import LISTING_FIELDS
from export import export_listings, validate_listing_sources


def row(index=1, **changes):
    # All data in this test module are GENERATED fixtures, never real listings.
    return {"id": "replace-this", "site": "test-fixture", "source_url": f"https://example.org/unit-{index}",
            "kind": "sale", "type": "condo", "project": None, "district": "Sathorn", "province": "Bangkok",
            "lat": 13.72345, "lng": 100.53156, "geo_precision": "exact", "price_thb": 4_000_000,
            "area_sqm": 40, "price_per_sqm": -1, "bedrooms": 1, "listed_at": None,
            "scraped_at": "2026-10-16T06:00:00+07:00", **changes}


class MarketCleaning(unittest.TestCase):
    def test_normalises_aliases_units_ids_and_recomputes_stale_unit_price(self):
        raw = row(type="single-family house", kind="for sale", district=" khet sathon ", province="กรุงเทพมหานคร",
                  area_sqm={"value": 1, "unitText": "rai"})
        cleaned, report = clean_listings([raw])
        item = cleaned[0]
        self.assertEqual(set(item), LISTING_FIELDS)
        self.assertEqual((item["type"], item["kind"], item["district"], item["province"]), ("house", "sale", "Sathorn", "Bangkok"))
        self.assertEqual(item["area_sqm"], 1600)
        self.assertEqual(item["price_per_sqm"], 2500)
        self.assertEqual((item["lat"], item["lng"]), (13.723, 100.532))
        self.assertEqual(item["id"], "ext-test-fixture-" + hashlib.sha1(raw["source_url"].encode()).hexdigest()[:10])
        self.assertEqual(report["retained"], 1)
        self.assertEqual(clean_listings([row(listed_at="20261015")])[0][0]["listed_at"], "2026-10-15")
        self.assertIsNone(clean_listings([row(bedrooms=1e100)])[0][0]["bedrooms"])
        self.assertEqual(clean_listings([row(area_sqm={"value": 50, "unitText": "square wa"})])[0][0]["area_sqm"], 200)

    def test_drops_no_price_area_ranges_invalid_types_and_unmapped_thai_districts(self):
        rows = [row(1, price_thb=None), row(2, area_sqm=0), row(3, price_thb=True),
                row(4, area_sqm={"value": "40-60", "unitCode": "MTK"}), row(5, type="unknown"),
                row(6, district="เขตชื่อที่ยังไม่จับคู่")]
        cleaned, report = clean_listings(rows)
        self.assertEqual(cleaned, [])
        self.assertEqual(report["missing_price_or_area"], 4)
        self.assertEqual(report["invalid_location_or_type"], 1)
        self.assertEqual(report["unmapped_district"], 1)

    def test_private_or_extra_fields_abort_even_on_rows_with_missing_prices(self):
        for raw in [dict(row(), description="discard"), row(project="LINE ID: sample", price_thb=None),
                    row(district="test@example.com"), row(project="test＠example.com")]:
            with self.assertRaises(ValueError):
                clean_listings([raw])

    def test_dedupes_known_projects_without_collapsing_unknown_projects_or_other_markets(self):
        raw = [row(1, project="Example Residence"), row(2, project=" example  residence "),
               row(3), row(4), row(5, project="Example Residence", district="Bang Na"),
               row(6, project="Example Residence", kind="rent")]
        cleaned, report = clean_listings(raw)
        self.assertEqual(len(cleaned), 5)
        self.assertEqual(report["duplicates"], 1)
        self.assertEqual(cleaned, clean_listings(list(reversed(raw)))[0])

    def test_duplicate_url_uses_latest_collection_and_equal_time_conflicts_abort(self):
        old = row(price_thb=3_000_000, scraped_at="2026-10-15T23:00:00+00:00")
        new = row(price_thb=4_000_000, scraped_at="2026-10-16T06:30:00+07:00")
        self.assertEqual(clean_listings([new, old])[0][0]["price_thb"], 4_000_000)
        aliases = [row(site="provider-b"), row(site="provider-a", scraped_at="2026-10-15T23:00:00+00:00")]
        self.assertEqual(clean_listings(aliases)[0][0]["site"], "provider-a")
        self.assertEqual(clean_listings(aliases)[0], clean_listings(list(reversed(aliases)))[0])
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            clean_listings([row(), row(price_thb=5_000_000)])

    def test_exact_percentiles_are_per_type_and_kind_and_keep_boundary_ties(self):
        raw = [row(i, price_thb=i * 40) for i in range(1, 102)]
        raw += [row(200, type="house", price_thb=40_000_000), row(201, kind="rent", price_thb=20_000)]
        cleaned, report = clean_listings(raw)
        sale_condos = [item for item in cleaned if item["type"] == "condo" and item["kind"] == "sale"]
        self.assertEqual((min(item["price_per_sqm"] for item in sale_condos), max(item["price_per_sqm"] for item in sale_condos)), (2, 100))
        self.assertEqual(report["outliers"], 2)
        self.assertEqual(len(cleaned), 101)
        self.assertEqual(sum(report[key] for key in ("retained", "duplicates", "outliers", "missing_price_or_area", "invalid_location_or_type", "unmapped_district")), len(raw))

    def test_small_distinct_cohort_can_be_empty_and_missing_coordinates_are_not_invented(self):
        self.assertEqual(clean_listings([row(1, price_thb=100), row(2, price_thb=200)])[0], [])
        item = clean_listings([row(lat=None, geo_precision="exact", bedrooms=-1, listed_at="not a date")])[0][0]
        self.assertEqual((item["lat"], item["lng"], item["geo_precision"], item["bedrooms"], item["listed_at"]), (None, None, "none", None, None))

    def test_rejects_unsafe_urls_and_unzoned_collection_times(self):
        for raw in [row(source_url="https://example.org/unit?email=test@example.com"),
                    row(scraped_at="2026-10-16T06:00:00")]:
            with self.assertRaises(ValueError):
                clean_listings([raw])


class MarketExport(unittest.TestCase):
    def test_fixture_sources_and_reserved_domains_cannot_be_marked_scrape(self):
        for site in [{"name": "test-fixture", "url": "https://example.org", "robots_checked_at": "2026-10-16"},
                     {"name": "provider", "url": "https://provider.example.org", "robots_checked_at": "2026-10-16"}]:
            with self.assertRaises(ValueError):
                validate_listing_sources([site])

    def test_audit_dates_require_the_frozen_contract_format(self):
        for value in ["20261016", None, 20261016]:
            with self.assertRaisesRegex(ValueError, "YYYY-MM-DD"):
                validate_listing_sources([{"name": "provider", "url": "https://example.org", "robots_checked_at": value}])

    def test_full_export_metadata_and_failure_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, audit, output, report = [root / name for name in ("raw.json", "sites.json", "clean.json", "report.json")]
            source.write_text(json.dumps([row(i) for i in range(1, 4)]))
            sites = [{"name": "test-fixture", "url": "https://example.org", "robots_checked_at": "2026-10-16"}]
            audit.write_text(json.dumps(sites))
            # Tests mock authorization only; no real permission file is written.
            with patch("export.validate_listing_sources", return_value={"test-fixture": sites[0]}):
                count = export_listings(source, audit, output, min_items=3, report_path=report)
                payload = json.loads(output.read_text())
                self.assertEqual(count, 3)
                self.assertEqual(set(payload["meta"]), {"source", "is_sample", "sites", "scraped_at", "note"})
                self.assertEqual(payload["meta"]["source"], "scrape")
                self.assertFalse(payload["meta"]["is_sample"])
                self.assertEqual(payload["meta"]["scraped_at"], row()["scraped_at"])
                self.assertEqual(payload["meta"]["sites"], sites)
                before = output.read_bytes()
                with self.assertRaisesRegex(ValueError, "required"):
                    export_listings(source, audit, output, min_items=4, report_path=report)
                self.assertEqual(before, output.read_bytes())
                source.write_text(json.dumps([row(1, price_thb=100), row(2, price_thb=200)]))
                with self.assertRaisesRegex(ValueError, "Only 0 clean"):
                    export_listings(source, audit, output, min_items=1, report_path=report)
                self.assertEqual(before, output.read_bytes())
                contaminated = [row(), dict(row(2), phone="discard")]
                source.write_text(json.dumps(contaminated))
                with self.assertRaises(ValueError):
                    export_listings(source, audit, output, min_items=1, report_path=report)
                self.assertEqual(before, output.read_bytes())

    def test_rejects_wrong_host_missing_provenance_and_fixture_envelopes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, audit, output, report = [root / name for name in ("raw.json", "sites.json", "clean.json", "report.json")]
            site = {"name": "test-fixture", "url": "https://example.org", "robots_checked_at": "2026-10-16"}
            audit.write_text(json.dumps([site]))
            output.write_text("existing snapshot")
            cases = [[row(source_url="https://other.example/unit")], [row(site="unknown")],
                     {"meta": {"source": "fixture"}, "listings": [row()]}]
            with patch("export.validate_listing_sources", return_value={"test-fixture": site}):
                for raw in cases:
                    source.write_text(json.dumps(raw))
                    with self.assertRaises(ValueError):
                        export_listings(source, audit, output, min_items=1, report_path=report)
                    self.assertEqual(output.read_text(), "existing snapshot")
                source.write_text(json.dumps([row()]))
                with self.assertRaisesRegex(ValueError, "different paths"):
                    export_listings(source, audit, source, min_items=1, report_path=report)


if __name__ == "__main__":
    unittest.main()
