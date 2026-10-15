# TRD: U-Estate technical requirements

**Decisions:** D-20, D-21, D-27, D-28, D-31, D-33–D-38 in [DECISIONS.md](DECISIONS.md). **Partners:** [PARTNERS.md](PARTNERS.md).
**Data:** [DATA_MODEL.md](DATA_MODEL.md). **APIs:** [API.md](API.md). **AI:** [AI_SPEC.md](AI_SPEC.md). **UI:** [UI_SPEC.md](UI_SPEC.md).

## 1. Stack (pinned to what's installed)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16 (App Router)**, React 19, TypeScript 5 | Already scaffolded; server actions + route handlers, so no separate backend |
| Styling | Tailwind CSS 4 + CSS variables from the Figma design | Matches the design (`docs/design-reference/index.css`) |
| DB / Auth / Files / Realtime | **Supabase** (Postgres 15+, Auth, Storage, Realtime) | One service gives accounts, data, photos, live chat; RLS for security; free tier is enough |
| Supabase client | `@supabase/supabase-js` + `@supabase/ssr` | Cookie sessions in Server Components, actions and route handlers |
| AI | Claude API via `@anthropic-ai/sdk` (structured outputs, tool runner, streaming) | Vision for deeds, tool use for the assistant, multilingual |
| Voice | ElevenLabs: TTS (`eleven_v3`, speaks Thai), STT (Scribe `scribe_v2`), live agent (ElevenLabs Agents via `@elevenlabs/react` 1.16.0, WebRTC) | Event partner; browser Web Speech fallback |
| Token data | Tokenomist API v5 (`x-api-key`), server-side fetch | Event partner; T1 unlock-risk check |
| Ledger notary | Avalanche Fuji C-Chain via `viem` 2.57.1 (`avalancheFuji`) | Event partner; A1 fingerprint, testnet only |
| Validation | `zod` | Shared schemas for forms, APIs and AI outputs |
| Tests | `vitest` (unit), Playwright via the `webapp-testing` skill for smoke tests | Rules and maths must be provable |
| Hosting | **Vercel** (app) + Supabase cloud (Singapore region) | Fastest deploy; low latency to Bangkok |

## 2. Architecture

```
Browser (Next.js client components: forms, chat, charts, voice)
   │  server actions / fetch / Supabase Realtime (messages)
   ▼
Next.js server (Vercel)
   ├─ src/app/**            pages (Server Components) + route handlers (api/*)
   ├─ src/lib/rules.ts      business rules R1–R10 (pure, unit-tested)
   ├─ src/lib/valuation/*   predictive engine (pure TS)
   ├─ src/lib/market/*      stress test, scam rules, district stats (pure TS)
   ├─ src/lib/ai/*          Claude calls: deed, explain, assistant (tool runner), translate, summaries
   ├─ src/lib/voice/*       ElevenLabs TTS/STT (prototype: api/voice/*)
   ├─ src/lib/assistant-tools.ts  read-only tools shared by the voice agent and the typed chat (D-36)
   ├─ src/lib/token-risk.ts + tokenomist.ts   T1 rules (pure) + Tokenomist client
   ├─ src/lib/ledger-hash.ts + avalanche.ts   A1 hash chain (pure) + Fuji publisher/reader
   └─ src/lib/db/*          Supabase server client + typed queries
   ▼
Supabase: Postgres (RLS) · Auth · Storage (listing-photos public, deeds private) · Realtime (messages)
External: Anthropic API · ElevenLabs API (TTS, STT, Agents over WebRTC from the browser with a server-issued token)
          · Tokenomist API · Avalanche Fuji RPC · (later) U-Bot API · Bank of Thailand index file (downloaded, versioned)
```

**Principle (D-32):** `rules.ts`, `valuation/*` and `market/*` compute every number. `ai/*` reads documents, explains, translates and summarises. The AI never writes to money or ownership tables directly. Only server actions do, after validation.

## 3. Folder conventions

