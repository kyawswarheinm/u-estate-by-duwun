"""Project the public, contributor-metadata-free PBF to the same facts-only place rows."""
import argparse
import json
from pathlib import Path
import osmium
from estate_scraper.clean import place
from export import write_json


def centroid(points):
    """Polygon area centroid; line-length centroid for open/degenerate ways."""
    import math
    if len(points) >= 4 and points[0] == points[-1]:
        # Translate first to avoid cancellation in small polygons at large longitude.
        origin_y, origin_x = points[0]
        local = [(x - origin_x, y - origin_y) for y, x in points]
        cross = [a[0] * b[1] - b[0] * a[1] for a, b in zip(local, local[1:])]
        area2 = sum(cross)
        if abs(area2) > 1e-15:
            x = sum((a[0] + b[0]) * c for a, b, c in zip(local, local[1:], cross)) / (3 * area2)
            y = sum((a[1] + b[1]) * c for a, b, c in zip(local, local[1:], cross)) / (3 * area2)
            return y + origin_y, x + origin_x
    segments = [(a, b, math.hypot(b[0] - a[0], b[1] - a[1])) for a, b in zip(points, points[1:])]
    length = sum(segment[2] for segment in segments)
    if length:
        return tuple(sum((a[i] + b[i]) / 2 * weight for a, b, weight in segments) / length for i in (0, 1))
    return points[0]


def candidate_filters():
    return [osmium.filter.KeyFilter("name", "name:en"),
            osmium.filter.TagFilter(("building", "apartments"), ("building", "residential"),
                                   ("landuse", "residential"), ("railway", "station"),
                                   ("public_transport", "station"))]


class Places(osmium.SimpleHandler):
    def __init__(self, fetched_at):
        super().__init__()
        self.fetched_at = fetched_at
        self.rows = {}

    def node(self, node):
        if not (node.tags.get("name") or node.tags.get("name:en")):
            return
        if node.location.valid():
            self.add("node", node.id, dict(node.tags), node.location.lat, node.location.lon)

    def way(self, way):
        tags = dict(way.tags)
        if not (tags.get("name") or tags.get("name:en")) or not (tags.get("building") in {"apartments", "residential"}
                or tags.get("landuse") == "residential" or tags.get("railway") == "station"
                or tags.get("public_transport") == "station"):
            return
        if not way.nodes or any(not node.location.valid() for node in way.nodes):
            return
        lat, lng = centroid([(node.location.lat, node.location.lon) for node in way.nodes])
        self.add("way", way.id, tags, lat, lng)

    def add(self, kind, identifier, tags, lat, lng):
        row = place({"type": kind, "id": identifier, "tags": tags, "lat": lat, "lon": lng}, self.fetched_at)
        if row:
            self.rows[row["osm_id"]] = row


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default="raw/thailand.osm.pbf")
    parser.add_argument("--meta", default="out/extract-meta.json")
    parser.add_argument("--output", default="out/places.json")
    args = parser.parse_args()
    meta = json.loads(Path(args.meta).read_text())
    import hashlib
    if hashlib.sha256(Path(args.input).read_bytes()).hexdigest() != meta["sha256"]:
        raise ValueError("Extract checksum differs from the downloaded source")
    handler = Places(meta["fetched_at"])
    # Location indexing runs before these native filters, so unnamed geometry
    # nodes still supply coordinates while Python sees only candidate features.
    handler.apply_file(args.input, locations=True, idx="flex_mem", filters=candidate_filters())
    if not handler.rows:
        raise ValueError("No matching places; refusing empty export")
    write_json(args.output, sorted(handler.rows.values(), key=lambda row: row["osm_id"]))
    print(f"Extracted {len(handler.rows)} real OSM places; nodes/ways only, not Overpass")


if __name__ == "__main__":
    main()
