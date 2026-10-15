# API: server actions, route handlers, realtime

**Conventions:**
- All mutations are **server actions** (`src/app/actions/*.ts`) or `POST` route handlers. Never `GET` for state changes.
- Inputs are validated with zod on the server. The auth user comes from the Supabase server client, never from the client payload.
- **Action result shape:** `{ ok: true, data } | { ok: false, code: "ERROR_CODE", message: string, fieldErrors?: Record<string,string> }`. `message` is already translated for the user's locale.
- Every money or ownership action takes `requestId` (uuid) for idempotency (`ledger_entries.request_id`).

## 1. Server actions

| Action | Input | Auth | Effect | Errors |
|---|---|---|---|---|
| `profile.update` | name, nationality, is_thai, locale, currency | self | Update profile (not member/reviewer flags) | VALIDATION |
| `profile.setLocale` | locale | any (cookie) / self | Cookie + profile | — |
| `listings.create` | property fields, kind, asking_price, description, cobuy_enabled | seller | Insert property + listing; trigger valuation + scam rules | VALIDATION |
| `listings.uploadPhoto` | listingId, file | owner | Storage + `listing_photos` (sha256) → duplicate-photo rule | FILE_TYPE, FILE_SIZE |
| `offers.publishRound` | listingId, criteria (weights sum 100), closesAt | seller | Insert round (locks criteria) | WEIGHTS_SUM |
| `offers.submit` | roundId, price, funding, closingDays, conditions, requestId | buyer ≠ seller | Upsert own offer; ledger `offer_submitted` | ROUND_CLOSED, OWN_LISTING |
| `offers.close` | roundId | seller | Status closed; code ranking; AI summary (per locale, cached) | NOT_OWNER |
| `offers.accept` | offerId, requestId | seller, round closed | Accept/decline others; listing `under_offer`; ledger `offer_accepted`; notify buyers via message | NOT_OWNER, ROUND_OPEN |
| `cobuy.create` | listingId | member | Insert group (one open per listing) | MEMBERS_ONLY, NOT_ENABLED |
| `cobuy.commit` | groupId, lane, amount, rate?, requestId | member | **RPC `cobuy_commit`** ([DATA_MODEL.md](DATA_MODEL.md) §4); on funded → ledger `co_owner_share` + `loan` | MEMBERS_ONLY, GROUP_FULL, AMOUNT_INVALID, FOREIGN_LAND, CONDO_NO_LENDER, RATE_INVALID, FOREIGN_QUOTA, GROUP_CLOSED |
| `messages.start` | listingId, firstMessage | signed in ≠ seller | Create conversation + members (requester + seller) + first message | OWN_LISTING |
| `messages.send` | conversationId, body | member of conversation | Insert message; scam-phrase rules → `risk_flags`; translate for other members (async) | NOT_MEMBER, TOO_LONG |
| `messages.markRead` | conversationId | member | Update `last_read_at` | — |
| `saved.toggle` | listingId | signed in | Insert/delete | — |
| `viewings.request` | listingId, preferredAt | signed in | Insert request + system message to the seller | — |
| `rentals.apply` (P1) | listingId, moveIn, months, note | signed in | Insert application | NOT_RENTAL |
| `review.decide` | documentId or flagId, decision, note | reviewer | Update review fields / flag status | NOT_REVIEWER |
| `demo.signInAs` | personaEmail | `DEMO_MODE` only | `signInWithPassword` with the server-side `DEMO_PASSWORD` | DISABLED |
| **Prototype (built, JSON store):** `auth/actions.ts`: `signUp`, `signIn`, `signOut`, `signInAsPersona` | Sign up: name, email, password, nationality, locale. Sign in: email, password. Persona: userId | any / `DEMO_MODE` | scrypt hash; session cookie `ue_session` (httpOnly, SameSite=Lax, Secure in prod, 7 days); redirects only to a same-site `next` | field errors; generic "Email or password is incorrect."; 5 tries per 5 min |
| `account/actions.ts`: `updateProfile`, `changePassword`, `toggleMembership` (demo), `topUpWallet`, `updateWalletSettings` | form fields | self | Profile, password hash, membership flag (demo), wallet txns, payout + max commitment | VALIDATION |
| `sell/actions.ts`: `createListing`, `openOfferRound` | listing fields / listingId | signed in / owner | Building (condo co-buy) + property + listing; FairOffer round with weights 50/25/15/10 | VALIDATION, NOT_OWNER |
| `demo.reset` | — | reviewer + `DEMO_MODE` | Re-run the demo seed for demo tables | DISABLED |

