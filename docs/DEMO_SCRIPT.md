# DEMO_SCRIPT: live presentation (finalists 20:00) and submission video

**Setup before going on stage:**
- Deployed URL open in **two browser windows**: left = Khun Malee (seller, Thai UI), right = Layla (buyer, Arabic UI).
- Press **Reset demo** (`/review`), then warm the AI cache: open each listing once in EN, TH and AR.
- Phone hotspot ready. The backup video is on the desktop.
- **Partners:** `/partners` shows **Live** for ElevenLabs (E1–E3), Tokenomist and Avalanche. If one is not live, say so honestly; the fallback still works.
- **Before going on stage:**
  - do the demo actions once
  - press **Publish fingerprint to Avalanche** on `/ledger`
  - open the explorer tab
  - put a headset mic on the presenter's laptop for the voice agent (venue noise)

**Accounts:**
- Judges can **create an account live** at `/signup` with any made-up email (e.g. anythings@example.com), list a property at `/sell`, and find it again under **My properties** after signing back in.
- For the scripted story, use the one-click personas at `/signin` (`DEMO_MODE` on):

| Persona | Role | Notes |
|---|---|---|
| Khun Malee | Seller | Thai |
| Somchai, Ploy | Members | Thai |
| Daniel | Member | Australian |
| Aiko | Member | Japanese |
| Layla | Member | Emirati, Arabic UI |
| Narin | Not a member | Thai |
| Reviewer | Admin | |

## The 5-minute story (one beat per minute)

1. **Problem (30 s, slide 1):** "Agents take 3%, listings can be fake, and offers are chosen behind closed doors. Thai agents need no licence. U-Estate shows every party the same facts and fees."

2. **Find & trust (60 s):** Home → press 🎙 and say *"หาคอนโดไม่เกิน 4 ล้าน"* (E2). Results appear and the answer is spoken in Thai (E1). Then open the condo.
   - Show the fair-value range and badge, then "Why this price?".
   - Show the Model Card link: "these accuracy numbers are measured on our demo dataset, here's the test".
   - Then show the **scam-alert** listing: "35% below our estimate, so we warn and send it to human review".

3. **Ask & understand (60 s):** press **Talk to U-Estate**, choose العربية, and say: *"Show me the Sathorn condo and the fees for a U-topia member."*
   - The live agent (E3) calls `search_listings` → `get_listing_facts` → `open_page`. The page opens while it talks; tool chips show in the panel.
   - Fallback: type the same question at `/assistant` (streams with tool chips).
   - Show the **stress-test card** (Severe preset) and play the Thai voice explanation (E1).

4. **Talk & offer (60 s):** Layla messages the seller in Arabic. Malee sees it in Thai, with "See original".
   - A scam-phrase example shows the warning banner.
   - FairOffer: sealed offers → close → "the strongest offer may not be the highest" → Accept → ledger.

5. **Co-buy & ecosystem (60 s):** U-topia members co-buy the condo.
   - As Daniel, open *Paying with crypto?* → `sample-cliff`, ฿1,000,000, 14 days. It shows **High**: a 4.2% unlock before payment, so hold ฿1,500,000 or convert now (T1, Tokenomist). Use a live token if T30 is done.
   - Daniel and Aiko get the foreign quota and FET notice.
   - Narin is blocked (not a member).
   - House: Daniel can only lend, at ≤ 15%.
   - Ledger: "what you see = what is registered". Press **Verify last fingerprint**: ✓ Verified, plus the Avalanche explorer link (A1): "even we can't edit history".
   - Close with slide 4 (fees: ฿120k agent vs ฿60k / ฿30k member, buyer ฿0).

## Market segment (60 s, after beat 2 or instead of beat 4 if time is short)

**Before stage:** open `/market` once (warms the map tiles); check `/partners` shows the voice agent **Live**. Read every number from the screen: the market snapshot may be replaced by real data, so don't memorise figures.

1. **Ask by voice (20 s):** press **Talk to U-Estate** and say *"How are condo prices in Sathorn?"*
   - The agent calls `get_market_stats` (tool chip *Checked market asking prices*) and says the median asking price per m², the range, how many listings, and "asking prices on listing websites". It says SAMPLE while the snapshot is a sample.
   - Then say *"Will they go up next year?"*: `get_price_forecast`, a **range** with the model name, "a forecast, not a guarantee".
   - Say *"Yes, open the map"*: `open_page /market`.
   - Fallback: the **Ask the AI about this market** button on `/market` opens the typed chat with the question filled in.
2. **The map (25 s):** on `/market`:
   - U-Estate listings come first (dark squares); other websites' listings are grey circles, "not checked by U-Estate", with a link to the source, and **never a photo** (facts only).
   - Type *Sathorn* in **Search location**, press **Show on map** on a card: the map flies there and opens it. Press **3D view** for the buildings.
   - Scroll to the forecast chart: "the shaded band is the 80% range, not a promise".
3. **Back to the listing (15 s):** open the Sathorn condo. Under the price: *"Compared with N asking prices in Sathorn: X% below the median"*. "Code computes it; the AI only reads it out."

**Optional 30-second beat (if a judge asks "can I try it?"):**
1. Create an account with a made-up email.
2. Sell → publish a listing.
3. The owner bar appears → Open offer room.
4. Account menu → Wallet (฿5,000,000 test money).

## Judge Q&A, short answers

| Question | Answer |
|---|---|
| Is the price prediction real? | A hedonic regression with a conformal range, tested on a held-out time period. Today's data is synthetic and labelled; the method and the measurement are real. Next step: official and partner data |
| Is co-buying legal? | Condo co-ownership within the 49% foreign quota; foreigners can only lend on land, at a fixed rate up to 15%; no nominee structures. A Thai lawyer must review the agreements before launch |
| Is the money real? | No. It's test money in a demo wallet. Real funds would go through a licensed escrow or payment partner. We never store bank numbers or take crypto |
| Where are passwords kept? | Only as salted scrypt hashes. The demo refuses real inboxes like Gmail. Production uses Supabase Auth |
| How do you make money? | 1.5% from sellers (0.75% for U-topia members) vs a typical 3%; buyers pay ฿0; optional paid trust services |
| What does AI do vs code? | Code computes every rule and number; AI reads documents, explains, translates and summarises; humans confirm |
| U-topia integration? | Members-only co-buy and member fees today; U-Bot slot when access is given |
| How do you use the partners? | ElevenLabs: voice in 5 languages, voice search and a live agent with real tools. Tokenomist: protects crypto-funded deposits from token unlocks. Avalanche: public fingerprint of our ledger. Details on `/partners` |
| Isn't Avalanche against "no blockchain"? | No tokens, no wallets for users, no payments: Avalanche is only a public notary for one fingerprint |
| Do you accept crypto? | Never. We help members who sell crypto *before* paying in THB |
| Where do the market prices come from? | A dated snapshot of public listing pages, collected politely (robots.txt, one request every 2 seconds), facts only: no photos, descriptions or agent contacts. Every row links to its source and says "not checked by U-Estate". If the page still says SAMPLE, say so: it's the agreed fixture. In production: licensed feeds |
| Is the forecast reliable? | It's a range (p10–p90), never a single promise. The page names the model and the index it used: Google TimesFM on the Bank of Thailand index when that run is in, otherwise a labelled fallback, and the backtest only if one was measured. Check the provenance line before answering |
| Why are the pictures drawings? | Sample listings use original illustrations, labelled "Illustration". Real sellers upload photos, which replace them. We never copy photos from other websites |
