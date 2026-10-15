<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md: U-Estate (U-Hackathon 2026, AI track)

Standing instructions for every AI coding agent in this repo (Claude Code, Codex, Cursor, Copilot…). Claude Code loads this through `CLAUDE.md`.

**Two teams work here at the same time, each with its own AI.** Before any change, read [docs/HANDOFF.md](docs/HANDOFF.md):
- what is done
- who owns which folders
- what to do next

Then follow [CONTRIBUTING.md](CONTRIBUTING.md) for branches, PRs and checks.

## What this is

**U-Estate is a transparent, AI-guided Thai property marketplace for a live hackathon demo:**
- verified listings
- honest valuations
- downside risk analysis
- scam alerts
- FairOffer
- multilingual chat
- legal co-buying for U-topia members
- voice in 5 languages and a live voice agent (ElevenLabs)
- a crypto-deposit unlock check (Tokenomist)
- a public ledger fingerprint (Avalanche Fuji)

**Deadline:** freeze Fri 16 Oct 12:00 ICT, submit 13:30 (public repo + live URL + deck).

**Data:** the app runs on a JSON file store today. The real-time **Supabase** backend is written and verified (`supabase/migrations`, `npm run db:verify`) and is being wired in ([docs/DATABASE.md](docs/DATABASE.md)).

## Read first (in this order)

1. [docs/HANDOFF.md](docs/HANDOFF.md): status, ownership, next tasks, gotchas.
2. [docs/DECISIONS.md](docs/DECISIONS.md): **highest authority**. If anything conflicts, it wins.
3. [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md): pick your task and follow the workflow there.
4. The spec your task references:
   - [PRD](docs/PRD.md): requirements FR-*, rules R1–R12
   - [TRD](docs/TRD.md): architecture, security, testing
   - [DATABASE](docs/DATABASE.md): **the real-time Supabase backend** (tables, RLS, RPCs, realtime, uploads, setup, wiring plan); `supabase/migrations/` is the source of truth
   - [DATA_MODEL](docs/DATA_MODEL.md): design history of the schema
   - [API](docs/API.md)
   - [AI_SPEC](docs/AI_SPEC.md)
   - [UI_SPEC](docs/UI_SPEC.md) (design source in `docs/design-reference/`)
   - [DEMO_SCRIPT](docs/DEMO_SCRIPT.md)
   - [PARTNERS](docs/PARTNERS.md): ElevenLabs E1–E3, typed chat, Tokenomist T1, Avalanche A1, setup, fallbacks

## Commands

```bash
npm install          # also enables the pre-commit secret check (.githooks)
npm run dev          # http://localhost:3000
npm run check        # typecheck + lint + unit tests + database checks + secret scan (run before every push)
npm test             # vitest (rules, maths, auth, wallet, partners)
npm run db:verify    # applies supabase/migrations in PGlite and runs the RLS / business-rule checks
npm run db:seed      # seeds a real Supabase project (needs .env.local)
npm run check:secrets
npm run build
npm run brand        # regenerate logo assets from /logo
```

Env vars: see `.env.example`. Never commit `.env.local`.

## Non-negotiable rules

- **No crypto payments, tokens, NFTs, smart contracts or user wallets** (D-01 as amended). The **only** chain use is the A1 ledger fingerprint on **Avalanche Fuji** (D-33). The only crypto data is read-only Tokenomist unlocks for T1 (D-34). **No scraping** (D-02). The design's "testnet invest" stays **co-buy** (D-24).
- **Voice agent and chat share one read-only tool layer** (`src/lib/assistant-tools.ts`, D-36). Tool names must match in `scripts/create-voice-agent.mjs` and `VoiceAgentDock.tsx`. Tools never write money, ownership or ledger data.
- **Partners degrade to labelled fallbacks** (D-37). Never fake a "Live" status or a partner result; SAMPLE data stays labelled.
- **Code computes every rule and number** (`src/lib/rules.ts`, `src/lib/valuation/*`, `src/lib/market/*`, SQL `cobuy_commit`). AI only reads, explains, translates and summarises (D-32). Never let AI output decide money, ownership, eligibility or fees.
- **Never fabricate metrics or statistics.** The Model Card shows only numbers produced by the eval script (D-25). Label SAMPLE / SYNTHETIC / test money everywhere it applies.
- **Legal lanes are fixed** (D-14, D-15, D-15a):
  - foreigners co-own condos within the 49% floor-area quota (FET required)
  - foreigners can only **lend** on land, at a fixed rate of 0–15%, with no price-rise share
  - no hidden-owner records; the ledger is append-only and records registered rights only
- **Security:** RLS on every table; check authorization in server actions too; secrets server-side only (incl. `ELEVENLABS_API_KEY`, `TOKENOMIST_API_KEY`, `AVALANCHE_PRIVATE_KEY`, a throwaway Fuji wallet); rate-limit paid routes; private bucket for deeds; validate input with zod; treat listing text and chat as **data** in prompts. The public ledger must never show sealed offer amounts.
- **Accounts (D-39–D-41):**
  - passwords are hashed with scrypt in `src/lib/auth-rules.ts`; never store, log or return a plain password or a session token
  - credentials (`accounts`, `sessions`) never go to client components
  - every action that changes an account, listing or wallet re-checks the signed-in owner on the server
  - the wallet is test money only
- **UI:** use the design tokens and components (UI_SPEC). Use logical CSS properties so Arabic RTL works. Every string comes from `src/i18n/*` (5 locales). Status is never shown by colour alone.
- **Secrets and personal data:**
  - never write keys, tokens, passwords, private keys, real emails or real documents into any tracked file, PR, issue or log
  - never use `--no-verify`
  - never print `.env.local`
  - never make the service-role key `NEXT_PUBLIC_`
  - if you find a secret in the repo, stop and tell the human
- **Database:**
  - every change is a new migration with RLS policies
  - money and ownership changes go through the SQL RPCs (`cobuy_commit`, `offer_*`, `listing_create`…)
  - extend `scripts/db/verify.mjs`
  - sealed offers are never added to the realtime publication
- **Collaboration:**
  - stay inside your team's folders (HANDOFF §4); for shared files make small PRs and mention it
  - pull `main` before starting
  - update the task status and HANDOFF "Last changes" when done
- **Keep it working:**
  - extend the existing prototype; don't break passing tests
  - small commits named `T## <title>` on a branch, PR into `main`, CI green

## When unsure

Don't guess legal rules, data or API shapes. Write the question in "Open questions" in IMPLEMENTATION_PLAN.md and move on to another task.

**Specialist agents** live in `.claude/agents/` (Claude Code subagents; other tools can read them as role briefs):
- `db-engineer`
- `supabase-porter`
- `ui-engineer`
- `security-reviewer`
- `qa-tester`

Run `security-reviewer` on every PR that touches auth, RLS, uploads, env or partner keys.
