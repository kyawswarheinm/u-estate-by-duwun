# U-Estate (U-Hackathon 2026 demo)

**U-Estate is a transparent, AI-guided Thai property marketplace.** It gives every party the same facts and the same fees:
- verified listings
- honest price ranges with sources
- offers compared by rules published in advance
- legal co-buying for U-topia community members
- **talk to it:** voice explanations in 5 languages, voice search and a live voice agent (ElevenLabs)
- **crypto-deposit check:** token unlocks before you pay (Tokenomist)
- **provable history:** the ledger's fingerprint published on Avalanche Fuji
- **accounts:** sign up with any made-up email, list and manage your own properties, and use a test-money wallet

> **Demo only:** every person, property, document and baht is a sample or test money. Not financial or legal advice.

## New here? (second team / your AI)

1. Read **[docs/HANDOFF.md](docs/HANDOFF.md)**: what is done, who owns what, what to do next.
2. Read [CONTRIBUTING.md](CONTRIBUTING.md): branches, PRs, `npm run check`, and the **never-commit list** (keys, `.env.local`, `.data/`, real personal data).
3. Read [AGENTS.md](AGENTS.md): rules for every AI agent. Specialist agents are in `.claude/agents/`.
4. Database: **[docs/DATABASE.md](docs/DATABASE.md)**. The real-time Supabase backend is in `supabase/migrations`, verified with `npm run db:verify`, with the setup and wiring plan.

## Docs for AI development

`AGENTS.md` → `docs/DECISIONS.md` → `docs/IMPLEMENTATION_PLAN.md` (tasks T01–T27). Specs:
- `docs/PRD.md`
- `docs/TRD.md`
- `docs/DATA_MODEL.md` (Supabase SQL + RLS)
- `docs/API.md`
- `docs/AI_SPEC.md` (predictive, assistant and market-risk AI)
- `docs/UI_SPEC.md` (Figma design system; source in `docs/design-reference/`)
- `docs/DEMO_SCRIPT.md`
- `docs/PARTNERS.md` (ElevenLabs, Tokenomist, Avalanche: pitch paragraphs, setup, fallbacks)

## Run it

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY (and optionally ElevenLabs keys)
npm run dev                  # http://localhost:3000
npm test                     # business-rule tests
npm run check                # everything: typecheck, lint, tests, database checks, secret scan
```

Without `ANTHROPIC_API_KEY`:
- the price explainer falls back to the raw facts
- the deed check shows a clear "AI not connected" message

Every partner is optional. `/partners` shows what is live:

| Missing | Fallback |
|---|---|
| `ELEVENLABS_API_KEY` | Browser voice, browser speech recognition, or typing |
| `ELEVENLABS_AGENT_ID` | *Talk to U-Estate* points to the typed chat. Create the agent with `node scripts/create-voice-agent.mjs` |
| `TOKENOMIST_API_KEY` | Three SAMPLE tokens: `sample-cliff`, `sample-drip`, `sample-steady` |
| `AVALANCHE_PRIVATE_KEY` | The fingerprint is computed and shown but not published. Use a **throwaway** Fuji wallet with faucet AVAX |

## Accounts (demo)

- `/signup`: any non-real email works (e.g. anythings@example.com); Gmail and other real inboxes are refused. The password is stored only as a salted hash in `.data/db.json`.
- `/signin`: sign in again later with the same email and password. Demo personas (Khun Malee, Somchai, Daniel…) are one click away while `DEMO_MODE` is not `false`.
- The account menu (avatar, top right) opens:
  - **My properties**
  - **Wallet** (test money; add more; payout preference; per-commitment limit)
  - **Account settings** (profile, password, U-topia membership link for the demo)
- **Reset demo data** keeps signed-up accounts and their listings.

## 3-minute demo script

1. **Check a deed** (`/sell`): download a sample deed from the page links, then upload it.
   - Clean Chanote → "Deed checked (sample)"
   - Land-reform certificate or name-mismatch deed → "Needs human review", with reasons
2. **Listing** (`/listing/l-condo`): asking price vs official appraisal vs index-adjusted estimate (source and date on each), the chart, "Explain this price" / อธิบายเป็นภาษาไทย / 🔊 Listen, the risk checklist, and "Who pays what" (1.5% vs 0.75% member vs 3% typical agent; buyer ฿0).
3. **FairOffer** (`/listing/l-condo/offers`):
   - As Somchai, make a sealed offer.
   - Switch to **Khun Malee** and close the round. The ranking follows the published weights; the highest price isn't automatically first.
   - Accept an offer.
4. **Co-buy condo:** as Somchai, start a group and commit ฿1M. Then:
   - Switch to Narin: blocked, not a member.
   - Ploy, Daniel and Aiko each commit ฿1M. The foreign quota meter updates, the FET notice appears, and the group is fully funded.
5. **Co-buy house** (`/listing/l-house`):
   - Daniel can't be a co-owner (foreign land rule).
   - 16% interest is blocked.
   - 7% as a lender works and shows a loan schedule.
6. **Transparency ledger** (`/ledger`): every action, registered rights only, nothing hidden.
   - **Publish fingerprint to Avalanche**, then **Verify** (A1).
7. **Partners:**
   - Home → 🎙 *"หาบ้านไม่เกิน 6 ล้าน"* (E2 + E1)
   - **Talk to U-Estate** (E3)
   - `/assistant` typed chat
   - co-buy or offer room → *Paying with crypto?* → `sample-cliff` (T1)
   - `/partners`

Use **Reset demo data** in the footer before presenting.

## Where the rules live

`src/lib/rules.ts` contains R1–R10:
- fees
- members-only co-buy
- group size
- the foreign land rule
- the condo foreign quota by floor area
- the FET notice
- the 15% interest cap
- governance text
- FairOffer scoring

They're tested in `src/lib/rules.test.ts`. Partner rules are tested too:
- `token-risk.test.ts` (R13)
- `ledger-hash.test.ts` (R14)
- `search.test.ts` (voice-search parser)

**AI never decides these.** It only reads documents and explains numbers computed by code.

## Honest data

- `src/data/index-sample.ts` holds **SAMPLE** index values. Replace them with the Bank of Thailand Residential Property Price Index, then set `isSample: false`. Every chart shows "SAMPLE" until then.
- Appraisal values in `src/lib/seed.ts` are sample values. Real ones come from the Treasury Department's appraisal lookup.

## Storage

`src/lib/store.ts` uses a JSON file (`.data/db.json`, or `/tmp` on Vercel, which resets on cold start). For persistent deployment, move it to Supabase.

## Not built (labelled phase 2)

- real payments or escrow
- real KYC
- Land Office lookup
- U-Bot (slot reserved; staff will provide the API; worth 5% of the score)
- secondary trading
- licensed fund
- the Thai-majority company lane
