# Contributing to U-Estate

Two teams, each with an AI coding agent, work in this repo during the hackathon. The main goals are simple: **don't break `main`, and don't leak secrets.**

## Setup

```bash
npm install                  # installs deps AND enables .githooks/pre-commit (secret check)
cp .env.example .env.local   # never commit .env.local
npm run dev
```

Check the hook is active: `git config core.hooksPath` must print `.githooks`.

## Branches and commits

- `main` is always deployable. Work on a branch:
  - `feat/T04-supabase-reads`
  - `fix/offer-room-guest`
  - `docs/handoff`
- Commit messages: `T## short title`, or `fix: …` / `docs: …` when there is no task. Keep commits small.
- Before pushing, run **`npm run check`** (typecheck, lint, unit tests, database checks, secret scan) and `npm run build`.
- **Pull requests:**
  - open one into `main` using the PR template
  - CI must be green
  - the other team reviews anything touching shared files (see [docs/HANDOFF.md](docs/HANDOFF.md) §4)
  - squash-merge
- Pull `main` often: `git pull --rebase origin main`.
- When you finish a task, update its status in `docs/IMPLEMENTATION_PLAN.md` and the "Last changes" list in `docs/HANDOFF.md`.

## Never commit

| What | Why |
|---|---|
| `.env.local`, any `.env*` except `.env.example` | API keys |
| `.data/` | Local demo database: password hashes, sessions, QA notes |
| Keys, tokens, passwords, private keys (incl. the Avalanche test wallet) | Anyone could spend credits or impersonate us |
| Real emails, phone numbers, ID cards, real deeds or photos of real people | Privacy and PDPA. Use `@example.com` and the SAMPLE deeds |

The hook (`scripts/check-secrets.mjs --staged`) and CI block these. **Never bypass with `--no-verify`.**

**If something slips through:**
1. Rotate the key right away.
2. Remove it from the code.
3. Tell the team.

Rewriting history is not enough once something has been pushed.

## Code rules

The full list is in [AGENTS.md](AGENTS.md). The short version:
- **[docs/DECISIONS.md](docs/DECISIONS.md) wins any conflict.**
- **Code computes every rule and number; AI only explains** (D-32). Money and ownership rules live in `src/lib/rules.ts` and, authoritatively, in the SQL functions.
- **Database changes:** add a new file in `supabase/migrations/` with RLS and policies, add checks to `scripts/db/verify.mjs`, then run `npm run db:verify`.
- **Security:** validate input with zod on the server, and re-check the signed-in owner in every action.
- **UI:**
  - use the design tokens (`globals.css`); every string is translatable
  - use logical CSS (RTL) and visible focus
  - never show status by colour alone
