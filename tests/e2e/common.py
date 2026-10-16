"""Shared helpers for the browser end-to-end checks (Playwright for Python, Microsoft Edge).

Run against the OFFLINE app with an isolated data file, never the hosted database:
    node scripts/start-offline.mjs 3201 --data=tmp/qa-db.json      (after `npm run build`)
    tmp/qa-venv/Scripts/python.exe tests/e2e/run_all.py
"""
import json
import os
import re
import time
import uuid
from pathlib import Path

BASE = os.environ.get("E2E_BASE", "http://localhost:3201")
OUT = Path(os.environ.get("E2E_OUT", "tmp/e2e"))
OUT.mkdir(parents=True, exist_ok=True)
APP = Path(__file__).resolve().parents[2]


class Results:
    def __init__(self, suite):
        self.suite = suite
        self.rows = []

    def check(self, name, ok, detail=""):
        self.rows.append({"suite": self.suite, "name": name, "ok": bool(ok), "detail": str(detail)[:300]})
        print(("PASS " if ok else "FAIL ") + name + (f"  [{str(detail)[:160]}]" if detail and not ok else ""), flush=True)
        return bool(ok)

    def save(self):
        (OUT / f"{self.suite}.json").write_text(json.dumps(self.rows, indent=1, ensure_ascii=False), encoding="utf-8")
        failed = [r["name"] for r in self.rows if not r["ok"]]
        print(f"\n[{self.suite}] {len(self.rows) - len(failed)}/{len(self.rows)} passed" + (f"; failed: {failed}" if failed else ""), flush=True)
        return failed


def launch(p, **kw):
    args = kw.pop("args", [])
    return p.chromium.launch(channel="msedge", args=args, **kw)


def new_context(browser, width=1280, theme="light", **kw):
    ctx = browser.new_context(viewport={"width": width, "height": 900 if width > 700 else 812}, color_scheme=theme,
                              is_mobile=width < 700, has_touch=width < 700, **kw)
    ctx.add_cookies([{"name": "theme", "value": theme, "url": BASE}])
    return ctx


def watch_errors(page):
    errors = []
    page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
    page.on("console", lambda m: errors.append(f"console: {m.text}") if m.type == "error" and "favicon" not in m.text else None)
    return errors


def sign_in_persona(page, name):
    page.goto(BASE + "/signin", wait_until="networkidle")
    with page.expect_navigation(timeout=30000):
        page.get_by_role("button", name=re.compile(name)).first.click()
    page.wait_for_load_state("networkidle")
    assert "/signin" not in page.url, f"persona sign-in failed: {page.url}"


def sign_up(page, next_path="/account"):
    """Creates a fresh demo account with a made-up example.com address. Returns (email, password)."""
    email = f"qa.{uuid.uuid4().hex[:10]}@example.com"
    password = f"Qa-{uuid.uuid4().hex[:12]}!"
    page.goto(f"{BASE}/signup?next={next_path}", wait_until="networkidle")
    page.locator("#name").fill("QA Tester")
    page.locator("#email").fill(email)
    page.locator("#password").fill(password)
    with page.expect_navigation(timeout=30000):
        page.locator("main form button[type=submit]").first.click()
    page.wait_for_load_state("networkidle")
    return email, password


def sign_in(page, email, password, next_path="/account"):
    page.goto(f"{BASE}/signin?next={next_path}", wait_until="networkidle")
    page.locator("#email").fill(email)
    page.locator("#password").fill(password)
    with page.expect_navigation(timeout=30000):
        page.locator("main form button[type=submit]").first.click()
    page.wait_for_load_state("networkidle")


def money_value(text):
    """'THB 4,806,100 (≈ $143,270)' -> 4806100.0 (the THB amount, before the reference)."""
    m = re.search(r"(?:THB|฿)\s?(-?[\d,]+(?:\.\d+)?)", text)
    return float(m.group(1).replace(",", "")) if m else None


def wait(ms):
    time.sleep(ms / 1000)
