# IMPLEMENTATION_PLAN: from the current prototype to the live demo

**Deadline:** feature freeze **Fri 16 Oct 12:00**; submit **13:30** (hub.team1.network); finals 20:00.
**Starting point:** a working prototype (JSON store) with:
- listing, FairOffer, co-buy, ledger and deed check
- **partner features E1 (voice), E2 (voice search), E3 (live voice agent), typed real-time chat, T1 (Tokenomist check), A1 (Avalanche fingerprint) and `/partners`** ([PARTNERS.md](PARTNERS.md))
- 29 unit tests

Keep `src/lib/rules.ts`, `token-risk.ts`, `ledger-hash.ts`, `search.ts`, `assistant-tools.ts` and their tests. **Extend, don't rewrite.**

## How agents use this file

1. Take the **lowest-numbered task whose dependencies are done** in your track. Set its status to `in-progress (agent/name, time)`.
2. Read the referenced spec sections first. Follow [DECISIONS.md](DECISIONS.md).
3. Done = every acceptance check passes, plus `npm run typecheck && npm test && npm run build` are green. Commit with message `T## <title>`. Set the status to `done`.
4. If blocked or unsure, write the question under "Open questions" at the bottom and pick another task. Never invent data, keys or legal rules.

**Ownership between the two teams:** see [HANDOFF.md](HANDOFF.md) §4–§5. The partner developer leads Track A (database wiring); the core team leads B/C/D.

**Tracks** (parallel; each owns its files to avoid conflicts):
- **A, Backend:** `supabase/`, `src/lib/db/`, `src/app/actions/`
- **B, AI:** `src/lib/ai/`, `src/lib/valuation/`, `src/lib/market/`, `src/lib/voice/`, `scripts/`
- **C, UI:** `src/components/`, `src/app/**/page.tsx`, `globals.css`
- **D, i18n/QA/demo:** `src/i18n/`, `tests/`, `docs/DEMO_SCRIPT.md`

## Tasks

