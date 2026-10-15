# Person 1: backend and transaction QA

Date: 16 October 2026 (ICT). Branch: `codex/person-1-backend-qa`, created from `main` at `a660fd3`.

## Results (16 October, ~05:30 ICT): Person 1 acceptance

**Hosted project:** all 6 migrations applied (0100–0600) and seeded. Every hosted suite below ran against it with labelled QA fixtures, which are then archived (hidden from the site, history kept).

| ID | Area | Result | Evidence |
|---|---|---|---|
| B01 | Hosted setup | **PASS**, except redeploy | `npm run db:preflight` 19/19. App reads and writes Supabase (home shows DB listings; JSON store unchanged in the browser run). Data survives server restarts. **BLOCKED (human):** persistence across a **Vercel redeploy** needs the preview URL |
| B02 | Account lifecycle | **PASS** | `verify-auth-hosted` 16 lifecycle checks: sign-up trigger, two devices, refresh, forged/expired token rejected, password change, other device revoked, old password rejected, generic errors, sign-out. Browser run: sign up → sign out → protected pages redirect → sign in. Guest redirects verified on 6 protected routes |
| B03 | Authorization | **PASS** (1 fix) | `verify-auth-hosted` 27 direct-API attacks all denied and stored rows unchanged. Admin-key code paths audited (anchor, deed check, photos, sign-up, personas). **Fixed:** the one-click Reviewer persona let any visitor become a reviewer (read all private deeds, run reset). Reviewer personas are now refused server-side and hidden; grant reviewer to a real account with `npm run db:make-reviewer -- --email …` |
| B04 | FairOffer | **PASS** | `verify-offers-hosted` 29/29: amounts hidden from seller, other buyers, guests, ledger and notifications while open; count only; owner-only close/accept; late offers refused; ranking matches the hand calculation; one decision only; retries harmless. Guest page HTML and `/api/agent-tools` contain no sealed amounts |
| B05 | Concurrency | **PASS** | `verify-transactions-hosted` 14/14: two sessions race one group (one winner, no overfund); one wallet across two groups; building-wide 49% quota race; top-up cap race. Losers leave **no** participant, ledger or notification rows |
| B06 | Retries / boundaries | **PASS** | Parallel and sequential exact retries return one result and one ledger row; changed payload and foreign replay are refused. `verify-boundaries-hosted` 25/25: interest 0 / 15 / 15.01; amount 0, negative, above remaining; 2–10 participants (sole funder, last slot, no 11th); co-owner required; wallet limit at and above; duplicate join; expired group; legal lanes; non-member; own listing |
| B07 | Storage | **PASS** | `verify-services-hosted`: real photo upload and public display; deeds private (owner and reviewer only); outsider cannot read, overwrite or write into folders; wrong MIME and >5 MB refused; signed URL expires. Browser photo upload and display pass |
| B08 | Realtime | **PASS** (1 fix) | `verify-services-hosted`: two sessions receive messages and notifications live; outsider receives nothing; unread clears; reconnect recovers without duplicates. **Fixed:** browser channels joined as the anonymous role, so chat never arrived live in the UI. The token is now loaded before subscribing (`use-realtime.ts`). Browser two-context chat and notification clear pass |
| B09 | Reset / persistence | **PASS locally; hosted needs a go-ahead** | `db:verify` checks the real reset (archives the three demo listings, recreates fresh copies, keeps accounts, their listings and all ledger history). Hosted: ordinary users refused; reviewer dry-run works. **Real hosted reset not run** (it changes the shared demo Person 2 is testing). Anchor persistence is wired (reviewer-only, append-only); **a deployed anchor needs Person 2's first live Fuji publish + the Vercel preview** |

**Release gate so far:**
- `npm run check` passes: 35 unit tests, 103 local database checks, secret scan.
- `npm run build` passes.
- `npm run qa:hosted` passes: 28 + 43 + 29 + 14 + 25 + 26 = **165 hosted checks**.
- Browser flow (`scripts/browser/verify-supabase.py`, 13 steps, two browser contexts) passed **3 consecutive runs** locally.
- Still to do: the deployed (Vercel preview) runs.

