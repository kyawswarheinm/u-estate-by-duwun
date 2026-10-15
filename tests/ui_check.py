"""Person 2 UI checks: mobile/desktop layout, accessibility basics, honesty labels, voice fallbacks, token check UI.
Usage (needs `pip install playwright` + `playwright install chromium`):
    python -X utf8 tests/ui_check.py http://localhost:3000 <outDir outside the repo>
Screenshots go to outDir; never commit them if they show real data."""
import json, sys, os
from playwright.sync_api import sync_playwright

BASE = sys.argv[1].rstrip("/")
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
PAGES = ["/", "/listing/l-condo", "/listing/l-house", "/listing/l-condo/offers", "/ledger", "/partners", "/assistant", "/signin", "/signup"]
results = []

def rec(area, name, ok, detail=""):
    results.append({"area": area, "name": name, "ok": ok, "detail": detail})

AUDIT_JS = r"""
() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || el.textContent || el.getAttribute('title') || el.getAttribute('value') || '').trim();
  const unlabeled = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(vis).filter(el => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
    return !el.closest('label');
  }).map(el => el.outerHTML.slice(0, 90));
  const noName = [...document.querySelectorAll('button, a[href]')].filter(vis).filter(el => !name(el) && !el.querySelector('img[alt]:not([alt=""])')).map(el => el.outerHTML.slice(0, 90));
  const imgNoAlt = [...document.querySelectorAll('img')].filter(el => !el.hasAttribute('alt')).map(el => el.src.slice(-50));
  const small = [...document.querySelectorAll('main button, main a[href], main input, main select, main summary, header button, header a[href]')].filter(vis).filter(el => { const r = el.getBoundingClientRect(); return r.height < 44 && el.closest('p, li, td') === null; }).map(el => `${el.tagName.toLowerCase()} "${name(el).slice(0, 30)}" ${Math.round(el.getBoundingClientRect().height)}px`);
  return {
    overflowX: document.documentElement.scrollWidth - window.innerWidth,
    lang: document.documentElement.lang, dir: document.documentElement.dir || 'ltr',
    landmarks: { header: !!document.querySelector('header'), nav: !!document.querySelector('nav'), main: !!document.querySelector('main'), footer: !!document.querySelector('footer') },
    h1: document.querySelectorAll('h1').length,
    unlabeled, noName, imgNoAlt, small: small.slice(0, 12), smallCount: small.length,
    text: document.body.innerText,
  };
}
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for label, vp in [("desktop", {"width": 1280, "height": 900}), ("mobile360", {"width": 360, "height": 780})]:
        ctx = browser.new_context(viewport=vp)
        for path in PAGES:
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: errors.append(m.text[:160]) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)[:160]))
            resp = page.goto(BASE + path, wait_until="networkidle", timeout=60000)
            a = page.evaluate(AUDIT_JS)
            shot = f"{OUT}/{label}{path.replace('/', '_') or '_home'}.png"
            page.screenshot(path=shot, full_page=True)
            area = f"{label} {path}"
            rec(area, "loads (HTTP < 400)", resp.status < 400, f"status {resp.status}")
            rec(area, "no console/page errors", not errors, "; ".join(errors[:3]))
            rec(area, "no horizontal scroll", a["overflowX"] <= 1, f"overflow {a['overflowX']}px")
            rec(area, "landmarks header/nav/main/footer", all(a["landmarks"].values()), json.dumps(a["landmarks"]))
            rec(area, "every input has a label", not a["unlabeled"], "; ".join(a["unlabeled"][:3]))
            rec(area, "buttons/links have names", not a["noName"], "; ".join(a["noName"][:3]))
            rec(area, "images have alt", not a["imgNoAlt"], "; ".join(a["imgNoAlt"][:3]))
            if label == "mobile360":
                rec(area, "tap targets >= 44px", a["smallCount"] == 0, f"{a['smallCount']} small: " + "; ".join(a["small"][:5]))
            if label == "desktop":
                t = a["text"]
                if path.startswith("/listing/") and not path.endswith("offers"):
                    rec(area, "honesty: SAMPLE label", "SAMPLE" in t)
                    rec(area, "honesty: 'not financial advice'", "not financial" in t.lower())
                    rec(area, "honesty: 'Confirm ownership at the Land Office' (UI_SPEC §7)", "Land Office" in t)
                if path == "/ledger":
                    rec(area, "honesty: test money + fingerprint only on-chain", "test money" in t.lower() and ("fingerprint" in t.lower()), "")
                if path == "/partners":
                    rec(area, "partners page shows fallback state, no key values", ("fallback" in t.lower() or "not connected" in t.lower()) and "sk_" not in t, "")
            page.close()
        ctx.close()

    # Keyboard: Tab through the header on desktop; focus must be visible
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="networkidle")
    seen, invisible = [], []
    for _ in range(12):
        page.keyboard.press("Tab")
        info = page.evaluate("""() => { const el = document.activeElement; const s = getComputedStyle(el);
            return { tag: el.tagName, text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30),
                     ring: (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none' }; }""")
        seen.append(f"{info['tag']}:{info['text']}")
        if not info["ring"]:
            invisible.append(f"{info['tag']}:{info['text']}")
    rec("keyboard /", "first Tab stops reach header links", any("Sell" in s or "Find" in s for s in seen), " | ".join(seen[:8]))
    rec("keyboard /", "focus ring visible on each Tab stop", not invisible, "no ring on: " + "; ".join(invisible[:5]))

    # Voice agent dock: open, Esc closes, focus returns to the button
    btn = page.get_by_role("button", name="Talk to U-Estate")
    if btn.count():
        btn.first.click()
        page.wait_for_timeout(400)
        opened = page.locator("section[aria-label='Talk to U-Estate']").count() > 0
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        still_open = page.locator("section[aria-label='Talk to U-Estate']").is_visible() if opened else False
        rec("voice dock", "opens from the button", opened)
        rec("voice dock", "Esc closes the dock (UI_SPEC §6)", opened and not still_open)
        back = page.evaluate("() => document.activeElement?.getAttribute('aria-controls')")
        rec("voice dock", "focus returns to the Talk to U-Estate button", back == "voice-agent-panel", f"focused: {back}")
        if opened and still_open:
            page.get_by_role("button", name="Close").first.click()
        start = page.get_by_role("button", name="Start") if opened else None
    else:
        rec("voice dock", "Talk to U-Estate button present", False)
    ctx.close()

    # Voice dock without an agent: start a call → clear not-connected message + link to typed chat
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="networkidle")
    page.get_by_role("button", name="Talk to U-Estate").first.click()
    page.wait_for_timeout(300)
    dock = page.locator("section[aria-label='Talk to U-Estate']")
    starter = dock.locator("button").filter(has_text="Start")
    if starter.count():
        starter.first.click()
        page.wait_for_timeout(2500)
        dt = dock.inner_text()
        page.screenshot(path=f"{OUT}/dock_after_start.png")
        rec("voice dock", "no agent/mic → clear message and link to typed chat", ("not connected" in dt.lower() or "microphone" in dt.lower()) and dock.locator("a[href='/assistant']").count() > 0, dt[:200].replace("\n", " | "))
    else:
        rec("voice dock", "start-call button found", False, dock.inner_text()[:200].replace("\n", " | "))
    ctx.close()

    # Voice search with the microphone denied, then typed search still works
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, permissions=[])
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="networkidle")
    speak = page.get_by_role("button", name="Speak")
    if speak.count():
        speak.first.click()
        page.wait_for_timeout(2500)
        status = page.locator("#voice-search-title").locator("xpath=ancestor::section").locator("[role=status]").inner_text()
        rec("voice search", "mic blocked/unavailable → explains why, typing offered", len(status.strip()) > 0, status[:160])
        page.fill("#voice-query", "หาบ้านไม่เกิน 6 ล้าน")
        page.get_by_role("button", name="Search").first.click()
        page.wait_for_timeout(3000)
        sec = page.locator("#voice-search-title").locator("xpath=ancestor::section").inner_text()
        page.screenshot(path=f"{OUT}/voice_search_typed.png", full_page=False)
        rec("voice search", "typed Thai query shows the Bang Yai house", "Bang Yai" in sec, sec[-200:].replace("\n", " | "))
    else:
        rec("voice search", "Speak button present", False)
    ctx.close()

    # Token check UI on the offer room (shown to signed-in buyers only): sign in as the Daniel persona first
    ctx = browser.new_context(viewport={"width": 360, "height": 780})
    page = ctx.new_page()
    page.goto(BASE + "/signin", wait_until="networkidle")
    page.wait_for_timeout(1500)  # let the persona forms hydrate
    page.locator("#personas form").filter(has_text="Daniel").locator("button").first.click()
    page.wait_for_url(lambda u: not u.endswith("/signin"), timeout=15000)
    page.goto(BASE + "/listing/l-condo/offers", wait_until="networkidle")
    summ = page.locator("summary").filter(has_text="Paying with crypto")
    if summ.count():
        summ.first.click()
        page.fill("#tc-token", "sample-cliff")
        page.fill("#tc-amount", "400000")
        page.fill("#tc-days", "30")
        summ.first.locator("xpath=..").locator("button[type=submit]").click()
        page.wait_for_timeout(2500)
        out = summ.first.locator("xpath=..").inner_text()
        page.screenshot(path=f"{OUT}/token_check_360.png", full_page=True)
        rec("token check UI", "sample-cliff shows High, SAMPLE label, never-accepts-crypto (360px)", "High" in out and "SAMPLE" in out and "never accepts crypto" in out.lower(), out[:220].replace("\n", " | "))
    else:
        rec("token check UI", "'Paying with crypto?' present on the offer room for a signed-in buyer", False)
    ctx.close()

    # Arabic / RTL: is there any way to switch the whole UI to Arabic?
    ctx = browser.new_context(viewport={"width": 1280, "height": 900}, locale="ar")
    ctx.add_cookies([{"name": "locale", "value": "ar", "url": BASE}])
    page = ctx.new_page()
    page.goto(BASE + "/", wait_until="networkidle")
    d = page.evaluate("() => ({lang: document.documentElement.lang, dir: document.documentElement.dir})")
    page.screenshot(path=f"{OUT}/arabic_cookie_home.png")
    rec("i18n/RTL", "locale=ar cookie gives <html lang=ar dir=rtl> (T18)", d["lang"] == "ar" and d["dir"] == "rtl", json.dumps(d))
    ctx.close()
    browser.close()

fails = [r for r in results if not r["ok"]]
for r in results:
    print(f"{'PASS' if r['ok'] else 'FAIL'}  {r['area']:<28} {r['name']}" + (f"  [{r['detail']}]" if r["detail"] and not r["ok"] else ""))
print(f"\n{len(results) - len(fails)}/{len(results)} passed")
json.dump(results, open(f"{OUT}/ui_results.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
