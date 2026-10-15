# HANDOFF: status, who does what, what to do next

**Updated:** Fri 16 Oct 2026, 00:45 ICT. **Update this file when you finish a task** (status table + "Last changes").

**Event:** U-Hackathon 2026, AI track (Bangkok).

| Milestone | When |
|---|---|
| Feature freeze | **Fri 12:00** |
| Submit on hub.team1.network | **Fri 13:30** (official deadline 14:00) |
| Finalists | 20:00 |

**Submission needs:** a **public** GitHub repo, a live demo URL and the deck. The repo is private until submission, so make sure it holds nothing sensitive (§6).

## 1. The product in one minute

**U-Estate** is a transparent, AI-guided Thai property marketplace: the same facts and fees for every party.
- verified listings (AI deed check)
- honest price ranges with sources
- FairOffer: sealed offers ranked by rules the seller publishes first
- legal co-buying for U-topia members
- a public append-only ledger
- voice in 5 languages, a crypto-deposit unlock check, and a ledger fingerprint on Avalanche (one each for the three event partners)

**Judging weights:** execution 40%, practicality 40%, usability 10%, innovation & ecosystem 5%, U-Bot 5%.

## 2. Run it

```bash
npm install            # also enables the git pre-commit secret check (.githooks)
cp .env.example .env.local   # fill only what you need; every partner is optional
npm run dev            # http://localhost:3000
npm run check          # typecheck + lint + 35 unit tests + 62 database checks + secret scan
```

**Where data lives today:**
- The app runs on the **JSON store** (`.data/db.json`, git-ignored), so everything works with **zero keys**.
- The real database (Supabase) is ready in `supabase/migrations/` and verified by `npm run db:verify`, but **not wired in yet** (§4).

## 3. Done (in the repo, tested)

| Area | What | Where | Verified |
|---|---|---|---|
| Marketplace | Listings, listing detail with 3-source price, index chart, risk list, fee table | `src/app/page.tsx`, `src/app/listing/[id]` | Browser |
| FairOffer | Sealed offers, published weights, code ranking, AI summary, accept | `src/app/listing/[id]/offers`, `rules.ts scoreOffers` | Unit + browser |
| Co-buy | Members only; condo quota + FET; foreigners lend on land at ≤ 15%; wallet balance check; ledger | `src/app/cobuy/[id]`, `rules.ts`, `wallet.ts` | Unit + browser |
| Deed check | Claude vision + code rules (owner only) | `/sell#deed`, `api/check-document` | Needs `ANTHROPIC_API_KEY` |
| Accounts | Sign up (any made-up email; real inboxes refused), sign in, scrypt hashes, sessions, demo personas | `src/app/auth`, `signin`, `signup`, `lib/auth-rules.ts`, `lib/session.ts` | Unit + browser |
| Account area | Overview, My properties, Wallet (test money), Account settings | `src/app/account/*` | Browser |
| Selling | List a property, owner bar, open offer room | `/sell`, `sell/actions.ts` | Browser |
| AI | Price explainer (5 languages), streaming chat with tools, voice search parser | `api/explain`, `api/assistant`, `api/search`, `lib/assistant-tools.ts` | Unit; live AI needs a key |
| Partners | ElevenLabs E1 voice, E2 voice search, E3 live voice agent; Tokenomist T1; Avalanche A1; `/partners` status page | `docs/PARTNERS.md` | Fallbacks tested; live calls need keys |
| UI | Figma tokens, Manrope/Cormorant, new header + account menu, logo from `/logo`, mobile menu | `globals.css`, `SiteHeader.tsx`, `scripts/brand-assets.mjs` | Browser (desktop + 375 px) |
| Database | Full schema, RLS on every table, RPCs (co-buy, offers, messaging, listings, wallet), realtime publication, storage buckets + policies, demo seed | `supabase/`, `scripts/db/`, `docs/DATABASE.md` | `npm run db:verify` 62/62 (PGlite) |
| Repo safety | Secret scanner, pre-commit hook, CI, hardened `.gitignore` | `scripts/check-secrets.mjs`, `.githooks/`, `.github/` | Tested with fake keys |

## 4. Who does what (proposed split: edit it if you agree differently)

| Owner | Scope | Folders you own (others ask first) |
|---|---|---|
| **Partner developer + their AI** | **Real-time database wiring**: Supabase auth, port all reads/writes, photo uploads, messaging UI, notifications bell, deed storage, anchors in DB | `supabase/`, `src/lib/supabase/`, new `src/lib/db/`, `src/proxy.ts`, `src/app/messages/`, the auth / account / sell / co-buy / offer server actions, new components `ChatThread`, `NotificationBell`, `PhotoUploader` |
| **Core team (Duwun + Claude)** | Partner keys going live, AI engines, UI polish + translations, deck, demo script, backup video, judge Q&A | `src/lib/ai.ts`, `api/*` (AI/voice/partners), `src/components/*` (existing), `src/i18n/` (new), `docs/PARTNERS.md`, `docs/DEMO_SCRIPT.md` |
| **Shared: small PRs, say so in the PR** | `src/app/layout.tsx`, `SiteHeader.tsx` (the bell goes here), `globals.css`, `package.json`, `docs/DECISIONS.md` | — |

