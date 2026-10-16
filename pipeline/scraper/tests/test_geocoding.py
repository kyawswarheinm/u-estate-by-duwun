import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from estate_scraper.geocoding import NominatimClient, matched_point, resolve_coordinates
from export import export_listings
from tests.test_market_export import row
from tests.test_listings import document, STAMP, URL
from estate_scraper.listings import sale_listing

CENTRES = Path(__file__).resolve().parents[1] / "district-centres.json"


def result(name="Example Residence", **changes):
    return {"name": name, "lat": "13.72345", "lon": "100.53156", "category": "building",
            "address": {"country_code": "th", "city_district": "Sathon District", "state": "Bangkok"},
            "description": "discard", "email": "test@example.com", **changes}


class Clock:
    def __init__(self): self.value = 1000
    def now(self): return self.value
    def sleep(self, seconds): self.value += seconds


class Transport:
    def __init__(self, clock, *, robots="User-agent: *\nAllow: /", status=200, matches=True):
        self.clock, self.robots, self.status, self.matches = clock, robots, status, matches
        self.calls = []

    def __call__(self, url, headers):
        self.calls.append((url, self.clock.now(), headers))
        if url.endswith("/robots.txt"):
            return 200, self.robots
        query = parse_qs(urlsplit(url).query)
        name = query["q"][0].split(",")[0]
        return self.status, json.dumps([result(name)] if self.matches else [])


def client(directory, clock, transport, **options):
    return NominatimClient(directory, endpoint="https://geocoder.example/search", online=True,
        contact_url="https://example.org/contact", transport=transport, clock=clock.now,
        sleep=clock.sleep, wall_clock=clock.now, **options)


