"""Responsive keyboard, locale, theme, landscape and failure-state checks.
API failures below are browser mocks: they do not call paid services or write data.
"""
import importlib.util, json, os, sys
sys.dont_write_bytecode = True
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('responsive-audit.py'))
audit=importlib.util.module_from_spec(spec); spec.loader.exec_module(audit)
BASE, OUT = audit.BASE, audit.OUT
checks=[]; layouts=[]

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    context=browser.new_context(viewport={'width':320,'height':740},reduced_motion='reduce')
    page=context.new_page()
    audit.go(page,'/signin')
    menu=page.get_by_role('button',name='Menu',exact=True)
    menu.click(); expect(page.locator('dialog')).to_be_visible()
    for _ in range(24):
        page.keyboard.press('Tab')
        assert page.evaluate('!!document.activeElement.closest("dialog")'), 'Focus escaped modal menu'
    checks.append('mobile menu traps keyboard focus')
    page.locator('dialog').get_by_role('button',name='Language:',exact=False).click()
    page.keyboard.press('Escape'); expect(page.locator('dialog')).to_be_visible()
    page.keyboard.press('Escape'); expect(page.locator('dialog')).not_to_be_visible(); expect(menu).to_be_focused()
    checks.append('nested Escape and focus restoration')
    page.set_viewport_size({'width':667,'height':375}); menu.click()
    close=page.locator('dialog').get_by_role('button',name='Close',exact=True)
    page.locator('dialog').evaluate('(e)=>e.scrollTop=e.scrollHeight')
    expect(close).to_be_in_viewport();close.click()
    checks.append('landscape menu scrolls with close control reachable')
    page.locator('.voice-launcher').click();expect(page.locator('#voice-agent-panel')).to_be_visible()
    box=page.locator('#voice-agent-panel').bounding_box()
    assert box['y']>=0 and box['y']+box['height']<=375
    page.route('**/api/voice/agent-token',lambda r:r.fulfill(status=503,json={'message':'Voice unavailable in responsive test'}))
    page.get_by_role('button',name='Start talking',exact=True).click()
    expect(page.locator('#voice-agent-panel [role="alert"]')).to_be_visible()
    page.locator('#voice-agent-panel').get_by_role('button',name='Close',exact=True).click()
    checks.append('lazy voice opens, fits landscape, exposes failure fallback and closes')
    page.set_viewport_size({'width':320,'height':740});page.get_by_label('Email',exact=True).focus()
    expect(page.locator('.voice-dock')).not_to_be_visible()
    checks.append('voice launcher does not cover focused form fields')
    audit.go(page,'/assistant')
    page.route('**/api/assistant',lambda r:r.fulfill(status=429,json={'message':'Please try again later (responsive test).'}))
    page.get_by_label('Your question',exact=True).fill('Responsive test')
    page.get_by_role('button',name='Send',exact=True).click()
    expect(page.get_by_text('Please try again later (responsive test).',exact=True)).to_be_visible()
    checks.append('assistant request failure remains readable')
    audit.go(page,'/signin')
    persona=page.locator('#personas button').filter(has_text='Malee')
    if persona.count():
        persona.first.click();page.wait_for_url(BASE+'/');page.wait_for_load_state('networkidle')
    extras=[r for r in os.environ.get('EXTRA_ROUTES','').split(',') if r]
    for locale in ['en','th','ar','zh-Hant','es']:
        for theme in ['light','dark']:
            context.add_cookies([{'name':'locale','value':locale,'url':BASE},{'name':'theme','value':theme,'url':BASE}])
            routes = list(dict.fromkeys(audit.ROUTES+extras)) if locale=='ar' else ['/', '/market', '/account/wallet']
            for route in routes:
                status=audit.go(page,route)
                assert status<400, (route,status)
                expect(page.locator('html')).to_have_attribute('lang',locale)
                expect(page.locator('html')).to_have_attribute('data-theme',theme)
                for width,height in [(320,740),(768,1024),(1440,900),(667,375)]:
                    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(60)
                    result=audit.measure(page)
                    layouts.append({'route':route,'locale':locale,'theme':theme,'height':height,**result})
                if route=='/account/wallet':
                    page.set_viewport_size({'width':375,'height':812})
                    page.screenshot(path=str(OUT/f'wallet-{locale}-{theme}.png'))
            print('tested',locale,theme,flush=True)
    # Text enlargement tests reflow without using browser zoom's screenshot scaling.
    context.add_cookies([{'name':'locale','value':'en','url':BASE}])
    for route in ['/signin','/market','/account/wallet']:
        audit.go(page,route);page.set_viewport_size({'width':320,'height':740})
        page.add_style_tag(content='html { font-size: 200% !important; }')
        result=audit.measure(page);layouts.append({'route':route,'textScale':2,**result})
    failures=[r for r in layouts if r['overflow'] or r['scrollWidth']>r['width']+2]
    (OUT/'interactions.json').write_text(json.dumps({'checks':checks,'layouts':layouts,'failures':failures},indent=2),encoding='utf-8')
    print(json.dumps({'checks':checks,'views':len(layouts),'failures':failures},indent=2))
    browser.close()
    if failures: raise SystemExit(1)
