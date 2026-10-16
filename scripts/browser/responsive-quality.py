"""Production accessibility and local lab performance checks.
Install axe-core in tmp/responsive-tools (--ignore-scripts). Uses no paid APIs.
Performance numbers are local lab samples, never field Core Web Vitals.
"""
import importlib.util, json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('responsive-audit.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
BASE,OUT=audit.BASE,audit.OUT
axe=Path('tmp/responsive-tools/node_modules/axe-core/axe.min.js')
if not axe.exists(): raise SystemExit('Install axe-core in tmp/responsive-tools first.')

with sync_playwright() as p:
    b=p.chromium.launch(channel='msedge',headless=True)
    c=b.new_context(viewport={'width':375,'height':812},reduced_motion='reduce')
    page=c.new_page();audit.go(page,'/signin')
    persona=page.locator('#personas button').filter(has_text='Malee')
    if persona.count():
        persona.first.click();page.wait_for_url(BASE+'/');page.wait_for_load_state('networkidle')
    context_routes=page.locator('main a[href^="/messages/"]').evaluate_all('(els)=>els.map(e=>e.getAttribute("href"))')
    routes=list(dict.fromkeys(audit.ROUTES+context_routes+[r for r in os.environ.get('EXTRA_ROUTES','').split(',') if r]))
    routes=[r for r in os.environ.get("QUALITY_ROUTES", "").split(",") if r] or routes
    report=[]
    for theme in ['light','dark']:
        c.add_cookies([{'name':'theme','value':theme,'url':BASE},{'name':'locale','value':'en','url':BASE}])
        for route in routes:
            audit.go(page,route);page.add_script_tag(path=str(axe))
            results=page.evaluate('''async()=> {
                const r=await axe.run(document, {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}});
                return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>v.id)};
            }''')
            report.append({'route':route,'theme':theme,**results})
            print('axe',theme,route,[r['id'] for r in results['violations']],flush=True)
    (OUT/'accessibility.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    c.close()
    samples=[]
    for route in ['/','/market','/signin']:
        c=b.new_context(viewport={'width':375,'height':812},device_scale_factor=1,is_mobile=True,has_touch=True)
        page=c.new_page()
        page.add_init_script('''window.lab={lcp:0,cls:0,interactions:[]};
          new PerformanceObserver(l=>{for(const e of l.getEntries())window.lab.lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});
          new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.lab.cls+=e.value}).observe({type:'layout-shift',buffered:true});
          new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.interactionId)window.lab.interactions.push(e.duration)}).observe({type:'event',buffered:true,durationThreshold:16});''')
        session=c.new_cdp_session(page)
        session.send('Network.enable')
        session.send('Network.setCacheDisabled',{'cacheDisabled':True})
        session.send('Network.emulateNetworkConditions',{'offline':False,'latency':150,'downloadThroughput':200000,'uploadThroughput':93750})
        session.send('Emulation.setCPUThrottlingRate',{'rate':4})
        audit.go(page,route);page.wait_for_timeout(1500)
        page.get_by_role('button',name='Menu',exact=True).click();page.wait_for_timeout(300)
        page.locator('dialog').get_by_role('button',name='Close',exact=True).click()
        page.wait_for_timeout(300)
        metrics=page.evaluate('''()=>({...window.lab,ttfb:performance.getEntriesByType('navigation')[0].responseStart,
          jsBytes:performance.getEntriesByType('resource').filter(e=>e.name.includes('.js')).reduce((n,e)=>n+e.transferSize,0)})''')
        samples.append({'route':route,**metrics});print('lab',route,metrics,flush=True)
        c.close()
    (OUT/'performance.json').write_text(json.dumps({'conditions':'local production server; Edge; cold browser cache; CPU 4x; 150ms latency; 1.6Mbps down; one sample per route; menu interactions only; CLS total excludes recent input','samples':samples},indent=2),encoding='utf-8')
    b.close()
    if any(r['violations'] for r in report): raise SystemExit(1)
