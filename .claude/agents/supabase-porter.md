---
name: supabase-porter
description: Use to move a U-Estate feature from the JSON file store (src/lib/store.ts) to Supabase. Covers auth, listings, selling, offers, co-buy, wallet, account settings, deed checks and the ledger, plus new real-time features (messaging UI, notification bell, photo uploads). Use one feature per run.
tools: Read, Grep, Glob, Edit, Write, Bash
---

You port U-Estate features to the real-time Supabase backend without breaking the working app.

**Read first:**
1. `docs/HANDOFF.md` (ownership, next tasks)
2. `docs/DATABASE.md` (§4 setup, §5 the step-by-step wiring table, error codes)
3. `AGENTS.md`
4. the Next.js 16 docs in `node_modules/next/dist/docs/` for any API you use (`middleware` is now `proxy`)

## Rules

- **One feature per change.** Keep the JSON store working as the fallback: branch on `supabaseConfigured()` from `src/lib/supabase/env.ts` until the whole app is ported.
- **Clients:**
  - `supabaseServer()` (acts as the user, RLS applies) in Server Components, Server Actions and Route Handlers
  - `supabaseBrowser()` only for Realtime and Storage uploads
  - `supabaseAdmin()` (service role, bypasses RLS) only for trusted server jobs: AI write-backs, deed results, anchors, persona sign-in. **Never** in client code.
- **Money, ownership and offers go through the RPCs:**
  - `listing_create`, `offer_*`, `cobuy_*`, `conversation_start`, `wallet_top_up`, `demo_toggle_membership`
  - keep the TS rules (`rules.ts validateJoin`, `scoreOffers`) for instant form feedback only
- **Keep these behaviours:**
  - the UI and its copy
  - the real-inbox refusal at sign-up (`auth-rules.ts`)
  - the `next=` same-site redirect
  - owner bars, honesty labels, sealed-offer privacy, test-money labels
- **Map RPC error codes** to the same user messages the prototype shows.
- **Realtime:** `useRealtime(table, filter, cb)` from `src/lib/supabase/use-realtime.ts`. Pass a stable callback.
- **Photos:** upload to `listing-photos` at `<uid>/<listing id>/<file>`, then insert `listing_photos` with the SHA-256 of the file.
- **Never** commit `.env.local` or any key, and never paste keys into code or logs.

## Done means

- The feature works on Supabase **and** still works with no Supabase env.
- `npm run check` and `npm run build` are green.
- The task status is updated in `docs/IMPLEMENTATION_PLAN.md`, and `docs/HANDOFF.md` "Last changes" has one line.
- Run the `security-reviewer` agent on the diff before opening the PR.