**Run it again:**
- `npm run qa:hosted` (writes labelled QA fixtures, then archives them)
- `tmp/qa-venv/Scripts/python.exe scripts/browser/verify-supabase.py --allow-demo-writes`, then `npm run qa:archive`

## Earlier implementation notes (16 October, Supabase wiring pass)

Existing app operations now use Supabase when its public URL/key are configured: SSR Auth and refresh, profile/password/membership/wallet settings, test-money top-up, listing creation, FairOffer and co-buy RPCs. All snapshot reads use the caller's RLS session; credential arrays are empty. Configured database errors do not fall back to JSON and `updateDb` rejects hosted writes. `DEMO_OFFLINE=true` explicitly selects the old prototype; missing keys retain the no-key fallback.

Reserved `example.com`, `example.org`, and `example.net` demo signup uses server-only Auth admin creation, gated by app demo mode **and** the database demo flag. Supabase's public signup rejected those addresses with `email_address_invalid`. Other domains use public signup; common real inbox providers remain refused. Signup is limited to five attempts/minute/IP per server instance. No passwords or session tokens are printed or saved by the smoke test.

Evidence:
- `npm run check`: typecheck, lint, **35 unit tests**, **75 local database checks**, secret scan pass. Scratch Python environments are excluded from lint/TypeScript.
- `npm run build`: production compilation passes.
- `node --env-file-if-exists=.env.local scripts/db/verify-hosted.mjs`: **28 hosted checks pass** (Auth, refresh, seeded records, RLS, local signout).
- Headless Edge via Python Playwright, localhost app with the hosted database: signup and grant; top-up; profile/membership update; password change; signout; protected account redirect; signin; listing creation; seller opens FairOffer; separate buyer submits; seller cannot see amount before close; seller closes, sees ranking and accepts; a separate house listing opens co-buy; member commits; reload and wallet show the same commitment. Test sessions sign out at the end of a successful run.
- A fresh production server process on port 3100 read the listing and decided round written through the dev server; guest offer amounts remained hidden. This confirms persistence across local server processes, not a Vercel redeployment. The complete browser script also passed its unchanged-JSON assertion.
- Repeatable browser script: `scripts/browser/verify-supabase.py --allow-demo-writes` using Python with Playwright installed and Edge available. `TEST_BASE_URL` overrides localhost:3000. It creates two accounts and two labelled QA listings; fixtures deliberately remain because ledger history is append-only. Never run it against real user data. It also asserts that `.data/db.json` is unchanged.

Still **not accepted**:
- Concurrent commitments across groups: current SQL locks the group but needs review/fixes for shared wallet locking, building-wide quota reservations, and minimum-participant full-funding cases. Request IDs are not yet supplied by forms; retry semantics remain open.
- Real Storage writes/permissions, photo-upload UI, messaging/notification UI and Realtime websocket delivery. The existing deed endpoint now uploads privately and persists results, but its multi-step write-back is not atomic and live AI execution is Person 2's test.
- Hosted reset is disabled and labelled; the old JSON reset must not pretend to reset Supabase. An archive-aware reset design remains needed.
- Anchor persistence is connected with reviewer authorization and a stable ledger hash shape, but publishing, recovery after persistence failure and deployed verification need Person 2/live credentials. No claim of a successful Fuji transaction.
- Production redeployment, browser token expiry/refresh, multi-device password revocation, browser direct-action tampering, and the full release gate remain pending.

No additional SQL migration or dashboard operation is needed for this wiring pass. For deployment, set the same three Supabase variables in the preview environment, `DEMO_MODE=true`, and `DEMO_OFFLINE=false`; redeploy and run the smoke test on that preview. Never send keys in chat. Keep this demo's data isolated.

## Ownership and scope

Person 1 owns backend verification, regression tests, and necessary backend fixes: accounts, authorization, sealed offers, transactional co-buy, storage permissions, realtime privacy, reset, and persistence. Person 2 owns AI output/evaluations, voice, Tokenomist, live Avalanche publish/verify, translations/RTL, and interface accessibility. Person 1 checks anchor storage persistence; coordinate the anchor fixture with Person 2 without changing their live integration.

Use separate checkouts for the two developers. A branch alone does not isolate simultaneous edits in the same folder. Keep test fixtures separate and do not reset a shared demo while the other developer is testing.

