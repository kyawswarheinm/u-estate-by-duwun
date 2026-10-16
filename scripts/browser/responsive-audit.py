"""Read-only layout audit, except optional existing demo-persona sign-in.
Run against a local server: TEST_BASE_URL=http://localhost:3000 python ...
Requires Python Playwright and installed Edge; writes only tmp/responsive/.
"""
import json, os, re
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get('TEST_BASE_URL', 'http://localhost:3000').rstrip('/')
OUT = Path('tmp/responsive'); OUT.mkdir(parents=True, exist_ok=True)
WIDTHS = [320, 375, 430, 768, 1024, 1280, 1440, 1920]
ROUTES = ['/', '/signin', '/signup', '/market', '/assistant', '/partners', '/ledger', '/sell', '/account', '/account/properties', '/account/wallet', '/account/settings', '/messages', '/notifications', '/listing/l-condo', '/listing/l-house', '/listing/l-condo/offers']

def go(page, route):
    response = page.goto(BASE + route, wait_until='domcontentloaded', timeout=60000)
    page.wait_for_load_state('networkidle', timeout=30000)
    return response.status

def measure(page):
    return page.evaluate('''() => {
      const vw = document.documentElement.clientWidth;
      const nodes = [...document.querySelectorAll('main *, header *, footer *')];
      const bad = nodes.filter(e => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(e).position === 'absolute') return false;
        // Deliberate contained table / navigation scrolling is not page overflow.
        for (let p = e.parentElement; p; p=p.parentElement) {
          if (['auto','scroll','hidden'].includes(getComputedStyle(p).overflowX)) return false;
        }
        return r.right > vw+2 || r.left < -2;
      });
      return {width: vw, scrollWidth: document.documentElement.scrollWidth,
        overflow: bad.slice(0,12).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.trim().slice(0,70)}))};
    }''')

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context(viewport={'width':375,'height':812}, reduced_motion='reduce')
        page = context.new_page()
        errors = []; page.on('pageerror', lambda e: errors.append(str(e)[:250]))
        go(page, '/signin')
        # Existing demo login only; no signups, offers, commitments, or changes to listings.
        persona = page.locator('#personas button').filter(has_text='Malee')
        signed_in = bool(persona.count())
        if signed_in:
            persona.first.click(); page.wait_for_url(BASE + '/'); page.wait_for_load_state('networkidle')
        go(page, '/account/properties')
        dynamic = page.locator('main a[href^="/cobuy/"]').evaluate_all('(els)=>els.map(e=>e.getAttribute("href"))')
        # Discover real property/group links; never guess fixture IDs.
        for path in ['/listing/l-condo','/listing/l-house','/messages']:
            go(page,path)
            dynamic += page.locator('main a[href^="/cobuy/"], main a[href^="/messages/"]').evaluate_all('(els)=>els.map(e=>e.getAttribute("href"))')
        routes = list(dict.fromkeys(ROUTES + dynamic + [r for r in os.environ.get("EXTRA_ROUTES", "").split(",") if r]))
        report=[]
        for route in routes:
            status=go(page,route)
            for width in WIDTHS:
                page.set_viewport_size({'width':width,'height':900 if width>=768 else 812})
                page.wait_for_timeout(100)
                result=measure(page)
                report.append({'route':route,'status':status,'actualPath':page.url.split(BASE)[-1],**result})
                if width in [320,1440]:
                    name=re.sub(r'[^a-z0-9]+','-',route).strip('-') or 'home'
                    page.screenshot(path=str(OUT/f'{name}-{width}.png'),full_page=True)
            print('audited',route,flush=True)
        (OUT/'audit.json').write_text(json.dumps({'signedIn':signed_in,'pageErrors':errors,'results':report},indent=2),encoding='utf-8')
        failures=[r for r in report if r['overflow'] or r['scrollWidth']>r['width']+2 or r['status']>=400]
        print(json.dumps({'views':len(report),'failures':failures,'pageErrors':errors},indent=2))
        browser.close()
        if failures or errors: raise SystemExit(1)

if __name__ == "__main__":
    main()