| ID | Track | Task | Depends | Spec | Acceptance | Est | Status |
|---|---|---|---|---|---|---|---|
| T01 | A | Supabase project (Singapore), apply `supabase/migrations/*`, auth settings, keys in `.env.local` + Vercel | — | DATABASE §4 | Migrations apply cleanly; personas + listings visible after `npm run db:seed` | 0.5h | **Hosted migrations applied + base seed verified** (Person 1); Vercel environment/deployment check pending |
| T02 | A | Supabase SSR client + middleware; email/password auth; `/demo` persona sign-in (DEMO_MODE) | T01 | TRD §4, API `demo.*` | Sign in/out works; persona one-click; passwords never reach the client bundle | 1h | **Supabase Auth wired** (Person 1); browser signup/password/signout/signin passes; deployed/session-expiry acceptance pending |
| T02b | A | Port account, wallet and sell actions to Supabase (`wallet_transactions`, profile columns, owner checks in RLS) | T02, T04 | DATA_MODEL §1a | Same behaviour as the prototype on Supabase; balance checked inside `cobuy_commit` | 1h | **Supabase wired; browser account/wallet/listing flows pass** (Person 1); concurrent wallet checks pending |
| T03 | A | Seed: personas (service role), listings, offer round; later 8 Figma-style condos incl. 1 scam-bait + SAMPLE index | T01 | DATABASE §4 | `npm run db:seed` runs; app shows the seeded data | 1h | **Base seed done** (`scripts/db/seed-supabase.mjs`); extra condos + index = todo |
| T04 | A | Replace the JSON store with Supabase queries (`src/lib/db/*`); port actions to `src/app/actions/*` with the result shape | T02, T03 | API §1 | All existing flows work on Supabase; JSON store only behind `DEMO_OFFLINE` | 2h | **Existing reads/actions wired** (Person 1); browser smoke passes; deed/anchor live checks and hosted reset pending |
| T05 | A | Co-buy via `cobuy_commit` RPC + funded ledger entries + error-code mapping | T04 | DATABASE §1, §5 | Existing co-buy scenarios pass; two parallel commits can't over-fund | 0.5h | **RPC wired; browser commit/wallet passes** (Person 1); cross-group concurrency/quota reservations/retry safety remain open |
| T06 | A | Messaging: `conversation_start` RPC, insert messages, `useRealtime("messages")`, `conversation_mark_read`, unread badge | T04 | DATABASE §2, §5 | Two browsers chat live; RLS blocks non-members | 1.5h | **DB + realtime done + verified**; UI wiring = todo |
| T07 | B | Valuation: dataset generator, OLS, conformal range, factors, forecast; `npm run eval:valuation` → `model-card.json` | — | AI_SPEC §2 | Unit tests for OLS and maths; eval prints real metrics; no hard-coded metrics anywhere | 3h | **done (Meena, branch `Meena`)**: `src/lib/valuation/*`, `npm run valuation:dataset` + `npm run eval:valuation` → `src/data/valuation-model.json` + `model-card.json`; 24 unit tests. Entry point for T08: `valueProperty()` in `src/lib/valuation/index.ts` (pass `railWalkMin`, else it is imputed). Writing `model_cards` in Supabase = todo with the DB wiring |
| T08 | B | Wire valuation into the listing detail: fair-value card, badge, forecast tabs, "Why this price?" | T07, T10 | AI_SPEC §2.2, UI_SPEC §3 | Numbers match the engine; "Not enough data" path works | 1h | todo |
| T09 | B | Assistant `/api/assistant`: port the shared tools to Supabase + add `run_stress_test`, `get_district_overview`, `draft_viewing_request` + knowledge pack | T04 | AI_SPEC §3.1, API §2 | 10 scripted questions: correct tool ≥ 9/10; answers stream; no invented numbers | 2h | **MVP done in prototype** (5 tools, streaming, 5 locales) |
| T10 | C | Design system: tokens, fonts, Logo, Button, Badge, AiLabel, Kicker, layout shell (header, footer, mobile bottom tabs), states | — | UI_SPEC §1–2, §4 | Matches the Figma look on desktop and mobile; Lighthouse a11y ≥ 90 on `/` | 2h | todo |
| T11 | C | Browse + PropertyCard + filters + states | T04, T10 | UI_SPEC §3 | Filters work on DB data; scam-alert card style shows | 1.5h | todo |
| T12 | C | Listing detail restyle: gallery, facts, fee table, risk list, foreign-buyer guide, sticky actions, **co-buy modal** (replaces Invest) | T10, T05 | UI_SPEC §3, PRD DETAIL/COBUY | All sections render from data; co-buy modal runs the RPC; no testnet wording | 2h | todo |
| T13 | B | Market-risk: stress-test engine + `/api/stress-test` + StressTest card | T07 | AI_SPEC §4.1 | Unit tests with hand-computed values; presets work; AI explanation in locale | 2h | todo |
| T14 | B | Scam & manipulation rules + `listing_flags` + chat phrase guard + AI chat classifier | T06, T07 | AI_SPEC §4.2 | Scam-bait listing shows "Scam alert" with reasons; an off-platform payment message shows a warning banner | 1.5h | **rules engine done (Meena, branch `Meena`)**: `src/lib/market/scam.ts` (all R11 rules, 5-language chat phrase guard, AI may only add a warning) + `scamCheckForListing()` on the store; 38 tests. Still todo: badge/reasons on card + detail (after T18), `listing_flags` + ledger `listing_flagged` + reviewer queue (with DB wiring), chat banner (with T06/T15), AI classifier call |
| T15 | C | Messages UI: list + thread, translation toggle, scam banner, "AI translation" label | T06, T14 | UI_SPEC §3, PRD MSG | Thai seller ↔ Arabic buyer chat shows both originals and translations live | 1.5h | todo |
| T16 | C | Ask-AI panel (streaming) on detail page (reuse `AssistantChat`) | T09, T10 | UI_SPEC §3 | Streams; shows the tool-used chip ("Checked fees", "Ran stress test") | 0.5h | `/assistant` done in prototype |
| T17 | C | FairOffer workspace restyle (offer table, AI pick, recommend card) on Supabase | T04, T10 | UI_SPEC §3, PRD OFFER | Existing ranking behaviour; per-locale AI summary | 1h | todo |
| T18 | D | i18n framework + 5 dictionaries + RTL + locale/currency switchers; key-completeness test | T10 | UI_SPEC §5 | Switching to Arabic flips the layout correctly on every P0 page; test fails on missing keys | 2.5h | todo |
| T19 | C | Home page (true trust stats), Model Card page (from `model-card.json`) | T07, T10 | UI_SPEC §3, AI_SPEC §2.3 | No fabricated numbers; synthetic-data label visible | 1.5h | todo |
| T20 | A | Deed check → private bucket + `documents`; reviewer queue `/review`; `demo.reset`; `/api/status` | T04 | API §1–2 | Upload a sample deed → stored privately; reviewer sees the flagged items | 1.5h | todo |
| T21 | D | Smoke E2E (Playwright via the `webapp-testing` skill): DEMO_SCRIPT on deployed URL, desktop + mobile + Arabic | most P0 | TRD §11 | Script passes twice in a row | 1.5h | todo |
| T22 | A | Deploy to Vercel + env vars + warm the AI cache + backup video | T21 | TRD §12 | Public URL works in a private window; repo public with no secrets | 1h | todo |
| T23 | B | ~~Voice overlay~~ → replaced by E3 `VoiceAgentDock` | — | PARTNERS §2 | — | — | **superseded (done as E3)** |
| T24 | B | (P1) Smart Match quiz `/match` | T09, T11 | AI_SPEC §3.2 | 3 answers → ranked matches with reasons | 1.5h | todo |
| T25 | B | (P1) District overview `/market/[district]` | T07 | AI_SPEC §4.3 | Stats from SQL + AI summary + caveats | 1.5h | todo |
| T26 | C | (P1) Saved + dashboard (saved, AI activity, my co-buy groups); viewing requests | T04 | PRD SAVE/VIEW | Works on DB | 1.5h | todo |
| T27 | A | (P1) U-Bot drop-in when the staff API/embed arrives (**worth 5%: chase staff Fri 09:00**) | — | DECISIONS D-17 | U-Bot in the help slot; nothing fake before then | 1h | blocked (waiting for staff) |
| T37 | A | Seller photo upload: `listing-photos` bucket from the browser, `listing_photos` row with SHA-256, gallery on the listing, duplicate-photo scam rule | T02, T04 | DATABASE §3 | Upload + gallery work; uploading into another user's folder fails | 1.5h | todo |
| T38 | A/C | Live notification bell in the header (`notifications` + realtime + mark read) | T02 | DATABASE §2 | New offer / message / co-buy funded appears instantly; count clears on open | 1h | todo |
| T28 | B | **Partner keys live:** ElevenLabs key (coupon) → E1/E2 live; voice chosen for Thai | — | PARTNERS §2, §7 | `/partners` shows E1/E2 **Live**; Thai explanation plays with the ElevenLabs voice | 0.5h | todo |
| T29 | B | **E3 agent:** run `scripts/create-voice-agent.mjs`, dashboard checks, `ELEVENLABS_AGENT_ID`; voice-agent eval (I-12) | T28 | PARTNERS §2 E3 | Calls work in EN + TH + AR (ZH/ES best effort); each tool used once; results written in Open questions | 1h | todo |
| T30 | B | **T1 live:** Tokenomist key with forward unlock data; test `arbitrum` + 2 more tokens | — | PARTNERS §3 | Live token shows a real unlock table, or *Unknown* with the plan reason; SAMPLE still works | 0.5h | todo (ask at the booth) |
| T31 | A | **A1 live:** throwaway Fuji wallet + faucet; publish + verify on the deployed URL | — | PARTNERS §4 | Explorer link opens; Verify shows ✓ | 0.5h | todo |
| T32 | A | A1 on Supabase: `ledger_anchors` table, `entry_hash` at insert, hourly Vercel Cron (`CRON_SECRET`) | T04 | DATA_MODEL §2a | Anchors persist across deploys; cron publishes only when there are new entries | 1h | todo |
| T33 | C | Restyle partner components with the Figma tokens + i18n strings (5 locales); dock `Esc` closes, focus returns | T10, T18 | UI_SPEC §3–§7 | Arabic RTL correct in dock, chat, token check, anchor panel; keyboard-only works | 1.5h | todo |
| T34 | D | E2E smoke for partner flows (fallback mode **and** live mode) | T21 | PARTNERS §6 | Voice search typed, chat, token check (sample), anchor publish/verify pass twice | 1h | todo |
| T35 | D | ElevenLabs showcase PR + feedback form (after submission) | submission | PARTNERS §7 | PR opened | 0.5h | todo |
| T36 | A | Daily spend caps per partner (`*_DAILY_LIMIT`) + Supabase rate-limit counter | T04 | TRD §9 | Over the cap → friendly 429; caps visible on `/status` | 1h | todo |