**In progress now (core team):**
- T28–T31: ElevenLabs key + voice agent, Tokenomist key, Avalanche wallet
- T33: restyle partner components
- T18: i18n
- Demo rehearsal and the judge deck

## 5. What to do next: partner developer (in this order)

All task details are in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md); the how-to is in [DATABASE.md](DATABASE.md) §4–§5.

| # | Task | Done when |
|---|---|---|
| 1 | **T01** Create the Supabase project (Singapore), apply the 4 migrations, set auth (confirm email OFF), put keys in `.env.local` and Vercel, `npm run db:seed` | Personas + 3 listings visible in the Supabase table editor |
| 2 | **T02** Add `src/proxy.ts`; port sign up / sign in / sign out / persona sign-in to Supabase Auth (keep the real-inbox refusal and the UI) | Sign up as anything@example.com, sign out, sign in again, all on Supabase |
| 3 | **T04 + T02b + T05** Port reads and writes feature by feature behind `supabaseConfigured()` (DATABASE §5 table) | Every existing flow works on Supabase; `npm run check` green |
| 4 | **T06 + T15** Messaging: "Message the seller" on the listing → `/messages` list + thread, live via Realtime, translation banner, scam-phrase warning | Two browsers chat live; outsiders blocked |
| 5 | **T38** Notification bell in the header (live) | New offer / message / co-buy funded shows instantly |
| 6 | **T37** Seller photo upload (`listing-photos`) + gallery on the listing page; **T20** deeds into the private bucket | Upload works; other users can't write into your folder |
| 7 | **T32** Ledger + anchors from Supabase; hourly cron | `/ledger` reads the DB; verify ✓ |
| 8 | **T21/T34** E2E smoke (Playwright, `webapp-testing` skill); **T22** deploy with env vars | Public URL works in a private window |

Stop and ask the core team if a change would touch their folders, or if a legal / business rule seems wrong. Rules live in [DECISIONS.md](DECISIONS.md) (highest authority).

## 6. Secrets and personal data: zero tolerance

- **Never commit:** `.env.local`, `.data/`, keys, passwords, tokens, private keys, real emails, phone numbers, ID or deed photos of real people. The pre-commit hook and CI block the common cases. **Never use `git commit --no-verify`.**
- **Share keys only** through Vercel environment variables or a password manager. Never through git, PR text, issues, screenshots, or chat with an AI.
- `NEXT_PUBLIC_*` values reach the browser. Only the Supabase URL and anon/publishable key may be `NEXT_PUBLIC_`. **The service-role key is server-only.**
- **If a secret ever reaches GitHub:** rotate it immediately (deleting the commit is not enough), then tell the team.
- **Demo data is SAMPLE:** use `@example.com` emails, fake deeds with the "ตัวอย่าง / SAMPLE" stamp, and test money.

## 7. Gotchas

- **Next.js 16:** `middleware` is now **`proxy`** (`src/proxy.ts`). Read `node_modules/next/dist/docs/` before using an API from memory.
- **JSON store on Vercel** lives in `/tmp` and resets on cold start. That's why Supabase must be wired before the live demo.
- **Hidden fields** aren't submitted by forms: zod schemas must treat them as optional (see `sell/actions.ts`).
- **Logo:** masters are in `/logo`. Regenerate the web assets with `npm run brand`; don't hand-edit `public/brand/*`.
- **Partner limits:**
  - Tokenomist's free trial returns past unlocks only.
  - ElevenLabs Thai needs `eleven_v3` / `eleven_v4_turbo`.
  - The Avalanche wallet must be a throwaway Fuji wallet with faucet AVAX.

## 8. Last changes

- 16 Oct (Meena, branch `Meena`): **T07 valuation engine** (hedonic ridge OLS + conformal range, factors, forecast, synthetic dataset, eval → Model Card JSON; measured on the 2026 test split: median error 4.8%, 81.3% within ±10%, range coverage 76.8%). Person 2 test scripts in `tests/` with results in `tests/PERSON2_RESULTS.md`; fixed `/api/explain` 400, voice dock Esc/focus, Land Office label, 44 px select.
- 16 Oct 00:45:
  - real-time database (migrations, RLS, RPCs, realtime, storage) + `db:verify` (62/62)
  - repo safety (secret scan, hooks, CI)
  - logo assets
  - handoff docs and agents
- 15 Oct 23:45: accounts (sign up / sign in), Wallet, Account settings, My properties, new menu bar + UI overhaul, 5-slide judge deck.
- 15 Oct 23:15: partner features E1–E3, T1, A1, `/partners`; fixed a sealed-offer amount leak and a store overwrite bug.
