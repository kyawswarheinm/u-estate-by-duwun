# PARTNERS: ElevenLabs, Tokenomist and Avalanche in U-Estate

**Why this file exists:** the judging criterion "Innovation & ecosystem (5%)" asks for *an original idea plus meaningful use of a partner: Tokenomist, ElevenLabs or Avalanche*. U-Estate uses all three, and each one does real work in the product.
**Decisions:** D-01 (amended), D-33 to D-38 in [DECISIONS.md](DECISIONS.md). If anything here conflicts with DECISIONS.md, DECISIONS.md wins.
**Status (Thu 15 Oct, 23:10):** everything below is **built in the prototype** and tested with the fallbacks. Live partner calls still need the keys from §7.

## 0. Pitch paragraphs (for the deck, submission form and judges)

**ElevenLabs**
- **The company is** the leading AI voice platform: lifelike speech in 70+ languages, speech-to-text (Scribe), and real-time voice agents.
- **We will use it to** let people *talk* to U-Estate instead of reading property paperwork:
  - hear every price and risk explanation in Thai, Arabic, Chinese, Spanish or English
  - search for a home by voice
  - hold a live voice conversation with an agent that looks up real listings, fees and rules and opens the right page while you talk
- **The product becomes** a property marketplace anyone can use by voice, in their own language, including first-time buyers and foreigners who can't read Thai documents.

**Tokenomist**
- **The company is** the token-unlock and emission data platform: it tracks when locked crypto tokens are released to investors and teams, which can push prices down.
- **We will use it to** protect U-topia members who plan to sell crypto to pay a deposit or a co-buy share. Before they commit, U-Estate checks upcoming unlocks for that token before their payment date. It then shows a risk level and a safety buffer ("hold ฿600,000 of the token, or convert now, so your ฿400,000 is safe"). U-Estate never accepts crypto itself.
- **The product becomes** the first property marketplace that understands crypto-funded buyers and keeps their deposit safe, instead of letting a token unlock break a home purchase.

**Avalanche**
- **The company is** a fast, low-cost public blockchain (C-Chain is EVM-compatible), with the Fuji test network for builders.
- **We will use it to** publish a SHA-256 fingerprint of our transparency ledger on Avalanche Fuji, so anyone can check, with one click and a public explorer link, that U-Estate never edited old records. Only the fingerprint goes on-chain: no names, no money, no tokens.
- **The product becomes** a marketplace whose transparency is *provable*, not just promised: even U-Estate can't quietly change the history of offers, co-owner shares and loans.

## 1. Summary

| ID | Partner | Feature | Where in the app | Main files | Fallback without a key |
|---|---|---|---|---|---|
| E1 | ElevenLabs | Listen to explanations in 5 languages (TTS, Eleven v3) | Listing → *Explain this price* → 🔊; chat answers → 🔊; voice-search answer | `api/voice/tts`, `components/speak.ts`, `ExplainVoice.tsx` | Browser `speechSynthesis` (labelled) |
| E2 | ElevenLabs | Voice search (Scribe STT `scribe_v2`) | Home → *Ask for a home* → 🎙 Speak | `api/voice/stt`, `api/search`, `lib/search.ts`, `VoiceSearch.tsx` | Browser speech recognition, then typing; keyword parser without Claude |
| E3 | ElevenLabs | **Live voice conversation** (ElevenLabs Agents, WebRTC) with read-only tools and page navigation | *Talk to U-Estate* button on every page | `api/voice/agent-token`, `api/agent-tools`, `lib/assistant-tools.ts`, `VoiceAgentDock.tsx`, `scripts/create-voice-agent.mjs` | Message + link to typed chat |
| Chat | Anthropic | **Real-time typed chat** (Claude tool runner, streamed), same tools as E3 | `/assistant` (*Ask AI*) | `api/assistant`, `AssistantChat.tsx` | "AI not connected" notice |
| T1 | Tokenomist | "Can my crypto fund this deposit?" unlock-risk check | Co-buy group → join card; offer room → under the offer form; voice agent and chat tool | `api/token-check`, `lib/token-risk.ts` (+tests), `lib/tokenomist.ts`, `TokenCheck.tsx` | 3 fictional **SAMPLE** tokens (`sample-cliff`, `sample-drip`, `sample-steady`) |
| A1 | Avalanche | Ledger fingerprint published on Fuji; one-click verify | `/ledger` → *Tamper check on Avalanche* | `lib/ledger-hash.ts` (+tests), `lib/avalanche.ts`, `api/anchor`, `api/anchor/verify`, `AnchorPanel.tsx` | Fingerprint still computed and shown; "not connected" notice |
| — | All | Honest status + "what data we send" page | `/partners` (nav: *Partners*) | `app/partners/page.tsx`, `lib/partners.ts` | n/a (it is the status) |

