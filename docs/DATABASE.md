# DATABASE: the real-time Supabase backend

**Status (Fri 16 Oct, Person 1 backend branch):**
- Configured Supabase now serves existing app reads, authentication, account/wallet actions, listings, FairOffer and co-buy RPCs. Session refresh runs through `src/proxy.ts`. Reads use the signed-in client and RLS; credentials never enter the compatibility snapshot.
- JSON remains the offline fallback when keys are absent or `DEMO_OFFLINE=true`. With Supabase active, JSON writes throw and database failures do not silently fall back.
- Deed Storage/result write-back and anchor persistence are connected, but live partner calls remain unverified. Photo upload, messaging/notification UI, Realtime browser delivery, concurrency/retries, hosted reset and deployment acceptance remain outstanding. See [Person 1 evidence](PERSON1_BACKEND_QA.md).
- Source of truth: `supabase/migrations/*.sql`. [DATA_MODEL.md](DATA_MODEL.md) explains the design history; where the two differ, the migrations win.

**Verified without Supabase:** `npm run db:verify` runs every migration in PGlite (real Postgres compiled to WebAssembly), with stand-ins for Supabase's `auth`/`storage` schemas. It seeds the demo data, then runs **75 checks as real database roles** (guest / signed-in user):
- row-level security
- sealed bids
- co-buy legal rules and the wallet
- messaging privacy
- storage folders
- realtime publication

## 1. What it stores

| Area | Tables | Who can read | Who can write |
|---|---|---|---|
| Accounts | `auth.users` (Supabase Auth: email + password hash), `profiles`, `profile_settings` | Profiles: everyone (name, nationality, membership; **no email**). Settings: owner only | Sign-up trigger; owner edits name/language; membership and reviewer flags are **protected** (trigger) |
| Selling | `buildings`, `properties`, `listings`, `listing_photos` + Storage `listing-photos` (public) | Everyone (drafts: owner only) | Owner via `listing_create()` or direct insert/update; verification badge only by the server |
| Deeds | `documents` + Storage `deeds` (**private**) | Owner and reviewers | Owner uploads; the server writes the AI result; reviewers update review fields |
| Buying (FairOffer) | `offer_rounds`, `offers` | Rounds: everyone. **Offers: your own; the seller only after closing** | RPCs only: `offer_open_round`, `offer_submit`, `offer_close_round`, `offer_set_summary`, `offer_accept` |
| Co-buying | `cobuy_groups`, `cobuy_participants` | Everyone (transparency) | RPCs only: `cobuy_create_group`, `cobuy_commit` (all legal rules + wallet, in one locked transaction) |
| Communication | `conversations`, `conversation_members`, `messages`, `notifications` | Members only / own notifications | `conversation_start()`; members insert messages; **translations only by the server** |
| Engagement | `saved_listings`, `viewing_requests`, `rental_applications` | Owner + the listing's seller | Owner inserts; seller updates status |
| Wallet (test money) | `wallet_transactions`, view `wallet_balances` | Owner only | Sign-up grant (trigger), `wallet_top_up()`; commitments are checked in `cobuy_commit` |
| Transparency | `ledger_entries` (append-only), `ledger_anchors` (Avalanche) | Everyone | Server-side functions only; **no update or delete, ever** (trigger) |
| Market data | `price_index`, `valuations`, `model_cards`, `listing_flags` | Everyone | Server (service role); reviewers set flag status |
| AI ops | `ai_runs`, `ai_cache` | Nobody (server only) | Server |