class Geocoding(unittest.TestCase):
    def test_matching_requires_named_project_country_district_province_and_unambiguous_point(self):
        self.assertEqual(matched_point([result()], "Example Residence", "Sathorn", "Bangkok"), {"lat": 13.723, "lng": 100.532})
        for candidate in [result(name="Unrelated"), result(category="boundary"), result(lat="NaN"),
                          result(address={"country_code": "us"}),
                          result(address={"country_code": "th", "city_district": "Bang Na", "state": "Bangkok"}),
                          result(address={"country_code": "th", "city_district": "Sathon District", "state": "Nonthaburi"})]:
            self.assertIsNone(matched_point([candidate], "Example Residence", "Sathorn", "Bangkok"))
        self.assertIsNone(matched_point([result(), result(lat="13.8")], "Example Residence", "Sathorn", "Bangkok"))

    def test_public_thai_name_aliases_match_without_dropping_meaningful_marks(self):
        candidate = result(name="English Residence", namedetails={"name:th": "โครงการตัวอย่าง"})
        self.assertIsNotNone(matched_point([candidate], "โครงการตัวอย่าง", "Sathorn", "Bangkok"))
        self.assertIsNone(matched_point([candidate], "โครงการตัวอยาง", "Sathorn", "Bangkok"))

    def test_rate_limit_persistent_cache_and_projection_without_raw_personal_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = Clock(); transport = Transport(clock)
            with client(directory, clock, transport) as service:
                first = service.lookup("Example Residence", "Sathorn", "Bangkok")
                self.assertEqual(first, service.lookup("Example Residence", "Sathorn", "Bangkok"))
                service.lookup("Other Residence", "Sathorn", "Bangkok")
                self.assertEqual(service.stats["cache_hits"], 1)
                self.assertEqual(service.stats["lookups"], 2)
                self.assertEqual(service.stats["network_requests"], 3)
            for a, b in zip(transport.calls, transport.calls[1:]):
                self.assertGreaterEqual(b[1] - a[1], 2)
            self.assertIn("U-Estate", transport.calls[0][2]["User-Agent"])
            self.assertIn("https://example.org/contact", transport.calls[0][2]["User-Agent"])
            for path in Path(directory).glob("*.json"):
                cached = json.loads(path.read_text())
                self.assertEqual(set(cached), {"query", "endpoint", "result", "fetched_at"})
                self.assertNotIn("test@example.com", path.read_text())
            with NominatimClient(directory, endpoint="https://geocoder.example/search", transport=lambda *_: self.fail("offline network")) as offline:
                self.assertEqual(offline.lookup("Example Residence", "Sathorn", "Bangkok"), first)
            previous_time = transport.calls[-1][1]
            with client(directory, clock, transport) as service:
                service.lookup("Third Residence", "Sathorn", "Bangkok")
            self.assertGreaterEqual(transport.calls[-2][1] - previous_time, 2)

    def test_robots_denial_never_sends_search_and_service_failure_does_not_retry(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = Clock(); transport = Transport(clock, robots="\ufeffUser-agent: *\nAllow: /\nDisallow: /search")
            with client(directory, clock, transport) as service:
                self.assertIsNone(service.lookup("Example Residence", "Sathorn", "Bangkok"))
                self.assertIsNone(service.lookup("Other Residence", "Sathorn", "Bangkok"))
                self.assertEqual(service.stats["robots_denied"], 1)
            self.assertEqual(len(transport.calls), 1)
            self.assertTrue(transport.calls[0][0].endswith("robots.txt"))
        with tempfile.TemporaryDirectory() as directory:
            clock = Clock(); transport = Transport(clock, status=429)
            with client(directory, clock, transport) as service:
                service.lookup("Example Residence", "Sathorn", "Bangkok")
                service.lookup("Other Residence", "Sathorn", "Bangkok")
                self.assertEqual(service.stats["service_errors"], 1)
            self.assertEqual(len(transport.calls), 2)

    def test_empty_results_are_cached_and_budget_and_contact_are_enforced(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = Clock(); transport = Transport(clock, matches=False)
            with client(directory, clock, transport, max_lookups=1) as service:
                self.assertIsNone(service.lookup("Example Residence", "Sathorn", "Bangkok"))
                self.assertIsNone(service.lookup("Example Residence", "Sathorn", "Bangkok"))
                self.assertIsNone(service.lookup("Other Residence", "Sathorn", "Bangkok"))
                self.assertEqual(service.stats["budget_exhausted"], 1)
            self.assertEqual(len(transport.calls), 2)
            with self.assertRaisesRegex(ValueError, "contact"):
                NominatimClient(directory, online=True)
            with self.assertRaisesRegex(ValueError, "off-limits"):
                NominatimClient(directory, endpoint="https://www.ddproperty.com/search")

    def test_only_one_online_batch_can_own_the_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = Clock(); transport = Transport(clock)
            with client(directory, clock, transport):
                with self.assertRaisesRegex(ValueError, "Another"):
                    with client(directory, clock, transport): pass

    def test_fallback_order_rounding_unknown_district_and_synthetic_skip(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = Clock(); transport = Transport(clock)
            rows = [row(1, site="provider"),
                    row(2, site="provider", project="Example Residence", lat=None, lng=None, geo_precision="none"),
                    row(3, site="provider", lat=None, lng=None, geo_precision="none"),
                    row(4, site="provider", province="Nonthaburi", lat=None, lng=None, geo_precision="none"),
                    row(5, site="synthetic", project="Never Query This", lat=None, lng=None, geo_precision="none")]
            before = json.dumps(rows)
            with client(directory, clock, transport) as service:
                resolved, report = resolve_coordinates(rows, CENTRES, service)
            self.assertEqual([item["geo_precision"] for item in resolved], ["exact", "project", "district", "none", "none"])
            self.assertEqual((resolved[0]["lat"], resolved[0]["lng"]), (13.723, 100.532))
            self.assertEqual((resolved[2]["lat"], resolved[2]["lng"]), (13.708, 100.526))
            self.assertEqual(report["coverage"], .6)
            self.assertEqual(report["sample_skipped"], 1)
            self.assertEqual(service.stats["lookups"], 1)
            self.assertEqual(json.dumps(rows), before)

    def test_rejects_contact_queries_and_cache_corruption_without_network(self):
        with tempfile.TemporaryDirectory() as directory:
            clock = Clock(); transport = Transport(clock)
            with client(directory, clock, transport) as service:
                with self.assertRaisesRegex(ValueError, "Contact"):
                    service.lookup("LINE ID: sample", "Sathorn", "Bangkok")
                self.assertEqual(transport.calls, [])
                service.lookup("Example Residence", "Sathorn", "Bangkok")
            cache = next(Path(directory).glob("*.json"))
            cache.write_text("[]")
            with NominatimClient(directory, endpoint="https://geocoder.example/search") as offline:
                with self.assertRaisesRegex(ValueError, "cache record"):
                    offline.lookup("Example Residence", "Sathorn", "Bangkok")

    def test_jsonld_parent_project_is_explicit_and_contact_names_are_not_retained(self):
        data = document()
        data["offers"]["itemOffered"]["containedInPlace"] = {"@type": "ApartmentComplex", "name": "Example Residence"}
        self.assertEqual(sale_listing(data, URL, "fixture", STAMP)["project"], "Example Residence")
        for name in ["LINE ID: sample", "test＠example.com"]:
            data["offers"]["itemOffered"]["containedInPlace"]["name"] = name
            self.assertIsNone(sale_listing(data, URL, "fixture", STAMP)["project"])

    def test_export_coverage_gate_and_attributed_offline_district_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source, audit, output, report = [root / name for name in ("raw.json", "sites.json", "clean.json", "report.json")]
            site = {"name": "provider", "url": "https://example.org", "robots_checked_at": "2026-10-16"}
            audit.write_text(json.dumps([site]))
            source.write_text(json.dumps([row(site="provider", lat=None, lng=None, geo_precision="none")]))
            with patch("export.validate_listing_sources", return_value={"provider": site}):
                export_listings(source, audit, output, 1, report, geocode_cache=root / "cache")
                data = json.loads(output.read_text())
                self.assertEqual(data["listings"][0]["geo_precision"], "district")
                self.assertIn("CC-BY-SA-4.0", data["meta"]["note"])
                self.assertEqual(json.loads(report.read_text())["geocoding"]["coverage"], 1)
                before = output.read_bytes()
                boundary_rows = [row(i, site="provider", district="Sathorn" if i < 4 else "Unknown", lat=None, lng=None, geo_precision="none") for i in range(5)]
                source.write_text(json.dumps(boundary_rows))
                export_listings(source, audit, output, 1, report, geocode_cache=root / "cache")
                self.assertEqual(json.loads(report.read_text())["geocoding"]["coverage"], .8)
                before = output.read_bytes()
                source.write_text(json.dumps([row(site="provider", district="Unknown", lat=None, lng=None, geo_precision="none")]))
                with self.assertRaisesRegex(ValueError, "Coordinate coverage"):
                    export_listings(source, audit, output, 1, report, geocode_cache=root / "cache")
                self.assertEqual(output.read_bytes(), before)


if __name__ == "__main__": unittest.main()