## 2. ElevenLabs

### E1: Text to speech

- `POST /api/voice/tts {text}` → `audio/mpeg`. Model `ELEVENLABS_MODEL_ID` (default `eleven_v3`: it speaks Thai; Multilingual v2 and Flash v2.5 don't). Voice `ELEVENLABS_VOICE_ID`.
- The server caches the last 60 clips in memory (sha256 of voice+model+text), so replays during the demo are instant and free.
- Limit: 20/min per IP. No key → 501 → the client uses `speechSynthesis` with the right BCP-47 tag (`th-TH`, `ar-SA`, `zh-TW`, `es-ES`, `en-US`). The UI says which voice played.
- *Explain this price* now takes 5 languages (`/api/explain {listingId, lang}`); Claude writes the text from the code's facts block only.

### E2: Voice search

1. Browser records with `MediaRecorder` (max 15 s) → `POST /api/voice/stt` (multipart `audio`, optional `language`) → ElevenLabs Scribe `POST /v1/speech-to-text`, `model_id=scribe_v2`.
2. The transcript is sent to `POST /api/search {query, locale}`:
   - If Claude is connected, `parseSearchQuery` (structured output, `SearchFiltersSchema`) reads the sentence into filters. Otherwise the keyword parser `parseQueryFallback` is used. It understands the 5 languages' common words, "4.5 million", "6 ล้าน", "400萬" and sizes.
   - **Code** filters the listings (`searchListings`) and writes the spoken answer (`spokenSummary`, 5 languages). Numbers in the answer can't be wrong.
3. The answer is spoken with E1.
- Recordings are forwarded once and never stored. If STT returns 501, the browser's own speech recognition is used where available; typing always works.

### E3: Live voice conversation (ElevenLabs Agents)

```
Browser (VoiceAgentDock, in the root layout so it survives navigation)
  ├─ GET /api/voice/agent-token  → server calls ElevenLabs /v1/convai/conversation/token (API key never reaches the browser)
  ├─ WebRTC session ⇄ ElevenLabs agent (ASR → LLM → TTS, interruptible)
  └─ agent calls client tools → browser → POST /api/agent-tools {tool, input} → lib/assistant-tools.ts (zod-validated, read-only)
                                 └─ open_page {path} → router.push (whitelisted paths only)
```

**Tools** (names must match in 3 places: `scripts/create-voice-agent.mjs`, `VoiceAgentDock.tsx`, `lib/assistant-tools.ts`):

| Tool | Purpose |
|---|---|
| `search_listings` | Filters or the user's words → at most 5 listings |
| `get_listing_facts` | Asking price, appraisal (source and date), estimate range, risks, fees, deed check, co-buy status, foreign quota |
| `compute_fees` | Our fee vs a typical agent |
| `check_token_unlocks` | T1 |
| `get_cobuy_rules` | Legal lanes and governance |
| `open_page` | Navigate the user's browser |

None of these tools can move money, make offers, sign anything or write to the ledger.

**Session:** `startSession({ conversationToken, connectionType: "webrtc", dynamicVariables: { user_name, locale_name, current_page }, overrides: { agent: { language, firstMessage } } })`. Overrides are sent only for non-English. Page changes are sent with `sendContextualUpdate`. Users can also type into the live session (`sendUserMessage`).

**Create the agent (≈5 min):**
1. Get the API key (Creator-plan coupon: ElevenLabs Discord → `#coupon-codes`, using the registration email).
2. Run `node scripts/create-voice-agent.mjs` with `ELEVENLABS_API_KEY` set. It creates the 6 client tools (`POST /v1/convai/tools`, `expects_response: true`) and the agent (`POST /v1/convai/agents/create` with `tool_ids`, TTS `eleven_v4_turbo`), and prints `ELEVENLABS_AGENT_ID`.
3. In the ElevenLabs dashboard, check:
   - **Security → Overrides:** *Language* and *First message* are on (the script tries to set them).
   - The voice model speaks Thai (`eleven_v4_turbo`, `eleven_v3` and `eleven_v3_conversational` list Thai; Flash v2.5 and Multilingual v2 don't).
   - Optional: pick Claude as the agent LLM.
4. Put `ELEVENLABS_AGENT_ID` in `.env.local` / Vercel. Then test: one call per language, and one call that uses each tool.
- **If the script fails** on a field, create the agent by hand with the same prompt, first message and tool definitions from the script. The dynamic variables `{{user_name}}`, `{{locale_name}}` and `{{current_page}}` must exist in the prompt.

**Safety:**
- read-only tools
- zod validation
- path whitelist for `open_page`
- rate limits: token 6/min, tools 60/min
- the prompt forbids asking for passwords or bank details and warns about off-platform deposits
- the panel says "cannot move money or sign anything"

### Real-time typed chat (Claude), the same brain with typing

- `POST /api/assistant {locale, messages[]}` → NDJSON stream (`text`, `tool`, `done`, `error`). It uses `client.beta.messages.toolRunner` with `betaZodTool` over the same `ToolInputs`, `stream: true`, `effort: low`, `max_iterations: 6` and server-side fallback (`fallbacks: "default"`).
- `/assistant` shows tool chips ("Checked token unlocks (Tokenomist)") and makes `/listing/…` links clickable. Each answer has 🔊 (E1).
- This is the MVP of FR-ASSIST-01 / T09 on the JSON store. T09 still ports the tools to Supabase and adds the stress-test and district tools.

## 3. Tokenomist (T1)

**Data:** Tokenomist API v5, `x-api-key` header (server only):
- `GET /v5/token/list`: `id`, `symbol`, `name`, `marketCap`, `maxSupply`, `totalLockedAmount`, `tbdLockedAmount`, `unlockedAmount`, `untrackedAmount`, `lastUpdatedDate`. Cached 1 h, 1 credit.
- `GET /v5/unlock/events/{tokenId}?start&end&pageSize=100`: `unlockDate`, `cliffUnlocks.cliffAmount`, `cliffValue`, `valueToMarketCap` (%), `allocationBreakdown[].allocationName`.

**Rules (R13, `lib/token-risk.ts`, 7 unit tests). Code decides; AI only explains:**

| Step | Rule |
|---|---|
| Window | Today → payment date **+ 7 settle days** (time to sell, convert to THB and transfer) |
| High | Unlocks in the window total **≥ 5%** of market cap, **or** a single unlock is **≥ 3%** |
| Medium | Total **≥ 1%**, or any unlock in the window has an unknown value |
| Low | Nothing in the window, or the supply is fully unlocked |
| Unknown | Token not tracked, Tokenomist not connected, **or** supply still locked but no future dates returned (the free trial only returns past unlocks) |
| Buffer (assumption, labelled) | Hold token value = deposit × (1 + 15% low / 30% medium / 50% high or unknown), or convert now |
| Always shown | "U-Estate never accepts crypto; convert to THB through a licensed exchange before you commit"; FET reminder for foreign condo buyers; "risk information, not investment advice" |

**Plan and licence (check at the Tokenomist booth):**
- The **free trial returns only past unlocks**, so live checks show *Unknown* on locked tokens. The **Pro** plan adds 1 year forward (1,000 credits/month).
- All plans below Enterprise are **non-commercial use**. The demo is fine; production needs Enterprise or a partnership.
- Ask for a hackathon key. **Without a key:** the 3 SAMPLE tokens, fictional with dates relative to today, are labelled SAMPLE everywhere.

**Legal fit:**
- Thai regulators restrict crypto as a means of payment for goods and services (SEC rules since 2022; confirm with the lawyer), which is one reason U-Estate never takes crypto.
- The deposit is always THB (test money in the demo).
- T1 is planning information for buyers who convert *before* paying.

## 4. Avalanche (A1)

**How it works:**
1. `lib/ledger-hash.ts` computes `hash_n = sha256(hash_{n-1} + "\n" + canonicalJSON(entry_n))`, starting from 64 zeros. Changing or deleting any old entry changes every later hash (unit-tested).
2. `POST /api/anchor` sends one **0-AVAX transaction to our own address** on **Fuji (chain 43113)**. The data is readable UTF-8: `U-Estate transparency ledger v1 | entries 1-N (N) | sha256 <hex>`. It waits for the receipt (≈2 s) and stores `{upToEntryId, headHash, txHash, explorerUrl}` in `anchors`.
3. `GET /api/anchor/verify` recomputes the fingerprint from today's ledger, reads the transaction back from the chain (viem `getTransaction`) and returns `verified | mismatch | chain_unreachable`. Anyone can also open the SnowTrace link and view the input as UTF-8.

**Boundaries (D-01 amended, D-33):**
- No tokens, NFTs, smart contracts, user wallets or crypto payments.
- No personal data on-chain: the hash is of the whole chain head, not of single entries.
- The chain is **hard-coded to Fuji** in code, so it can't touch mainnet.
- It proves *"not edited after publishing"*. It does **not** prove an entry was true, and it doesn't replace Land Office registration.

**Setup (≈10 min):**
1. Make a **new throwaway wallet**. Never use one that holds real funds:
   ```bash
   node -e "import('viem/accounts').then(({generatePrivateKey,privateKeyToAccount})=>{const k=generatePrivateKey();console.log('AVALANCHE_PRIVATE_KEY='+k);console.log('address',privateKeyToAccount(k).address)})"
   ```
   Put the key only in `.env.local` / Vercel env.
2. Fund the address with test AVAX:
   - Faucet: `build.avax.network/console/primary-network/faucet`. It may need a login or a coupon code; ask the Avalanche/Team1 booth.
   - Each anchor costs a tiny amount of test AVAX.
3. Restart. On `/ledger`, make one action, then press **Publish fingerprint to Avalanche**, then **Verify last fingerprint**.

**Production:**
- Run an hourly Vercel Cron job (`POST /api/anchor`, protected by `CRON_SECRET`), plus a reviewer-only manual button.
- Use the `ledger_anchors` table ([DATA_MODEL.md](DATA_MODEL.md) §2a) and the `ledger_entries.entry_hash` column filled by a trigger.
- The current demo button is open to everyone and rate-limited to 3/min.

## 5. Data we send to partners (shown on `/partners`)

| Partner | Data |
|---|---|
| ElevenLabs E1 | Explanation text only |
| ElevenLabs E2 | The voice recording for one request; not stored by us |
| ElevenLabs E3 | Voice, display name, current page path, tool results (listing facts, fees) |
| Tokenomist | Only the token name the user types (no identity, no amounts) |
| Avalanche | Only the SHA-256 fingerprint |
| Anthropic | Deed photo, listing facts, chat questions |

## 6. Failure modes (the demo must never break)

| Failure | What the user sees |
|---|---|
| No ElevenLabs key | Browser voice (labelled); browser speech recognition or typing; dock says the agent is not connected and links to the typed chat |
| Agent language not enabled | Session error in the dock → enable the overrides, or start in English |
| Mic blocked | Clear message; typing works everywhere |
| No Tokenomist key or forward data | SAMPLE tokens; *Unknown* level with the reason |
| No Avalanche key / no test AVAX / RPC down | Fingerprint still shown; message says what's missing ("needs test AVAX from the Fuji faucet") |
| No Claude key | Keyword search parser, template explanations, chat notice |
| Rate limit | 429 with a friendly message |

## 7. Team setup checklist (Fri morning, before freeze)

| # | Step | Owner | Time |
|---|---|---|---|
| 1 | Redeem the ElevenLabs coupon; create the API key; pick a voice that sounds good in Thai | B | 10 min |
| 2 | `node scripts/create-voice-agent.mjs`; dashboard checks (§2 E3); `ELEVENLABS_AGENT_ID` | B | 10 min |
| 3 | Test a call in EN, TH, AR, ZH, ES; note which languages work in Open questions | D | 15 min |
| 4 | Tokenomist booth: ask for a hackathon/Pro key with forward unlock data; test `arbitrum` | B | 15 min |
| 5 | Throwaway Fuji wallet + faucet; first anchor + verify | A | 10 min |
| 6 | Put all keys in Vercel env (never in git); redeploy; check `/partners` shows **Live** | A | 10 min |
| 7 | Before stage: reset demo → do the demo actions → **publish the anchor** → open the explorer tab | D | 5 min |
| 8 | After submission: ElevenLabs showcase PR (showcase.elevenlabs.io) + 20-second feedback form (swag) | any | 15 min |

## 8. Demo beats and judge Q&A

**Beats** (fits the 5-minute script in [DEMO_SCRIPT.md](DEMO_SCRIPT.md)):
- **Home:** press 🎙, say *"หาคอนโดไม่เกิน 4 ล้าน"*. Results appear, and the answer is spoken in Thai (E2 + E1).
- ***Talk to U-Estate*** in Arabic: *"Show me the Sathorn condo and the fees for a member."*
  - The agent calls `search_listings` → `get_listing_facts` → `open_page`, and the page opens while it talks (E3).
- **Co-buy as Daniel:** *Paying with crypto?* → `sample-cliff`, ฿1,000,000, 14 days.
  - Result: **High**, 4.2% unlock before payment, hold ฿1,500,000 or convert now (T1).
- **Ledger:** *Publish fingerprint* → explorer link → *Verify* → ✓ Verified (A1).

**Q&A:**

| Question | Answer |
|---|---|
| Why voice? | Property documents are hard to read, especially in a foreign language. Voice in 5 languages makes every fact accessible, and the agent only speaks numbers our code computed |
| Is Tokenomist really useful for property? | U-topia's community holds crypto. A token unlock before the payment date can wipe out a deposit plan. We warn before they commit, and we never accept crypto |
| Isn't blockchain against your "no blockchain" rule? | We use no tokens, no wallets and no payments. Avalanche is only a public notary for a fingerprint, which makes our transparency checkable by anyone |
| What if the agent says something wrong? | Its tools are read-only and return code-computed numbers. It can't move money, and the page shows the same numbers |

## 9. Other improvements found while building

| ID | Improvement | Status |
|---|---|---|
| I-01 | **Sealed-offer leak:** the public ledger showed sealed offer amounts. It now records no amount for `offer_submitted` (amount stays sealed until close) | ✅ Fixed in prototype |
| I-02 | **Data-loss bug:** pages and API routes held separate in-memory copies of the JSON store, so an API write could overwrite newer data. The store now re-reads the file and writes atomically | ✅ Fixed in prototype |
| I-03 | Rate limits on every paid partner/AI route | ✅ Prototype (in-memory); Supabase counter in production |
| I-04 | `/partners` honest status + data-sharing table (transparency for *every* party) | ✅ Prototype |
| I-05 | TTS audio cache | ✅ Prototype |
| I-06 | Typed real-time chat (FR-ASSIST-01 MVP) | ✅ Prototype; T09 finishes it on Supabase |
| I-07 | **U-Bot is worth 5%, as much as the partner criterion.** Ask staff again Friday 09:00; the slot is ready | ⏳ T27 (blocked) |
| I-08 | Persist anchors and per-entry hashes in Supabase; hourly cron | ⏳ T32 |
| I-09 | Translate the new components' UI strings (5 locales) and restyle with the Figma tokens | ⏳ T33 |
| I-10 | Pre-warm the demo audio and explanations; record the backup video with voice | ⏳ T22 |
| I-11 | Daily spend caps per partner (env `*_DAILY_LIMIT`) so a public URL can't burn credits | ⏳ T36 |
| I-12 | Voice-agent evaluation: 10 scripted spoken questions → correct tool ≥ 9/10, no invented numbers | ⏳ T29 |
| I-13 | Rotate all keys after the event; delete the Fuji wallet key | ⏳ after finals |
