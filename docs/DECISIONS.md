# DECISIONS: U-Estate (highest authority)

If any doc disagrees with this file, this file wins. Change a decision only when the team says so, and record the date.
The full history and reasons are kept in the core team's private research notes (not in this repo).

| ID | Decision |
|---|---|
| D-01 | **No crypto payments, tokens, NFTs, smart contracts or user Web3 wallets.** *Amended Thu 15 Oct 2026 (team request):* the only blockchain use is D-33 (a ledger fingerprint on Avalanche Fuji), and the only crypto *data* use is D-34 (Tokenomist, read-only). The Figma design's "testnet invest" stays removed (D-24) |
| D-02 | **No data scraping.** Only official public data, licensed data, partner data shared with consent, user-provided data, or clearly labelled synthetic demo data |
| D-03 | Single country: **Thailand** |
| D-04 | Positioning: **the same facts and the same fees for every party**, against opaque real-estate practices |
| D-05 | Hackathon scoring: execution 40 / practicality 40 / usability 10 / innovation & ecosystem 5 / U-Bot 5 |
| D-06 | Core demo = trust flow: verified listing → AI price & risk explanation (voice) → FairOffer → accept |
| D-07 | All Thai property types in the marketplace; eligibility is checked per type |
| D-08 | "Fractional" = **co-buy groups** (2–10 people) with registered legal rights. No mass fractional investing |
| D-09 | Co-buy is only for **U-topia community members**. Buying, selling and renting are open to all verified users |
| D-10 | A shared property is run by a property manager; co-owners vote only on big decisions |
| D-11 | Exit = group buy-out first (30 days, independent valuation), then sale to another verified member |
| D-12 | Revenue = low success fee + optional paid trust services, with a **public fee calculator** on every listing |
| D-13 | Price data = Bank of Thailand price index + Treasury appraisal + U-Estate's own offers; partner feeds later |
| D-14 | **No nominee structures.** Foreigners never fund land held in Thai names with hidden records |
| D-15 | International lanes: (1) condo co-ownership within the 49% foreign floor-area quota, funds sent from abroad (FET); (2) registered **lender** to Thai co-buyers of houses/land |
| D-15a | Lenders get **fixed interest only**: rate > 0 and ≤ 15%/yr, no share of the property or its price rise |
| D-16 | Co-buy demo uses **test money**. Both scenarios: mixed condo, and house + lender |
| D-17 | U-Bot: staff will give an API/embed. Reserve a drop-in slot; never fake a U-Bot |
| D-18 | **Ledger records only legally registered rights** (co-owner shares, loans, accepted offers). Append-only. No hidden owners |
| D-19 | Demo numbers: sale fee 1.5% (members 0.75%); rental placement 50% of 1 month (members 25%); buyers and tenants free; group 2–10; manager approves repairs ≤ ฿20,000; big decisions > 50% of value; whole sale ≥ 75% + buy-out right; exit window 30 days |
| D-20 | Stack: Next.js (App Router) + Supabase + Vercel; Claude API; ElevenLabs (TTS, Scribe, Agents); Tokenomist API; Avalanche Fuji via `viem` (D-33–D-35) |
| D-21 | **Backend = Supabase:** Postgres + Auth + Storage + Realtime. It replaces the JSON file store for the live demo |
| D-22 | **UI = the Figma "U-Estate Web App Design"** (tokens and fonts in `docs/UI_SPEC.md`; source in `docs/design-reference/`) |
| D-23 | **UI languages: English, Thai, Arabic (RTL), Traditional Chinese, Spanish** (`en`, `th`, `ar`, `zh-Hant`, `es`) |
| D-24 | The design's "Invest from ฿10,000 (testnet)" modal becomes **"Join a co-buy group"** (test money, our ledger) |
| D-25 | **The Model Card shows only metrics we actually measured.** The demo dataset is labelled synthetic until real data exists. No fabricated statistics ("18,000+ projects", "186,420 records", etc. are removed) |
| D-26 | Market-risk AI = **downside stress test + scam/manipulation detection + district market overview** |
| D-27 | Assistant AI = Claude **tool runner over our own database**. No RAG or vector DB in the MVP |
| D-28 | Predictive AI = **TypeScript hedonic regression + index projection** inside Next.js. No Python service in the MVP |
| D-29 | Communication = in-app messaging per listing, with AI translation (original always kept) and scam-phrase warnings |
| D-30 | Accounts = Supabase email + password. Seeded demo accounts. The role switcher only exists when `DEMO_MODE=true` |
| D-31 | Claude model: `claude-opus-5-5` by default (env `CLAUDE_MODEL` to override); low effort for interactive calls |
| D-32 | Code computes every rule and number; AI only reads, explains, translates and summarises; a human confirms before money moves |
| D-33 | **Avalanche (A1):** publish a SHA-256 fingerprint of the transparency ledger on **Fuji testnet only** (chain hard-coded), as readable text in a 0-AVAX transaction to our own address. No personal data on-chain. Throwaway server wallet. Verify button + explorer link |
| D-34 | **Tokenomist (T1):** read-only unlock data for the "Can my crypto fund this deposit?" check. **Code** sets the risk level (R13); U-Estate **never accepts crypto**; shown as risk information, not investment advice; SAMPLE tokens when no key |
| D-35 | **ElevenLabs (E1–E3):** E1 TTS in 5 languages (Eleven v3), E2 voice search (Scribe `scribe_v2`), E3 live voice agent (ElevenLabs Agents, WebRTC) whose client tools are **read-only** and run through `/api/agent-tools`. The agent can't move money, make offers or sign anything |
| D-36 | Typed real-time chat (`/assistant`) uses the **same tools** as the voice agent (Claude tool runner, streamed). One tool layer: `src/lib/assistant-tools.ts` |
| D-37 | Every partner feature **degrades to a labelled fallback** and `/partners` shows live/fallback status plus exactly what data goes to each partner |
| D-38 | Partner keys are **server-side only**; every paid route is rate-limited; the voice agent gets a one-conversation token, never the API key |
| D-39 | **Demo accounts (prototype, 15 Oct 23:45):** sign up / sign in with **any made-up email** (hint: "Any non-real email to demo, e.g. anythings@example.com"); common real inbox domains (gmail.com, outlook.com…) are refused. Passwords stored **only as salted scrypt hashes**; sessions are random tokens (cookie) with only their SHA-256 stored; 5 failed sign-ins per email per 5 min. One-click **demo personas** remain on `/signin` while `DEMO_MODE` is not `false`. Production: Supabase Auth (D-30) |
| D-40 | **Wallet = test money only:** ฿5,000,000 grant at sign-up, "add ฿1,000,000" top-ups (max ฿20M); co-buy commitments are checked against the available balance and an optional per-commitment limit. Payout preference only (escrow bank transfer, or U-topia wallet when connected): **no bank numbers, cards or crypto are collected** |
| D-41 | Account owners list properties themselves (`/sell`), see them under **My properties**, check their own deed (owner-only), and open a FairOffer room with the default published weights (50/25/15/10). Demo-only "Link my U-topia membership" button for new accounts; personas keep fixed memberships. Reset demo keeps signed-up accounts and their listings |
