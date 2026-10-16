"""P2T01: download the Bank of Thailand Residential Property Price Index (table EC_EI_008_S4) and keep
the three Bangkok-and-vicinity series the forecast needs.

    python pipeline/analytics/fetch_bot.py

Writes:
  pipeline/analytics/raw/EC_EI_008_S4.csv   the file exactly as BOT serves it (git-ignored)
  pipeline/analytics/data/bot_rppi.csv      period,series_key,value (monthly, ascending)
  pipeline/analytics/data/SOURCE.md         where the numbers came from, filled from the download itself

Public statistics page, one session, three requests (open page, submit the date range, export CSV).
"""
from __future__ import annotations

import csv
import html
import http.cookiejar
import io
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

URL = "https://app.bot.or.th/BTWS_STAT/statistics/BOTWEBSTAT.aspx?reportID=993&language=ENG"
TABLE = "EC_EI_008_S4"
UA = "U-Estate hackathon demo (team Duwun, P2 analytics); public statistics download"
HERE = Path(__file__).resolve().parent
RAW = HERE / "raw" / f"{TABLE}.csv"
OUT = HERE / "data" / "bot_rppi.csv"
SOURCE = HERE / "data" / "SOURCE.md"
ICT = timezone(timedelta(hours=7))

# Section heading in the BOT table → our series key. Each section has a "Bangkok and vicinities" row.
SECTIONS = {
    "single-detached house price index": "house_bkk",
    "town house price index": "townhouse_bkk",
    "condominium price index": "condo_bkk",
}
MONTHS = {m: i for i, m in enumerate(["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"], 1)}

opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(data: dict | None = None) -> tuple[str, bytes]:
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(URL, data=body, headers={"User-Agent": UA, "Referer": URL})
    with opener.open(req, timeout=90) as r:
        return r.headers.get("Content-Type", ""), r.read()


def form_state(page: str) -> dict:
    state = {m.group(1): html.unescape(m.group(2)) for m in re.finditer(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', page)}
    if "__VIEWSTATE" not in state:
        sys.exit("BOT page changed: no form state found. Download the CSV by hand (see SOURCE.md).")
    return state


def main() -> None:
    _, first = request()
    page = first.decode("utf-8", "replace")
    # BOT rejects a range past its latest month ("Selected period is invalid within period scope"),
    # so read the available scope, e.g. "( JAN 2011 - AUG 2026 )", and ask for exactly that.
    scope = re.search(r"\(\s*([A-Z]{3}) (\d{4}) - ([A-Z]{3}) (\d{4})\s*\)", html.unescape(re.sub(r"<[^>]+>", " ", page)))
    if not scope:
        sys.exit("BOT page changed: no period scope found.")
    m1, y1, m2, y2 = scope.groups()
    rng = {"drpPeriod": "MTH", "drpFromMonth": f"xxxx{MONTHS[m1]:02d}xx", "drpFromYear": f"{y1}xxxx", "drpToMonth": f"xxxx{MONTHS[m2]:02d}xx", "drpToYear": f"{y2}xxxx"}

    _, shown = request({**form_state(page), **rng, "btnSubmit": "Submit"})
    page = shown.decode("utf-8", "replace")
    flat = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", page)))
    remark = re.search(r"Remark:\s*(.*?)(?:\s*Related Links:|$)", flat)
    remark_text = re.sub(r"[^ -~]+", " ", remark.group(1)).strip() if remark else "(no remark found on the page)"
    ctype, data = request({**form_state(page), **rng, "imbExportText.x": "12", "imbExportText.y": "12"})
    if "csv" not in ctype.lower():
        sys.exit(f"Expected a CSV, got {ctype!r}.")
    RAW.parent.mkdir(parents=True, exist_ok=True)
    RAW.write_bytes(data)

    text = data.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    head = "\n".join(",".join(r) for r in rows[:6])
    last_updated = re.search(r"Last Updated\s*:\s*([^\n,]+)", head)
    retrieved = re.search(r"Retrieved date\s*:\s*([^\n,]+)", head)
    base = re.search(r"\((\d{4})\s*=\s*100\)", head)
    header = next(r for r in rows if len(r) > 3 and re.match(r"\s*[A-Z]{3} \d{4}\s*$", r[2] or ""))
    periods = []
    for cell in header[2:]:
        mon, yr = cell.split()
        periods.append(f"{yr}-{MONTHS[mon]:02d}")

    out, section = [], None
    for r in rows:
        if len(r) < 3:
            continue
        label = r[1].strip().lower()
        hit = next((k for k in SECTIONS if label.startswith(k)), None)
        if hit:
            section = SECTIONS[hit]
            continue
        if section and label == "bangkok and vicinities":
            for period, cell in zip(periods, r[2:]):
                cell = cell.strip()
                if cell and cell not in {"-", "n.a."}:
                    out.append((period, section, float(cell)))
            section = None
    keys = sorted({k for _, k, _ in out})
    if keys != sorted(SECTIONS.values()):
        sys.exit(f"Expected series {sorted(SECTIONS.values())}, found {keys}. The table layout may have changed.")
    out.sort(key=lambda x: (x[1], x[0]))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["period", "series_key", "value"])
        w.writerows(out)

    span = {k: (min(p for p, kk, _ in out if kk == k), max(p for p, kk, _ in out if kk == k), sum(1 for _, kk, _ in out if kk == k)) for k in keys}
    now = datetime.now(ICT).strftime("%Y-%m-%d %H:%M ICT")
    lines = [
        "# Source: Bank of Thailand Residential Property Price Index",
        "",
        "Written by `fetch_bot.py` from the downloaded file and the BOT page it came from. Do not edit by hand.",
        "",
        f"- **Publisher:** Bank of Thailand, Data Management and Analytics Department",
        f"- **Table:** `{TABLE}` Residential Property Price Index",
        f"- **URL:** {URL}",
        f"- **Base:** {base.group(1) if base else '?'} = 100",
        f"- **Frequency:** monthly (BOT publishes a 3-month moving average)",
        f"- **BOT last updated:** {last_updated.group(1).strip() if last_updated else '?'}",
        f"- **Retrieved (BOT stamp):** {retrieved.group(1).strip() if retrieved else '?'}; script run {now}",
        f"- **BOT remark (verbatim from the page):** {remark_text}",
        "",
        "| series_key | BOT row | first | last | months |",
        "|---|---|---|---|---|",
    ]
    names = {v: k for k, v in SECTIONS.items()}
    for k in keys:
        a, b, n = span[k]
        lines.append(f"| `{k}` | {names[k]} → Bangkok and vicinities | {a} | {b} | {n} |")
    lines += ["", "This is an index of mortgage-backed transaction prices for a region, not the value of any single property."]
    SOURCE.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(out)} rows → {OUT.relative_to(HERE.parent.parent)}")
    for k in keys:
        print(f"  {k}: {span[k][0]} … {span[k][1]} ({span[k][2]} months)")
    print(f"BOT last updated: {last_updated.group(1).strip() if last_updated else '?'}")


if __name__ == "__main__":
    main()