**Cut order if late** (decide at Fri 10:30): T25 → T24 → T26 → T36 → T32 → T33 (keep the prototype styling) → counter-offers/rentals. **Never cut:** T04, T05, T06, T08, T09, T12, T14, T18 (AR+TH minimum), T21, T22, **T28, T29, T31** (partner proof is cheap and already built).

## Suggested schedule

| When | A | B | C | D |
|---|---|---|---|---|
| Thu 22:30–00:30 | T01, T02, T03 | T07 | T10 | T18 (framework + EN/TH) |
| Thu 00:30–02:30 | T04, T05 | T07 → T13 | T11, T12 | T18 (AR RTL, ZH-Hant, ES drafts) |
| Fri 09:00–10:00 | T31 (Fuji wallet + faucet) | T28, T29, T30 (partner keys live) | — | Chase U-Bot (T27); partner booths |
| Fri 10:00–12:00 | T06, T20, T22 prep | T08, T09, T14 | T15, T16, T17, T19, T33 | T21, T34, demo rehearsal |
| **12:00** | **Freeze** | | | |
| 12:00–13:30 | T22 deploy, backup video | Warm cache, metrics check | Visual QA | **Submit 13:30** |

Sleep matters. If the team works in shifts, keep at least one person fresh for the 20:00 pitch.

## Definition of done (every task)

- Acceptance checks pass. `typecheck`, `test` and `build` are green. No console errors.
- No secrets or real personal documents committed. Honesty labels present (UI_SPEC §7).
- For UI tasks: works at 360px width, keyboard-only, and in Arabic RTL.

## Open questions

- U-Bot API/embed details (staff) → T27.
- Real Treasury appraisal values for district bases (optional, T07) → otherwise synthetic, labelled.
- ElevenLabs: does the Creator coupon include enough **Agents** minutes for rehearsals + finals? Which of TH/AR/ZH/ES work in a live call? → T29.
- Tokenomist: hackathon key with **forward** unlock data? (The free trial returns past unlocks only.) Is UCOIN tracked? → T30.
- Avalanche: faucet access (login or coupon code from the Team1 booth)? → T31.
- Is there a separate prize or bounty for any partner? (Not in the opening material.)
- Should judges get a pre-made account, or sign up live with any made-up email? (Prototype: sign up live; personas for the scripted demo.)
- Bank of Thailand index file download (optional) → otherwise SAMPLE, labelled.
