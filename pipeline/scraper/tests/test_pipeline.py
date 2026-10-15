import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from scrapy.http import TextResponse
from scrapy.exceptions import CloseSpider
from estate_scraper.clean import FIELDS, place
from estate_scraper.spiders.osm_places import OsmPlacesSpider
from export import clean_places, synthetic_rows, export_places

STAMP = "2026-10-16T06:00:00+07:00"


def element(**tags):
    return {"type": "way", "id": 123, "center": {"lat": 13.72345, "lon": 100.53156},
            "tags": {"name": "Test Apartment", "building": "apartments", **tags}}


class Cleaning(unittest.TestCase):
    def test_native_filters_keep_unnamed_nodes_for_way_locations(self):
        import osmium
        from extract_places import Places, candidate_filters
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "test.osm.pbf"
            with osmium.SimpleWriter(str(source)) as writer:
                for identifier, coordinates in enumerate([(100.5, 13.7), (100.504, 13.7),
                        (100.504, 13.704), (100.5, 13.704)], start=1):
                    writer.add_node(osmium.osm.mutable.Node(id=identifier, location=coordinates))
                writer.add_way(osmium.osm.mutable.Way(id=10, nodes=[1, 2, 3, 4, 1],
                    tags={"name": "Example Residence", "building": "apartments"}))
            handler = Places(STAMP)
            handler.apply_file(str(source), locations=True, filters=candidate_filters())
            self.assertEqual(list(handler.rows), ["way/10"])
            self.assertEqual((handler.rows["way/10"]["lat"], handler.rows["way/10"]["lng"]), (13.702, 100.502))

    def test_way_centroid_uses_area_not_bounding_box(self):
        from extract_places import centroid
        y, x = centroid([(0, 0), (0, 4), (1, 4), (1, 1), (4, 1), (4, 0), (0, 0)])
        self.assertAlmostEqual(y, 19 / 14)
        self.assertAlmostEqual(x, 19 / 14)
        self.assertEqual(centroid([(0, 0), (0, 4)]), (0, 2))
        self.assertEqual(centroid([(1, 2), (1, 2)]), (1, 2))

    def test_projects_only_whitelist_and_rounding(self):
        row = place(element(phone="private", description="discard", **{"contact:email": "discard"}), STAMP)
        self.assertEqual(set(row), FIELDS)
        self.assertEqual((row["lat"], row["lng"]), (13.723, 100.532))
        self.assertIsNone(row["district"])
        self.assertEqual(row["osm_id"], "way/123")
        self.assertEqual(place(element(**{"addr:district": "เขตสาทร"}), STAMP)["district"], "Sathorn")

    def test_contact_bearing_names_and_invalid_coordinates_are_dropped(self):
        for name in ["Contact +66 81 234 5678", "LINE ID: do-not-store", "agent@example.com"]:
            self.assertIsNone(place(element(name=name), STAMP))
        e = element(); e["center"]["lat"] = float("nan")
        self.assertIsNone(place(e, STAMP))
        e["center"]["lat"] = 1
        self.assertIsNone(place(e, STAMP))

    def test_stations_require_transit_evidence(self):
        e = element(building="no", railway="station", network="BTS")
        self.assertEqual(place(e, STAMP)["kind"], "station")
        self.assertEqual(place(element(building="no", railway="station", network="ARL"), STAMP)["kind"], "station")
        self.assertIsNone(place(element(building="no", railway="station", network="Unrelated railway"), STAMP))

    def test_strict_export_dedup_and_empty_guard(self):
        row = place(element(), STAMP)
        self.assertEqual(len(clean_places([row, row])), 1)
        with self.assertRaises(ValueError): clean_places([])
        with self.assertRaises(ValueError): clean_places([dict(row, phone="discard")])
        with self.assertRaises(ValueError): clean_places([row, dict(row, name="Conflicting name")])

    def test_failed_export_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "input.json", Path(directory) / "places.json"
            source.write_text("[]"); output.write_text("existing snapshot")
            with self.assertRaises(ValueError): export_places(source, output)
            self.assertEqual(output.read_text(), "existing snapshot")

    def test_overpass_partial_and_server_error_do_not_yield_data(self):
        spider = OsmPlacesSpider(); spider.crawler = Mock()
        for status, payload in [(500, {}), (200, {"remark": "timeout", "elements": []})]:
            response = TextResponse("https://example.com", body=json.dumps(payload).encode(), encoding="utf8", status=status)
            with self.assertRaises(CloseSpider): list(spider.parse(response))

    def test_extract_export_preserves_licence_and_dated_source(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "rows.json"
            meta = Path(directory) / "meta.json"
            output = Path(directory) / "places.json"
            source.write_text(json.dumps([place(element(), STAMP)]))
            meta.write_text(json.dumps({"endpoint": "https://download.geofabrik.de/asia/thailand-latest.osm.pbf",
                "resolved_url": "https://download.geofabrik.de/asia/thailand-261014.osm.pbf",
                "sha256": "a" * 64, "last_modified": "Thu, 15 Oct 2026 00:00:00 GMT"}))
            export_places(source, output, meta)
            data = json.loads(output.read_text())
            self.assertEqual(data["meta"]["attribution"], "© OpenStreetMap contributors, ODbL 1.0")
            self.assertEqual(data["meta"]["method"], "regional_extract_fallback")
            self.assertTrue(data["meta"]["extract_url"].endswith("thailand-261014.osm.pbf"))
            self.assertEqual(data["meta"]["extract_date"], "Thu, 15 Oct 2026 00:00:00 GMT")
            self.assertEqual(set(data["places"][0]), FIELDS)

    def test_synthetic_source_keeps_no_real_project_or_listing_date(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "sales.csv"
            source.write_text("id,district,size_sqm,price_thb,is_synthetic\n1,Sathorn,40,4000000,true\n")
            rows = synthetic_rows(source, {"Sathorn": {"lat": 13.708, "lng": 100.526}}, STAMP)
            row = rows[0]
            self.assertEqual(row["site"], "synthetic")
            self.assertIsNone(row["project"]); self.assertIsNone(row["listed_at"])
            self.assertEqual(row["geo_precision"], "district")
            self.assertEqual(row["price_per_sqm"], row["price_thb"] / row["area_sqm"])
            self.assertEqual(row["id"], synthetic_rows(source, {"Sathorn": {"lat": 13.708, "lng": 100.526}}, STAMP)[0]["id"])
            source.write_text(source.read_text().replace("true", "false"))
            with self.assertRaises(ValueError): synthetic_rows(source, {"Sathorn": {"lat": 13.708, "lng": 100.526}}, STAMP)


if __name__ == "__main__": unittest.main()
