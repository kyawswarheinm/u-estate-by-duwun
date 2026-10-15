"""P2T04: descriptive market statistics from the listings snapshot.

    python pipeline/analytics/describe.py                                   # src/data/market/listings.json
    python pipeline/analytics/describe.py --listings pipeline/analytics/out/listings-p1.json --out pipeline/analytics/out/stats-p1.json
    python pipeline/analytics/describe.py --min-count 1                     # the 10-row fixture (default 5 drops it all)

Writes src/data/market/stats.json (contract: src/lib/market-data/types.ts StatsFile): per district x type x kind
plus "ALL" districts — count, median / p25 / p75 asking price per m2, median price, median area.
These are ASKING prices on listing websites, not sale prices. A fixture input stays labelled SAMPLE.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
ICT = timezone(timedelta(hours=7))


def describe(df: pd.DataFrame, min_count: int) -> list[dict]:
    rows = []
    for district_col in ("district", None):
        keys = ["district", "type", "kind"] if district_col else ["type", "kind"]
        for key, g in df.groupby(keys, sort=True):
            if len(g) < min_count:
                continue
            district, typ, kind = key if district_col else ("ALL", *key)
            pps = g["price_per_sqm"]
            rows.append({
                "district": district, "type": typ, "kind": kind, "count": int(len(g)),
                "median_price_per_sqm": round(float(pps.median())),
                "p25_price_per_sqm": round(float(pps.quantile(0.25))),
                "p75_price_per_sqm": round(float(pps.quantile(0.75))),
                "median_price_thb": round(float(g["price_thb"].median())),
                "median_area_sqm": round(float(g["area_sqm"].median()), 1),
            })
    return sorted(rows, key=lambda r: (r["type"], r["kind"], r["district"] == "ALL", r["district"]))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--listings", type=Path, default=REPO / "src" / "data" / "market" / "listings.json")
    ap.add_argument("--out", type=Path, default=REPO / "src" / "data" / "market" / "stats.json")
    ap.add_argument("--min-count", type=int, default=5)
    a = ap.parse_args()

    snap = json.loads(a.listings.read_text(encoding="utf-8"))
    meta = snap["meta"]
    df = pd.DataFrame(snap["listings"])
    if df.empty:
        raise SystemExit("No listings in the snapshot.")
    rows = describe(df, a.min_count)
    if not rows:
        raise SystemExit(f"No group has {a.min_count}+ listings. Lower --min-count only for the fixture.")
    is_fixture = meta.get("source") == "fixture"
    sites = ", ".join(s["name"] for s in meta.get("sites", []))
    doc = {
        "meta": {
            "source": "fixture" if is_fixture else "analysis",
            "is_sample": bool(meta.get("is_sample", True)) or is_fixture,
            "based_on": f"listings.json ({meta.get('source')}) scraped_at {meta.get('scraped_at')}, {len(df)} listings from {sites}"
                        + (f". Input note: {meta.get('note', '').split('. ')[0]}" if is_fixture else ""),
            "generated_at": datetime.now(ICT).isoformat(timespec="minutes"),
            "method": f"Median and quartiles (linear interpolation) of price per m2 by district, type and kind, plus all districts together; "
                      f"groups with fewer than {a.min_count} listings are left out. "
                      + ("Input is SAMPLE/SYNTHETIC demo data, not real listings or market prices." if is_fixture
                         else "Asking prices on listing websites, not sale prices."),
            "min_count": a.min_count,
        },
        "by_area": rows,
    }
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    shown = pd.DataFrame(rows)
    print(f"{len(df)} listings → {len(rows)} groups (min_count {a.min_count}) → {a.out}")
    print(shown[["district", "type", "kind", "count", "p25_price_per_sqm", "median_price_per_sqm", "p75_price_per_sqm"]].to_string(index=False))
    # For the scam rule calibration notes (not part of the contract): share priced 20%+ below the district median.
    med = df.groupby(["district", "type", "kind"])["price_per_sqm"].transform("median")
    print(f"Listings priced 20%+ below their district median: {(df.price_per_sqm < 0.8 * med).mean() * 100:.1f}%")


if __name__ == "__main__":
    main()