```
src/app/(public)/...            pages: /, /browse, /listing/[id], /model-card, /market/[district]
src/app/(app)/...               signed-in pages: /sell, /offers/[listingId], /cobuy/[id], /messages, /messages/[id], /dashboard, /review
src/app/api/<name>/route.ts     JSON/stream endpoints (AI, voice, uploads)
src/app/actions/*.ts            server actions grouped by domain (offers.ts, cobuy.ts, listings.ts, messages.ts, profile.ts)
src/lib/...                     pure logic + services (above)
src/i18n/{en,th,ar,zh-Hant,es}.ts   dictionaries; src/i18n/index.ts (getT, locale cookie, dir)
supabase/migrations/*.sql       schema + RLS (from DATA_MODEL.md)
supabase/seed.sql               demo data
scripts/                        dataset generator, valuation evaluation, seed users
```

## 4. Authentication and authorization

- Supabase Auth with email + password. `@supabase/ssr` middleware refreshes the session.
- **Roles:** stored in `profiles.roles text[]`. The `utopia_member` and `is_reviewer` flags are set by an admin or seed only. A trigger blocks self-updates of these fields.
- **Demo mode (`DEMO_MODE=true`):** the `/demo` page signs in seeded accounts via `signInWithPassword`, using passwords from a **server-only env var**, never the client bundle.
- **Authorization layers:**
  1. RLS on every table ([DATA_MODEL.md](DATA_MODEL.md) §3)
  2. Server actions re-check ownership and roles
  3. The UI hides actions the user can't perform

  Never rely on UI hiding alone.

## 5. Data integrity and money-like state

- Co-buy commits run as **one Postgres function** `cobuy_commit(group_id, lane, amount, rate)`. It is `SECURITY DEFINER`, validates R2–R7 inside a transaction with `SELECT … FOR UPDATE` on the group, inserts the participant and ledger entries, and flips the status to `funded`. This prevents race conditions (two users over-committing).
- The rules exist in TS (for UI pre-validation and unit tests) **and** in SQL (for authority). Tests cover both via the same fixtures.
- Offers: a unique `(round_id, buyer_id)` index. The `offer_rounds.criteria` update is blocked after `rules_published_at` (trigger).
- `ledger_entries`: insert-only (RLS has no update/delete policy; a trigger rejects updates). `is_simulated = true` is the default.
- **Idempotency:** server actions take a client-generated `request_id` (uuid); a unique constraint on `ledger_entries.request_id` prevents double submits.

## 6. Realtime messaging

- The client subscribes to `postgres_changes` on `messages` filtered by `conversation_id` (RLS limits rows to members).
- On send: a server action inserts the message (`body_original`, `lang_original`). It then calls `ai/translate` for each **other member's** locale and updates `translations jsonb`. Recipients see a "translating…" state, then the translation.
- The scam-phrase rules run on insert (server) and set `risk_flags`. The AI second opinion runs asynchronously.

## 7. Storage

