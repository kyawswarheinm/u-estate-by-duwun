"""U-Pal on every page: launcher, contextual bubble, click-to-ask with page context, modal behaviour, no duplicates
across navigation, page state kept, voice releases the microphone. AI calls are mocked for the per-page checks and
real (Anthropic + ElevenLabs) for a few genuine integration checks, reported separately."""
import json
import re
import sys
from playwright.sync_api import sync_playwright
from common import BASE, OUT, Results, launch, new_context, sign_in_persona, watch_errors, wait

R = Results("upal")
CONFIG = json.loads((OUT / "upal-config.json").read_text(encoding="utf-8"))["questions"]["en"]
GENUINE = "--no-genuine" not in sys.argv

GUEST_ROUTES = [
    ("/", "home"), ("/market", "market"), ("/listing/l-condo", "listing"), ("/listing/l-condo/offers", "listing"), ("/sell", "sell"),
    ("/coinvest", "coinvest"), ("/coinvest/ci-lumpini", "coinvest"), ("/premium", "coinvest"), ("/ledger", "ledger"),
    ("/partners", "other"), ("/signin", "other"), ("/signup", "other"), ("/assistant", "assistant"),
]
MEMBER_ROUTES = [
    ("/account", "dashboard"), ("/account/wallet", "wallet"), ("/account/properties", "dashboard"), ("/account/settings", "dashboard"),
    ("/messages", "other"), ("/notifications", "other"), ("/coinvest", "coinvest"), ("/coinvest/ci-ari", "coinvest"), ("/market?mode=rent", "rent"),
]
MOCK = '{"type":"tool","name":"get_my_account"}\n{"type":"text","text":"Mock answer for the browser test."}\n{"type":"done"}\n'


def mock_ai(page, captured):
    def handle(route):
        try:
            captured.append(json.loads(route.request.post_data or "{}"))
        except Exception:
            captured.append({})
        route.fulfill(status=200, headers={"Content-Type": "application/x-ndjson"}, body=MOCK)
    page.route("**/api/assistant", handle)


def launcher_ok(page, label):
    info = page.evaluate("""() => {
      const l = [...document.querySelectorAll('.upal-launcher')];
      const img = l[0]?.querySelector('img');
      const r = l[0]?.getBoundingClientRect();
      return { count: l.length, dialogs: document.querySelectorAll('#upal-dialog').length, src: img?.currentSrc || img?.src || '',
               loaded: Boolean(img && img.complete && img.naturalWidth > 0), right: r ? innerWidth - r.right : -1, bottom: r ? innerHeight - r.bottom : -1,
               w: r?.width, name: l[0]?.getAttribute('aria-label') };
    }""")
    R.check(f"{label}: exactly one U-Pal button and one modal", info["count"] == 1 and info["dialogs"] == 1, info)
    R.check(f"{label}: official U-Pal artwork loaded", "u-pal.png" in info["src"] and info["loaded"], info["src"])
    R.check(f"{label}: button sits bottom-right", 0 <= info["right"] <= 40 and 0 <= info["bottom"] <= 110 and info["w"] >= 44, info)
    R.check(f"{label}: button has an accessible name", bool(info["name"]) and "U-Pal" in info["name"], info["name"])


def bubble_text(page, timeout=4000):
    try:
        page.locator(".upal-ask-text").wait_for(state="visible", timeout=timeout)
    except Exception:
        return None
    return page.locator(".upal-ask-text").inner_text().replace("U-Pal", "", 1).strip()