Primary files: `scripts/db/`, `supabase/migrations/`, backend test files, `src/lib/supabase/`, session and server-action code. Coordinate shared page/layout/API changes before overlapping edits. New DB fixes use new migrations; do not edit applied migrations.

## Historical baseline and setup notes (superseded by current evidence above)

### First implementation pass

### Hosted setup verified after migrations

- Human applied the four-migration SQL bundle successfully on 16 October.
- Hosted preflight now passes: application tables exposed, Auth admin access works, guest private-table reads return no rows, public photo/private deed bucket configuration is correct.
- `npm run db:seed` succeeded: eight personas, three properties/listings, one round with two sealed offers.
- Added `scripts/db/verify-hosted.mjs` (run with `node --env-file=.env.local scripts/db/verify-hosted.mjs`). **28 checks passed** using isolated authenticated sessions for Malee, Ploy, Narin and Somchai. Tested seeded data, sealed offers, wallet/settings RLS, refresh and local sign-out. All created test sessions were signed out; no offer rounds or profile data were modified by these tests.
- The submitted-offer ledger check currently allows an empty result; it is not evidence that an actual offer submission is safe end-to-end.
- Remaining: application persistence/auth wiring, real concurrent transactions, Storage operations, realtime websocket delivery, full account lifecycle, reset and redeployment. The earlier missing-schema blocker below is resolved; other baseline limitations still apply.

- Hosted Admin Auth connection verified with local credentials; no values printed.
- Hosted schema is missing: actual row queries return `PGRST205`. HEAD-only requests were insufficient to establish schema presence; preflight now requires array-shaped query results.
- Added read-only `scripts/db/preflight.mjs` for Auth, schema, public reads, guest privacy and bucket visibility. It intentionally fails until setup is complete and does not certify RLS beyond the cases checked.
- Added `scripts/db/bundle-migrations.mjs`; generated `tmp/supabase-setup.sql` (ignored) for one-time SQL Editor setup on the empty demo project. Human is applying the bundle.
- Expanded local verification from 62 to **75 passing checks**: guest/closed-group rejection, interest and amount boundaries, offer authorization/closure, failed-RPC rollback, wallet cap, and cross-user settings/notification protection.
- Next: rerun hosted preflight after migrations, seed and validate hosted auth/roles, then integrate runtime persistence. Review wallet locking across groups, building-wide quota reservations and replay semantics before claiming concurrency/idempotency acceptance. No hosted transactional or browser test is marked passed yet.

- Previous audit at this base: typecheck, lint, 35 unit tests, 62 PGlite checks, secret scan, and production build passed.
- PGlite uses stand-ins for Supabase Auth and Storage. Its publication checks do not prove websocket delivery, and its sequential RPC checks do not prove concurrency safety.
- Runtime pages/actions still use the JSON store. Supabase clients, migrations, RPCs, policies and seed scripts exist, but hosted integration remains a prerequisite to hosted end-to-end acceptance.
- `.env.local` was absent when planning started. No hosted Supabase or Vercel access has been verified.
- Treat missing implementations as BLOCKED, not passed. Track backend prerequisites against T01/T02/T02b/T03/T04/T05/T06/T20/T32/T37/T38 as applicable; do not count them complete merely because a QA plan exists.

## Execution order

1. **Local regression coverage:** extend the existing isolated DB verifier for missing authorization, boundary and retry cases. Reproduce failures before fixes; retain existing passing cases.
2. **Hosted prerequisites:** verify a dedicated demo/test Supabase project, apply migrations in order, seed once, and verify roles/policies. Complete or integrate the backend wiring required by each tested flow. Read installed Next.js docs before implementation.
3. **Accounts and actions:** exercise signed-out, owner, unrelated user, reviewer, member and non-member sessions through real requests. Test auth lifecycle and action authorization, not only UI visibility.
4. **Transaction correctness:** run independent authenticated clients concurrently against real Postgres; verify committed rows and balances after success, rejection and retry.
5. **Storage and realtime:** use actual Storage HTTP operations and separate client subscriptions/browser sessions. Validate denial paths as well as successful uploads and events.
6. **Deployed acceptance:** use a branch preview and the same test DB; prove persistence after process restart/redeploy. Run Person 1 smoke cases twice consecutively, then combine with Person 2 results.

## Test matrix