| Bucket | Access | Content |
|---|---|---|
| `listing-photos` | Public read; owner write | Max 5 MB, image/* |
| `deeds` | **Private**: owner + reviewer read via signed URLs | Max 5 MB. **Never real documents in the demo** |

## 8. AI service requirements (details in [AI_SPEC.md](AI_SPEC.md))

- Model: `claude-opus-5-5` (env `CLAUDE_MODEL`). Set `output_config.effort: "low"` for interactive calls. Use structured outputs (`messages.parse` + `zodOutputFormat`) for anything parsed.
- Handle `stop_reason === "refusal"`: return a safe fallback and log it.
- Every AI call is logged to `ai_runs` (feature, model, latency, ok/error, tokens). **No raw personal data in logs.**
- **Timeouts:** 25 s for the deed check, 20 s for chat turns (streamed). On timeout, show a template and keep the rules working.
- **Rate limit:** 20 AI calls/min per user (simple counter in Postgres or memory).
- **Cache:** explanations keyed by `(listing_id, locale, valuation_version)` in `ai_cache`, so a repeated demo is instant and resilient.

## 9. Security checklist

- RLS enabled on all tables; the service-role key is only used in server code for seeding and scripts.
- Validate every input with zod on the server; never trust client prices or flags.
- Prompt-injection hygiene: listing text and user messages go to AI as **data** inside clearly delimited blocks. Tools can't mutate money or ownership state without a user-confirmed server action.
- No secrets in the repo; `.env.local` is gitignored; `.env.example` is documented.
- Private deeds bucket; signed URLs expire in 10 minutes.
- **Partner keys** (`ELEVENLABS_API_KEY`, `TOKENOMIST_API_KEY`, `AVALANCHE_PRIVATE_KEY`) are server-only. The browser gets a one-conversation ElevenLabs token from `/api/voice/agent-token`.
- **Avalanche wallet:** a new throwaway Fuji wallet holding only faucet AVAX; the chain is hard-coded to Fuji; only a hash goes on-chain (no personal data). Rotate or delete the key after the event.
- **Voice agent:** client tools are read-only and zod-validated server-side (`/api/agent-tools`); `open_page` only accepts whitelisted paths.
- **Rate limits (prototype, per IP per minute):** assistant 20, explain 20, search 20, TTS 20, STT 12, token check 10, agent token 6, agent tools 60, anchor 3.
- Sanitize rendered user text (React escapes by default; no `dangerouslySetInnerHTML`).

## 10. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # public by design; RLS protects data
SUPABASE_SERVICE_ROLE_KEY=        # server only (seed, AI write-backs, anchors, persona sign-in); never NEXT_PUBLIC_
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-opus-5-5
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL_ID=eleven_v3
ELEVENLABS_STT_MODEL=scribe_v2
ELEVENLABS_AGENT_ID=              # from scripts/create-voice-agent.mjs
TOKENOMIST_API_KEY=               # plan with forward unlock data
AVALANCHE_PRIVATE_KEY=            # throwaway Fuji wallet, server only
AVALANCHE_RPC_URL=                # optional, default public Fuji RPC
CRON_SECRET=                      # production: protects the hourly anchor cron
DEMO_MODE=true
DEMO_PASSWORD=                    # server only, for seeded accounts
```

## 11. Testing strategy

| Level | What | Tool |
|---|---|---|
| Unit | `rules.ts`, valuation maths, stress test, scam rules, fee calculator, **token-risk (R13), ledger hash chain (R14), voice-search parser**, i18n completeness (every key in 5 locales) | vitest (29 tests today) |
| DB | `cobuy_commit` function: quota, cap, members-only, race (two parallel calls) | vitest + supabase-js against a local or test project |
| AI contract | Deed extraction on the 4 sample deeds → expected type and flags; translation round-trip; assistant tool selection on 5 scripted questions | vitest (marked `ai`, run manually; costs money) |
| E2E smoke | The demo script end to end on the deployed URL, desktop + mobile + Arabic RTL | Playwright (`webapp-testing` skill) |
| Valuation eval | Held-out time split → metrics JSON for the Model Card | `npm run eval:valuation` |

## 12. Deployment and demo operations

1. Create a Supabase project (Singapore). Run `supabase/migrations/*` then `seed.sql`. Run `scripts/seed-users.ts` with the service key.
2. Create a Vercel project from the GitHub repo and set env vars. Deploy.
3. Before presenting:
   - run the smoke test
   - warm the AI cache (run the explainers once per locale)
   - press "Reset demo" (admin action that re-runs the seed for demo tables only)
4. **Offline fallback (P1):** `DEMO_OFFLINE=true` serves cached AI outputs and the local JSON store, in case the venue Wi-Fi fails. Keep a backup video too.

## 13. Observability

- `ai_runs` table plus the Vercel logs.
- A `/status` page (reviewer only): DB reachable, AI key present, ElevenLabs reachable, last valuation eval date.
- `/partners` (public): live/fallback status per partner + what data goes where (D-37). Never shows key values.