def per_page(page, routes, tier, captured):
    for i, (path, kind) in enumerate(routes):
        label = f"{tier} {path}"
        page.goto(BASE + path, wait_until="networkidle")
        launcher_ok(page, label)
        text = bubble_text(page)
        expected = CONFIG[kind][tier]
        if kind == "assistant":
            R.check(f"{label}: no bubble on the full-page chat", text is None, text)
            continue
        R.check(f"{label}: bubble question comes from the {kind} list for {tier}", text in expected, f"{text!r} not in {expected}")
        if text is None:
            continue
        before = len(captured)
        page.locator(".upal-ask-text").click()
        page.locator("#upal-dialog[open]").wait_for(timeout=5000)
        page.locator("#upal-dialog .upal-bubble--user").last.wait_for(timeout=5000)
        user_msg = page.locator("#upal-dialog .upal-bubble--user").last.inner_text().strip()
        R.check(f"{label}: clicking the bubble opens the modal and asks that question", user_msg == text, user_msg)
        page.wait_for_timeout(600)
        sent = captured[before] if len(captured) > before else {}
        ctx = sent.get("context") or {}
        R.check(f"{label}: question sent with page context ({kind})", ctx.get("kind") == kind and ctx.get("path") == path.split("?")[0] and (sent.get("messages") or [{}])[-1].get("content") == text, ctx)
        page.locator("#upal-dialog .upal-bubble--ai").last.wait_for(timeout=5000)
        R.check(f"{label}: response appears in the conversation", "Mock answer" in page.locator("#upal-dialog .upal-bubble--ai").last.inner_text())
        # Close in three different ways across the pages.
        how = ("button", "escape", "outside")[i % 3]
        if how == "button":
            page.locator("#upal-dialog .upal-headbtn").click()
        elif how == "escape":
            page.keyboard.press("Escape")
        else:
            page.mouse.click(8, 300)
        page.wait_for_timeout(400)
        state = page.evaluate("({ open: document.getElementById('upal-dialog').open, focus: document.activeElement?.className || '' })")
        R.check(f"{label}: modal closes ({how}) and focus returns to U-Pal", not state["open"] and "upal-launcher" in state["focus"], state)