| ID | Area | Required evidence |
|---|---|---|
| B01 | Hosted setup | Migrations/seed succeed; app writes visible in Supabase; data survives restart/redeployment; no silent JSON fallback during hosted tests. |
| B02 | Account lifecycle | Sign up/out/in, refresh and expired session, password change and old-password rejection, other-session handling, personas, guest redirects and protected actions. |
| B03 | Authorization | Direct requests cannot modify another user's account/listing/wallet/deed; membership/reviewer escalation denied except documented demo membership exception; client-supplied identity ignored. |
| B04 | FairOffer | Own-offer visibility only while open; seller/other buyer/guest cannot see sealed amounts through pages, responses, realtime or ledger. Owner closes/ranks/accepts; unauthorized close/accept and post-close edits fail. |
| B05 | Concurrency | Two users compete for remaining group capacity; one wallet competes across two groups; parallel quota use across groups in one building. Totals never exceed limits; rejected transactions leave no partial participants, ledger entries or notifications. |
| B06 | Retries/boundaries | Same request ID retried sequentially and concurrently; mismatched replay payload/user; quota exactly 49% and above; interest 0%, 15%, above 15%; 2–10 participants; sole participant attempting full funding; wallet balance/limit/top-up cap; closed groups and duplicate membership. |
| B07 | Storage | Own photo upload/display; foreign-folder writes denied; private deed denied to outsider/guest and allowed to owner/reviewer; signed URL expires; invalid type and over-5MB upload rejected; listing metadata ownership enforced. |
| B08 | Realtime | Two sessions receive permitted messages/notifications; outsider receives none; unread/read state correct; reconnect does not lose persisted messages or duplicate rendered messages; sealed offers never stream. |
| B09 | Reset/persistence | Reset only affects intended demo activity and keeps signed-up accounts/listings; DB reset authorization enforced; anchors persist after deployment and remain tied to the correct ledger snapshot. |

## Test harness and reporting

- Local: extend `scripts/db/verify.mjs` and pure unit fixtures where applicable.
- Hosted: separate integration harness using per-test users and records in the designated test project. Use ordinary authenticated clients for permission assertions; admin access only for fixture setup and verification/cleanup. Never log passwords, keys or tokens.
- Concurrency: independent connections/clients with an explicit simultaneous-start barrier. Assert final stored state, not just HTTP status. Sequential PGlite tests are insufficient evidence.
- Browser: follow the repository webapp-testing skill when implementing browser tests. Use separate browser contexts for seller, buyer and outsider.
- Record revision, environment, case ID, PASS/FAIL/BLOCKED, redacted evidence, reproduction steps and cleanup. Do not reset or delete pre-existing user data to clean up fixtures.
- Release gate: `npm run check`, `npm run build`, hosted cases pass, deployed Person 1 flow passes twice, no unresolved P0 failures. Partner/AI readiness is separately reported by Person 2.

## Human setup needed

1. Create or identify a dedicated Supabase demo/test project (Singapore per project plan). Keep database password in a password manager. Confirm the project contains no real user data before using seed/reset tests.
2. Fill these values locally in the git-ignored `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable or legacy anon key), and `SUPABASE_SERVICE_ROLE_KEY` (server secret or legacy service-role key). Never paste keys into chat or commit them.
3. In Supabase Authentication, enable email/password. For this made-up-email demo project only, disable email confirmation. Add localhost and the actual preview URL to the allowed redirect URLs; set the Site URL appropriately.
4. Apply migrations from `supabase/migrations/` in filename order using the dashboard SQL editor, or authenticate the CLI locally so the developer can apply them. Record which migrations are applied; do not blindly rerun them. The seed script can then be run against the designated project.
5. When ready for hosted browser tests, connect/import the GitHub repository in Vercel and configure Preview environment variables for this branch using the test-project credentials and `DEMO_MODE=true`. Redeploy after changing environment variables. Provide the preview URL, not secrets.

Only project readiness, migration status, and a preview URL need to be communicated in chat. Supabase project creation/login and GitHub/Vercel connection consent may need the human account owner. Local test preparation can continue before those steps finish.

Official setup references:
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/auth/redirect-urls
- https://vercel.com/docs/environment-variables
- https://vercel.com/docs/deployments/environments