**RPC error codes** (raised as the error message; map them to the user's language):

| Area | Codes |
|---|---|
| Auth | `NOT_SIGNED_IN` |
| Validation | `VALIDATION`, `RENT_TOO_HIGH`, `BUILDING_AREA_REQUIRED` |
| Co-buy | `MEMBERS_ONLY`, `NOT_ENABLED`, `GROUP_CLOSED`, `GROUP_FULL`, `ALREADY_JOINED`, `AMOUNT_INVALID`, `OWN_LISTING`, `FOREIGN_LAND`, `CONDO_NO_LENDER`, `RATE_INVALID`, `FOREIGN_QUOTA`, `BUILDING_MISSING` |
| Wallet | `WALLET_BALANCE`, `WALLET_LIMIT`, `WALLET_CAP` |
| Offers | `ROUND_CLOSED`, `NOT_OWNER`, `NOT_OWNER_OR_CLOSED`, `NOT_OWNER_OR_OPEN`, `ROUND_NOT_CLOSED`, `CRITERIA_LOCKED` |
| Protected data | `PROTECTED_FIELD`, `PERSONA_FIXED`, `APPEND_ONLY` |
| Demo | `DISABLED`, `NOT_ALLOWED` |

## 2. Real-time

Published tables (`*_realtime_storage.sql`): `messages`, `conversations`, `notifications`, `listings`, `offer_rounds`, `cobuy_groups`, `cobuy_participants`, `ledger_entries`, `ledger_anchors`.
- Realtime applies the same RLS, so people only receive rows they may read.
- **`offers` is deliberately not published:** sealed amounts must never stream. Use `offer_count(round)` for a live count.

Use the hook `src/lib/supabase/use-realtime.ts`:

```tsx
useRealtime("messages", `conversation_id=eq.${conversationId}`, onNewMessage);   // live chat
useRealtime("notifications", `user_id=eq.${me.id}`, onNotification);            // bell / toasts
useRealtime("cobuy_participants", `group_id=eq.${groupId}`, refreshProgress);    // live funding bar
useRealtime("listings", undefined, refreshBrowse);                                // new listings appear
```

## 3. Uploads (seller photos and deeds)

1. **Path:** `<user id>/<listing id>/<file>`. The first folder **must** be the uploader's id; Storage policies enforce it.
2. **Upload from the browser** with the user's session:
   ```ts
   supabaseBrowser().storage.from("listing-photos").upload(path, file, { upsert: false })
   ```
   - Buckets limit size to 5 MB and to the image types (plus PDF for deeds).
3. Insert a `listing_photos` row with `storage_path` and the file's SHA-256, computed in the browser with `crypto.subtle.digest`. The scam rule `duplicate_photo` compares hashes across sellers.
4. **Show photos** with `getPublicUrl(path)`. Deeds are private: the server creates a **10-minute signed URL** for the owner or a reviewer only.

## 4. Set up a Supabase project (≈15 minutes)

1. Create a **free project** at supabase.com, region **Singapore**. Keep the database password in your password manager.
2. **Apply the migrations, in order.** Either:
   - **Dashboard → SQL editor:** paste each file from `supabase/migrations/` and run it (0100 → 0200 → 0300 → 0400); or
   - **CLI:** `npx supabase login`, `npx supabase init` (keep the existing `supabase/migrations`), `npx supabase link --project-ref <ref>`, `npx supabase db push`.
3. **Auth settings:**
   - Email provider ON; "Confirm email" **OFF** for the demo, since nobody receives mail at example.com addresses.
   - Site URL = the Vercel URL. Redirect URLs: `http://localhost:3000/**` and the Vercel URL.
4. **`.env.local`** (never commit; Vercel → Settings → Environment Variables):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>      # public by design, protected by RLS
   SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>          # SERVER ONLY. Never NEXT_PUBLIC_, never in git
   ```
5. Run `npm run db:seed`. It creates the 8 personas (`<name>.persona@example.com`, random unusable passwords), the 3 listings, the offer round and 2 sealed offers. Safe to re-run.
6. Optional: `npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts`, then pass `Database` to the clients.

## 5. Wiring the app to Supabase (the next job; tasks in IMPLEMENTATION_PLAN)

Keep the app working at every step:
- switch per feature behind `supabaseConfigured()`
- keep `npm run check` green
- leave the JSON store as the offline fallback until everything is ported

| Step | What | Replace (JSON store) | With (Supabase) |
|---|---|---|---|
| 1 | Session refresh | — | Add `src/proxy.ts` (Next 16 renamed middleware to proxy; snippet below) |
| 2 | Auth | `src/app/auth/actions.ts` (scrypt + `ue_session`) | Sign up: `supabase.auth.signUp({ email, password, options: { data: { name, nationality, locale } } })`. Keep the real-inbox refusal from `auth-rules.ts`. Sign in: `signInWithPassword`. Sign out: `signOut()`. `currentUser()`: `auth.getUser()` + `profiles` row |
| 3 | Demo personas | `signInAsPersona` | Server: `supabaseAdmin().auth.admin.generateLink({ type: "magiclink", email })`, then `supabaseServer().auth.verifyOtp({ type: "email", token_hash: data.properties.hashed_token })`. **No persona passwords anywhere** |
| 4 | Reads | `readDb()` in pages | `supabaseServer().from(...)`. Listings by `code` or `id`: `.or(\`code.eq.${slug},id.eq.${uuid}\`)` (only pass a uuid to `id`) |
| 5 | Selling | `sell/actions.ts createListing` | `rpc("listing_create", {...})` + photo upload (§3) |
| 6 | Offers | `submitOffer`, `closeRound`, `acceptOffer` | `rpc("offer_submit" / "offer_close_round" / "offer_accept")`. The ranking still uses `scoreOffers()` in TS after close; the AI summary goes through `rpc("offer_set_summary")` |
| 7 | Co-buy | `createCobuyGroup`, `joinCobuy` | `rpc("cobuy_create_group")`, `rpc("cobuy_commit", {p_group, p_lane, p_amount, p_rate, p_request})`. Keep `validateJoin()` for instant form feedback; the DB is authoritative |
| 8 | Wallet and settings | `account/actions.ts` | `wallet_balances` view, `rpc("wallet_top_up")`, `profile_settings` update, `rpc("demo_toggle_membership")`, `auth.updateUser({ password })` |
| 9 | Messaging (new UI) | — | `/messages`, `/messages/[id]`. `rpc("conversation_start")` from the listing page, then insert into `messages`, `useRealtime("messages")`, `rpc("conversation_mark_read")`. Server translates and writes `translations` with `supabaseAdmin()` |
| 10 | Notifications (new UI) | — | Header bell: unread count + list, `useRealtime("notifications")`, `rpc("notifications_mark_read")` |
| 11 | Deed check | `/api/check-document` | Upload to `deeds`; the server reads it with the admin client, runs the AI, inserts `documents`, updates the listing verification and writes the ledger |
| 12 | Ledger + Avalanche | `ledger`, `anchors` in JSON | `ledger_entries` / `ledger_anchors`. Map rows to `LedgerEntry` for `ledger-hash.ts`: `{id, createdAt, userId, entryType, amountThb, listingId, groupId, details, isSimulated}` |

**`src/proxy.ts` (session refresh):**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet) => {
        toSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser(); // refreshes the session cookie when needed
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|brand/|samples/|icon.png|apple-icon.png).*)"] };
```

## 6. Rules for changing the database

- **New change = new migration file** (`supabase/migrations/<yyyymmddhhmmss>_<name>.sql`). Never edit an applied migration.
- Every new table:
  - `enable row level security` plus explicit policies
  - think about whether it belongs in the realtime publication
  - never publish secrets or sealed data
- New functions are executable by PUBLIC by default:
  - `revoke execute … from public, anon`, then grant only what the app calls
  - write `security definer` functions with `set search_path = public`
- Add checks for the new behaviour to `scripts/db/verify.mjs`, then run `npm run db:verify`.
- Never put personal data, keys or passwords in migrations, seeds or tests. Demo emails use `@example.com`.

## 7. Premium and Co-Invest (migration 0700, D-44)

`20261016000700_premium_coinvest.sql` adds, without changing older migrations:

- `profiles.premium`, `premium_since` (protected: only `premium_upgrade` or the service role change them) and `app_settings.premium.fee_thb` (9,900 test money).
- Signed wallet movements: `wallet_transactions.kind` gains `premium_fee`, `share_purchase` (negative), `share_sale`, `refund` (positive); `request_id`, `offering_id`, `trade_id`. `wallet_available(user)` = all movements − co-buy holds. The top-up cap counts grants and top-ups only.
- `coinvest_offerings` (public read, realtime), `coinvest_holdings` and `coinvest_trades` (append-only); read by the member themself or by premium members; no direct writes.
- RPCs (authenticated): `premium_upgrade(request)`, `coinvest_buy(offering, units, request)`, `coinvest_sell(offering, units, request)`. One internal function, `coinvest_apply_trade`, does every check and write in one transaction: lock order profile → offering → building, units ≤ pool / ≤ held, max holders, legal lanes and the 49% quota (`foreign_area_committed` now also used by `cobuy_commit`), wallet balance, ledger entry `share_transfer`, funded → active.
- Service role only: `demo_seed_premium`, `demo_seed_trade`, `coinvest_revalue` (used by `scripts/db/seed-population.ts`).

Apply it in the SQL editor of the hosted project **before** deploying the code that reads it (until then the app keeps working and Co-Invest shows no offerings). Then seed the demo population:

```bash
npx --yes tsx@4.20.6 scripts/db/seed-population.ts            # dry run
npx --yes tsx@4.20.6 scripts/db/seed-population.ts --apply    # idempotent; never deletes
```

Checks: `npm run db:verify` (Co-Invest RPCs, RLS and invariants) and `npx --yes tsx@4.20.6 scripts/db/verify-population.ts` (the population replayed through SQL matches the TypeScript engine unit for unit).