## 2. Route handlers (`src/app/api/*`)

| Route | Method | Input → Output | Notes |
|---|---|---|---|
| `/api/check-document` | POST multipart `deed`, `listingId` | `{result, flags, outcome}` | Exists. Move the file to the private `deeds` bucket; write `documents` + ledger |
| `/api/explain` | POST `{listingId, lang}` | `{text, source: "ai"\|"template"\|"cache"}` | **Built:** 5 locales (`lang` = en/th/ar/zh-Hant/es). Still to add: cache |
| `/api/assistant` | POST `{messages[], locale}` | **NDJSON stream**: `{"type":"text"}` / `{"type":"tool"}` / `{"type":"done"}` / `{"type":"error"}` | **Built (MVP on JSON store).** Tool runner ([AI_SPEC.md](AI_SPEC.md) §3.1) with the shared tools; rate-limited; 503 if AI not configured |
| `/api/stress-test` | POST `{listingId, preset\|shocks, equityPct, groupId?}` | `{results, explanation}` | Engine §4.1; explanation optional (`explain=true`) |
| `/api/market/[district]` | GET `?type=condo` | `{stats, trend, summary}` | Read-only; summary cached daily |
| `/api/match` | POST `{goal, budget, priority, locale}` | `{matches:[{listingId, score, reason}]}` | P1 |
| `/api/translate` | POST `{text, target}` | `{detected_lang, translation}` | Used by listing descriptions; chat uses the action |
| `/api/voice/tts` | POST `{text}` | `audio/mpeg` or 501 | **Built.** E1. Eleven v3; in-memory audio cache |
| `/api/voice/stt` | POST multipart `audio`, `language?` | `{text, lang, confidence}` or 501 | **Built.** E2. Scribe `scribe_v2`; recording not stored |
| `/api/voice/agent-token` | GET | `{token}` or 501 | **Built.** E3. One-conversation WebRTC token from `/v1/convai/conversation/token` |
| `/api/agent-tools` | POST `{tool, input}` | `{result}` | **Built.** E3 client tools → `runTool` (zod-validated, read-only): `search_listings`, `get_listing_facts`, `compute_fees`, `check_token_unlocks`, `get_cobuy_rules` |
| `/api/search` | POST `{query, locale}` | `{filters, parser: "ai"\|"keywords", results[], summary}` | **Built.** E2 + typed search |
| `/api/token-check` | POST `{token, depositThb, payWithinDays}` | `{token, result (R13), note?, advice[]}` | **Built.** T1. Tokenomist v5 or SAMPLE tokens |
| `/api/anchor` | POST | `{anchor}` · 409 `ALREADY_ANCHORED`/`NOTHING_TO_ANCHOR` · 501 with `{headHash, chainMessage}` | **Built.** A1. Fuji transaction; production: cron + `CRON_SECRET` |
| `/api/anchor/verify` | GET `?id=` | `{verdict: verified\|mismatch\|chain_unreachable, ledgerUnchanged, chain}` | **Built.** A1. Recompute + read back from chain |
| `/api/status` | GET | `{db, ai, voice, modelCard}` | Reviewer only |

**Errors:** HTTP 400 (validation), 401/403 (auth), 404, 409 (conflict / idempotent repeat), 429 (rate limit), 501 (partner not configured: the client shows its fallback), 502 (AI or partner upstream), 503 (AI not configured). The body is always `{code, message}`.

## 3. Realtime

- **Channel:** `postgres_changes` on `public.messages` with `filter: conversation_id=eq.<id>`; RLS restricts it to members.
- **Unread badge:** on login, query the conversations with `max(messages.created_at) > last_read_at`, then subscribe to `messages` inserts for the user's conversations.
- `translations` updates arrive as `UPDATE` events. The client swaps the "translating…" placeholder for the translated text.

## 4. State machines

```
listing:    draft → active → under_offer → sold          (rent: active → rented)   any → withdrawn
round:      open → closed → decided
offer:      submitted → accepted | declined
cobuy:      forming → funded | cancelled (deadline passed, P1 job)
document:   uploaded → verified_sample | needs_review → (reviewed)
flag:       open → confirmed | dismissed
viewing:    requested → confirmed | declined
```
