"""Generated coordinate fixtures only; all HTTP responses are in memory."""
from collections import Counter

from estate_scraper.geocoding import resolve_coordinates
from estate_scraper.market_export import clean_listings
from export import write_json
from tests.test_geocoding import CENTRES, Clock, Transport, client
from tests.test_market_export import row


def main():
    from pathlib import Path
    output = Path("out/tests")
    output.mkdir(parents=True, exist_ok=True)
    raw = [row(1, site="provider"),
           row(2, site="provider", project="Example Residence", lat=None, lng=None, geo_precision="none"),
           row(3, site="provider", lat=None, lng=None, geo_precision="none"),
           row(4, site="provider", district="Bang Na", lat=None, lng=None, geo_precision="none"),
           row(5, site="provider", district="Unknown", lat=None, lng=None, geo_precision="none")]
    rows, _ = clean_listings(raw)
    clock = Clock(); transport = Transport(clock)
    with client(output / "geocoding-test-cache", clock, transport) as service:
        rows, report = resolve_coordinates(rows, CENTRES, service)
    assert report["coverage"] == .8
    assert Counter(item["geo_precision"] for item in rows) == {"exact": 1, "project": 1, "district": 2, "none": 1}
    write_json(output / "geocoded-fixture.json", {"meta": {
        "source": "fixture", "is_sample": True,
        "sites": [{"name": "provider", "url": "https://example.org", "robots_checked_at": "2026-10-16"}],
        "scraped_at": rows[0]["scraped_at"],
        "note": "GENERATED TEST FIXTURES ONLY. Geocoder HTTP responses are mocked; no live project query or real price data. robots_checked_at is a fixture date, not a live source audit."}, "listings": rows})
    write_json(output / "geocoding-fixture-report.json", report)
    print("PASS: GENERATED FIXTURES, 4/5 located (80%); exact/project/district/none labels; no live network")


if __name__ == "__main__":
    main()
