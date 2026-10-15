import sys,secrets,re,os,hashlib,base64
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
sys.stdout.reconfigure(encoding='utf-8')
# Creates two accounts, two listings, an accepted offer and a commitment.
# Fixtures remain intentionally: the public ledger is append-only.
if "--allow-demo-writes" not in sys.argv:
 raise SystemExit("Use --allow-demo-writes only against a dedicated demo project.")
BASE=os.environ.get("TEST_BASE_URL", "http://localhost:3000").rstrip("/")
def local_store_hash():
 path=Path(".data/db.json")
 return hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None
before=local_store_hash()
def go(page,path):
 page.goto(BASE+path);page.wait_for_load_state('networkidle')
def signup(page,name):
 email='backend-qa-'+secrets.token_hex(6)+'@example.com';pw=secrets.token_urlsafe(24)
 go(page,'/signup');page.get_by_label('Your name').fill(name);page.get_by_label('Email',exact=True).fill(email);page.get_by_label('Password',exact=True).fill(pw)
 page.locator('form').filter(has=page.locator('#email')).get_by_role('button',name='Create account',exact=True).click();page.wait_for_url('**/account?welcome=1',timeout=30000)
 return email,pw
try:
 with sync_playwright() as p:
  b=p.chromium.launch(channel='msedge',headless=True)
  seller=b.new_context().new_page();email,pw=signup(seller,'Browser QA Seller');print('PASS signup')
  go(seller,'/account/wallet');expect(seller.get_by_role('region',name='Balance')).to_contain_text('5,000,000')
  seller.get_by_role('button',name=re.compile('Add.*test money')).click();expect(seller.get_by_role('region',name='Balance')).to_contain_text('6,000,000');print('PASS wallet top-up')
  go(seller,'/account/settings');seller.get_by_label('Display name',exact=True).fill('Browser QA Owner');seller.get_by_role('button',name='Save profile',exact=True).click();expect(seller.get_by_text('Profile saved.',exact=True)).to_be_visible()
  seller.get_by_role('button',name='Link my U-topia membership (demo)',exact=True).click();expect(seller.get_by_role('button',name='Unlink membership (demo)',exact=True)).to_be_visible();print('PASS profile and membership')
  newpw=secrets.token_urlsafe(24)
  seller.get_by_label('Current password',exact=True).fill(pw);seller.get_by_label('New password',exact=True).fill(newpw);seller.get_by_label('Repeat new password',exact=True).fill(newpw);seller.get_by_role('button',name='Change password',exact=True).click();expect(seller.get_by_text(re.compile('Password changed. Other sessions'))).to_be_visible(timeout=20000)
  seller.locator('main').get_by_role('button',name='Sign out',exact=True).click();seller.wait_for_url(BASE+'/');go(seller,'/account');assert '/signin' in seller.url
  go(seller,'/signin');seller.get_by_label('Email',exact=True).fill(email);seller.get_by_label('Password',exact=True).fill(newpw);seller.locator('form').filter(has=seller.locator('#email')).get_by_role('button',name='Sign in',exact=True).click();seller.wait_for_url('**/account',timeout=30000);print('PASS password change, signout, guest protection, signin')
  go(seller,'/sell');title='QA Supabase '+secrets.token_hex(4)
  for key,val in {'title':title,'district':'Huai Khwang','areaSqm':'60','askingPriceThb':'3000000'}.items():seller.locator('#'+key).fill(val)
  seller.get_by_role('button',name='Publish listing',exact=True).click();seller.wait_for_url('**/listing/*?created=1',timeout=30000)
  listing_path=seller.url.split(BASE)[1].split('?')[0]
  seller.get_by_role('button',name='Open offer room',exact=True).click();seller.wait_for_url('**/offers',timeout=30000);print('PASS listing creation and offer room')
  buyer=b.new_context().new_page();signup(buyer,'Browser QA Buyer');go(buyer,listing_path+'/offers')
  buyer.get_by_label('Your offer (THB)',exact=True).fill('2800123');buyer.get_by_role('button',name='Submit sealed offer',exact=True).click();expect(buyer.get_by_role('status')).to_contain_text('sealed',timeout=20000)
  go(seller,listing_path+'/offers');assert '2,800,123' not in seller.locator('main').inner_text();print('PASS buyer submits; seller amount hidden')
  seller.get_by_role('button',name=re.compile('Close round and compare')).click();expect(seller.get_by_role('button',name='Accept',exact=True)).to_be_visible(timeout=60000)
  expect(seller.locator('main')).to_contain_text('2,800,123');seller.get_by_role('button',name='Accept',exact=True).click();expect(seller.locator('main')).to_contain_text('accepted',timeout=20000)
  go(seller,listing_path);expect(seller.locator('main')).to_contain_text('QA Supabase');print('PASS close, compare, accept, listing persists across navigation')
  print('QA listing ID:',listing_path.split('/')[-1])
  go(seller,'/sell');seller.get_by_label('Property type',exact=True).select_option('house')
  for key,val in {'title':'QA Co-buy '+secrets.token_hex(4),'district':'Bang Yai','areaSqm':'120','askingPriceThb':'3000000'}.items():seller.locator('#'+key).fill(val)
  seller.get_by_role('checkbox',name=re.compile('Allow co-buying')).check();seller.get_by_role('button',name='Publish listing',exact=True).click();seller.wait_for_url('**/listing/*?created=1',timeout=30000)
  cobuy_listing=seller.url.split(BASE)[1].split('?')[0]
  go(buyer,'/account/settings');buyer.get_by_role('button',name='Link my U-topia membership (demo)',exact=True).click();expect(buyer.get_by_role('button',name='Unlink membership (demo)',exact=True)).to_be_visible()
  go(buyer,cobuy_listing);buyer.get_by_role('button',name='Start a co-buy group',exact=True).click();buyer.wait_for_url('**/cobuy/*',timeout=30000)
  buyer.get_by_label('Amount (THB, test money)',exact=True).fill('1000000');buyer.get_by_role('button',name='Commit test money',exact=True).click();expect(buyer.get_by_role('status')).to_contain_text('Committed',timeout=20000)
  group_path=buyer.url.split(BASE)[1];go(buyer,group_path);expect(buyer.locator('#funding')).to_have_attribute('value','1000000')
  go(buyer,'/account/wallet');expect(buyer.get_by_role('region',name='Balance')).to_contain_text('4,000,000');print('PASS co-buy creation, commitment, reload and wallet balance')
  print('QA co-buy listing ID:',cobuy_listing.split('/')[-1])
  go(seller,'/sell?listing='+listing_path.split('/')[-1])
  seller.locator('#listing-photo').set_input_files({'name':'qa-photo.png','mimeType':'image/png','buffer':base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=')})
  seller.get_by_role('button',name='Upload photo',exact=True).click();expect(seller.get_by_text('Photo uploaded.',exact=True)).to_be_visible(timeout=20000)
  go(buyer,listing_path);expect(buyer.get_by_role('img',name='Property photo',exact=True)).to_be_visible();print('PASS browser photo upload and display')
  buyer.get_by_role('button',name='Contact seller',exact=True).click();buyer.wait_for_url('**/messages/*',timeout=30000);thread=buyer.url.split(BASE)[1]
  go(seller,thread)
  expect(seller.get_by_text('Live updates connected',exact=True)).to_be_visible(timeout=30000);expect(buyer.get_by_text('Live updates connected',exact=True)).to_be_visible(timeout=30000);print('PASS both browser subscriptions ready')
  buyer.get_by_label('Message',exact=True).fill('Browser QA live hello');buyer.get_by_role('button',name='Send message',exact=True).click()
  expect(seller.get_by_text('Browser QA live hello',exact=True)).to_be_visible(timeout=20000)
  seller.get_by_label('Message',exact=True).fill('Browser QA live reply');seller.get_by_role('button',name='Send message',exact=True).click();expect(buyer.get_by_text('Browser QA live reply',exact=True)).to_be_visible(timeout=20000)
  print('PASS two browsers exchange live messages')
  go(seller,'/notifications');seller.get_by_role('button',name='Mark all as read',exact=True).click();expect(seller.get_by_role('link',name='Notifications (0)',exact=True)).to_be_visible(timeout=20000);print('PASS notification count clears live')
  for page in [seller,buyer]:
   go(page,'/account/settings');page.locator('main').get_by_role('button',name='Sign out',exact=True).click();page.wait_for_url(BASE+'/')
  b.close()
 assert local_store_hash() == before, 'Hosted flows modified the local JSON store'
 print('PASS local JSON store unchanged')




except Exception as error:
 trace=error.__traceback__
 while trace:
  if trace.tb_frame.f_code.co_filename==__file__:print("Failure at browser test line",trace.tb_lineno)
  trace=trace.tb_next
 print("FAIL browser smoke ("+type(error).__name__+"). Reproduce the last reported step; credential-bearing call logs suppressed.")
 raise SystemExit(1) from None