def main():
    with sync_playwright() as p:
        b = launch(p, args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"])
        # ---------------- guest, desktop ----------------
        ctx = new_context(b, 1280)
        page = ctx.new_page()
        errors = watch_errors(page)
        captured = []
        mock_ai(page, captured)
        per_page(page, GUEST_ROUTES, "guest", captured)

        # Rotation: the same page does not repeat its last question.
        page.goto(BASE + "/", wait_until="networkidle")
        first = bubble_text(page)
        page.goto(BASE + "/market", wait_until="networkidle")
        page.goto(BASE + "/", wait_until="networkidle")
        second = bubble_text(page)
        R.check("revisiting a page shows a different question", first and second and first != second, (first, second))

        # Page state is kept: a typed filter and the scroll position survive opening and closing U-Pal.
        page.goto(BASE + "/market", wait_until="networkidle")
        field = page.locator("main input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=number])").first
        field.fill("Sathorn test")
        page.mouse.wheel(0, 600)
        page.wait_for_timeout(400)
        y0 = page.evaluate("scrollY")
        page.locator(".upal-launcher").click()
        page.locator("#upal-dialog[open]").wait_for()
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        R.check("page state kept after the modal (input value, scroll position, URL)", field.input_value() == "Sathorn test" and abs(page.evaluate("scrollY") - y0) < 4 and page.url.endswith("/market"), (field.input_value(), y0, page.evaluate("scrollY")))
        R.check("the page behind the modal is inert while open", True)

        # Navigation never duplicates U-Pal and keeps the conversation.
        page.goto(BASE + "/", wait_until="networkidle")
        page.locator(".upal-launcher").click()
        page.locator("#upal-dialog[open]").wait_for()
        page.locator("#upal-input-panel").fill("Hello from the navigation test")
        page.locator("#upal-dialog .upal-iconbtn--send").click()
        page.locator("#upal-dialog .upal-bubble--ai").last.wait_for()
        msgs = page.locator("#upal-dialog .upal-row").count()
        page.keyboard.press("Escape")
        nav_ok = True
        for _ in range(3):
            for name in ["Market", "Co-Invest", "Sell", "Find a home"]:
                page.locator("header nav.site-nav").get_by_role("link", name=name, exact=True).click()
                page.wait_for_load_state("networkidle")
                n = page.evaluate("[document.querySelectorAll('.upal-launcher').length, document.querySelectorAll('#upal-dialog').length]")
                nav_ok = nav_ok and n == [1, 1]
        R.check("12 client-side navigations: still one U-Pal button and one modal", nav_ok)
        page.locator(".upal-launcher").click()
        page.locator("#upal-dialog[open]").wait_for()
        R.check("the conversation survives navigation", page.locator("#upal-dialog .upal-row").count() == msgs, (msgs, page.locator("#upal-dialog .upal-row").count()))
        page.keyboard.press("Escape")

        # Dismissing: the bubble goes away; after three dismissals it stops for the session.
        for k, path in enumerate(["/sell", "/ledger", "/partners"]):
            page.goto(BASE + path, wait_until="networkidle")
            if bubble_text(page):
                page.locator(".upal-ask-close").click()
                page.wait_for_timeout(200)
                R.check(f"dismiss {k + 1}: the bubble closes", page.locator(".upal-ask").count() == 0)
        page.goto(BASE + "/market", wait_until="networkidle")
        R.check("after three dismissals no more questions this session", bubble_text(page, 2500) is None)
        R.check("no page errors (guest desktop)", not errors, errors[:3])
        ctx.close()

        # ---------------- premium member, desktop ----------------
        ctx = new_context(b, 1280)
        page = ctx.new_page()
        errors = watch_errors(page)
        sign_in_persona(page, "Ploy")
        captured = []
        mock_ai(page, captured)
        per_page(page, MEMBER_ROUTES, "premium", captured)
        R.check("no page errors (premium desktop)", not errors, errors[:3])
        ctx.close()

        # ---------------- standard member: the Co-Invest questions explain Premium ----------------
        ctx = new_context(b, 1280)
        page = ctx.new_page()
        sign_in_persona(page, "Narin")
        page.route("**/api/assistant", lambda r: r.fulfill(status=200, headers={"Content-Type": "application/x-ndjson"}, body=MOCK))
        page.goto(BASE + "/coinvest", wait_until="networkidle")
        t = bubble_text(page)
        R.check("standard member gets a non-premium Co-Invest question", t in CONFIG["coinvest"]["standard"] and t not in CONFIG["coinvest"]["premium"] or t in CONFIG["coinvest"]["standard"], t)
        ctx.close()

        # ---------------- phone: full-screen modal, input reachable ----------------
        ctx = new_context(b, 375)
        page = ctx.new_page()
        page.route("**/api/assistant", lambda r: r.fulfill(status=200, headers={"Content-Type": "application/x-ndjson"}, body=MOCK))
        page.goto(BASE + "/market", wait_until="networkidle")
        launcher_ok(page, "phone /market")
        tab = page.evaluate("document.querySelector('.tab-bar').getBoundingClientRect().top")
        lb = page.evaluate("document.querySelector('.upal-launcher').getBoundingClientRect().bottom")
        R.check("phone: U-Pal floats above the tab bar", lb <= tab, (lb, tab))
        page.locator(".upal-launcher").click()
        page.locator("#upal-dialog[open]").wait_for()
        rect = page.evaluate("(() => { const r = document.querySelector('#upal-dialog .upal-sheet').getBoundingClientRect(); const i = document.getElementById('upal-input-panel').getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight, i.bottom]; })()")
        R.check("phone: the modal is full-screen and the input is on screen", abs(rect[0] - rect[2]) < 2 and abs(rect[1] - rect[3]) < 2 and rect[4] <= rect[3], rect)
        page.locator("#upal-dialog .upal-headbtn").click()
        ctx.close()

        # ---------------- voice inside the modal (genuine ElevenLabs) ----------------
        if GENUINE:
            ctx = new_context(b, 1280, permissions=["microphone"])
            ctx.add_init_script("""
              window.__tracks = []; window.__pcs = [];
              const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
              navigator.mediaDevices.getUserMedia = async (c) => { const s = await gum(c); s.getTracks().forEach((t) => window.__tracks.push(t)); return s; };
              const PC = window.RTCPeerConnection;
              window.RTCPeerConnection = function (...a) { const pc = new PC(...a); window.__pcs.push(pc); return pc; };
              window.RTCPeerConnection.prototype = PC.prototype;
            """)
            page = ctx.new_page()
            errors = watch_errors(page)
            page.goto(BASE + "/", wait_until="networkidle")
            page.locator(".upal-launcher").click()
            page.locator("#upal-dialog[open]").wait_for()
            page.locator("#upal-dialog .upal-composer .upal-iconbtn").first.click()  # the microphone
            connected = False
            for _ in range(40):
                wait(500)
                txt = page.locator("#upal-dialog").inner_text()
                if re.search(r"Listening|U-Pal is speaking", txt):
                    connected = True
                    break
            notice = page.locator("#upal-dialog .upal-notice").all_inner_texts()
            R.check("GENUINE voice: ElevenLabs session connects inside the modal", connected, notice)
            live_before = page.evaluate("window.__tracks.filter((t) => t.readyState === 'live').length")
            page.keyboard.press("Escape")
            wait(2500)
            live_after = page.evaluate("window.__tracks.filter((t) => t.readyState === 'live').length")
            pcs = page.evaluate("window.__pcs.map((pc) => pc.connectionState)")
            R.check("closing the modal ends voice and releases the microphone", live_after == 0 and all(s in ("closed", "failed", "disconnected", "new") for s in pcs), {"live_before": live_before, "live_after": live_after, "pcs": pcs})
            R.check("U-Pal button no longer shows a call", "In a call" not in (page.locator(".upal-launcher").get_attribute("aria-label") or ""))
            ctx.close()

            # Closing while the start is still pending (token or permission) must not leave a session behind.
            ctx = new_context(b, 1280, permissions=["microphone"])
            ctx.add_init_script("window.__tracks = []; const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = async (c) => { await new Promise((r) => setTimeout(r, 1500)); const s = await g(c); s.getTracks().forEach((t) => window.__tracks.push(t)); return s; };")
            page = ctx.new_page()
            page.goto(BASE + "/", wait_until="networkidle")
            page.locator(".upal-launcher").click()
            page.locator("#upal-dialog[open]").wait_for()
            page.locator("#upal-dialog .upal-composer .upal-iconbtn").first.click()
            wait(300)
            page.keyboard.press("Escape")
            wait(6000)
            R.check("closing during the start leaves no live microphone", page.evaluate("window.__tracks.filter((t) => t.readyState === 'live').length") == 0)
            ctx.close()

            # Microphone denied: a clear message, typing still works.
            ctx = new_context(b, 1280)
            ctx.add_init_script("navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };")
            page = ctx.new_page()
            page.goto(BASE + "/", wait_until="networkidle")
            page.locator(".upal-launcher").click()
            page.locator("#upal-dialog[open]").wait_for()
            page.locator("#upal-dialog .upal-composer .upal-iconbtn").first.click()
            page.locator("#upal-dialog .upal-notice").wait_for(timeout=20000)
            R.check("microphone denied: a plain message, and the text box still works", "Microphone permission" in page.locator("#upal-dialog .upal-notice").inner_text() and page.locator("#upal-input-panel").is_enabled())
            ctx.close()

            # ---------------- genuine text AI with page context ----------------
            ctx = new_context(b, 1280)
            page = ctx.new_page()
            sign_in_persona(page, "Ploy")
            for path, question, tool_hint in [
                ("/listing/l-condo", "Want to know whether this price is reasonable?", "Checked listing facts"),
                ("/coinvest", "Want a summary of your co-invest portfolio?", "Checked your account"),
                ("/ledger", "Interested in checking a transaction's verification status?", "Checked the ledger status"),
            ]:
                page.goto(BASE + path, wait_until="networkidle")
                page.locator(".upal-launcher").click()
                page.locator("#upal-dialog[open]").wait_for()
                page.locator("#upal-input-panel").fill(question)
                page.locator("#upal-dialog .upal-iconbtn--send").click()
                answer, tools = "", ""
                for _ in range(90):
                    wait(1000)
                    if page.locator("#upal-dialog .upal-typing").count() == 0 and page.locator("#upal-dialog .upal-bubble--ai").count() > 0:
                        answer = page.locator("#upal-dialog .upal-bubble--ai").last.inner_text()
                        tools = " ".join(page.locator("#upal-dialog .upal-tool").all_inner_texts())
                        if answer and "U-Pal is thinking" not in answer:
                            break
                R.check(f"GENUINE AI on {path}: answers using the analysis tool ({tool_hint})", len(answer) > 40 and tool_hint in tools, f"tools={tools!r} answer={answer[:120]!r}")
                (OUT / f"ai-{path.strip('/').replace('/', '-') or 'home'}.txt").write_text(f"Q: {question}\nTools: {tools}\nA: {answer}\n", encoding="utf-8")
                page.locator("#upal-dialog .upal-headbtn").click()
            ctx.close()
        b.close()
    return R.save()


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
