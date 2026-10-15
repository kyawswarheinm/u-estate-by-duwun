# DATA_MODEL: Supabase schema, RLS and seed

> **Superseded for implementation (16 Oct):** the real, verified schema is in `supabase/migrations/` (`npm run db:verify`, 62 checks), explained in [DATABASE.md](DATABASE.md). This file keeps the design history. Where they differ, **the migrations win**. Main differences:
> - no email or password columns: accounts are Supabase Auth
> - private settings live in `profile_settings`
> - new tables: `wallet_transactions`, `notifications`, `ledger_anchors`
> - owner columns on properties and buildings
> - money, ownership and offer writes go through RPCs
> - realtime publication and storage policies are included

Copy each SQL block into `supabase/migrations/` in order. Every table has RLS enabled.
Rules referenced: R1–R12 in [PRD.md](PRD.md) §7.

## 1. Entities

```
profiles ─┬─< listings >── properties >── buildings
          ├─< documents (deed checks)
          ├─< offers >── offer_rounds >── listings
          ├─< cobuy_participants >── cobuy_groups >── listings
          ├─< conversation_members >── conversations >── listings
          ├─< messages >── conversations
          ├─< saved_listings, viewing_requests, rental_applications
          └─< ledger_entries
listing_photos >── listings     valuations >── listings     price_index (series)
listing_flags >── listings      ai_runs, ai_cache           model_cards
```

## 2. Schema (migration `0001_schema.sql`)

```sql
create extension if not exists pgcrypto;

-- ---------- people ----------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null,
  nationality text not null default 'Thai',
  is_thai boolean not null default true,
  utopia_member boolean not null default false,      -- admin/seed only (trigger)
  is_reviewer boolean not null default false,        -- admin/seed only (trigger)
  roles text[] not null default '{buyer}',           -- buyer|seller|landlord|tenant|co_buyer|manager
  locale text not null default 'en' check (locale in ('en','th','ar','zh-Hant','es')),
  currency text not null default 'THB',
  created_at timestamptz not null default now()
);

-- ---------- property ----------
create table buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  district text not null,
  province text not null default 'Bangkok',
  total_floor_area_sqm numeric not null check (total_floor_area_sqm > 0),
  foreign_area_used_sqm numeric not null default 0 check (foreign_area_used_sqm >= 0),
  build_year int,
  nearest_rail text, rail_walk_min int
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('condo','house','land','townhouse','building')),
  building_id uuid references buildings,
  title text not null,
  district text not null,
  province text not null,
  area_sqm numeric not null check (area_sqm > 0),
  bedrooms int, floor int, build_year int,
  lat double precision, lng double precision,
  nearest_rail text, rail_walk_min int,
  deed_type text,
  official_appraisal_thb numeric, appraisal_source text, appraisal_date date,
  last_sale_price_thb numeric, last_sale_date date,
  index_series text not null default 'condo_bkk'
);

create table listings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties on delete cascade,
  seller_id uuid not null references profiles,
  kind text not null check (kind in ('sale','rent')),
  asking_price_thb numeric not null check (asking_price_thb > 0),   -- monthly rent if kind = rent
  description_original text, description_lang text default 'th',
  description_translations jsonb not null default '{}',             -- {locale: text}
  status text not null default 'active' check (status in ('draft','active','under_offer','sold','rented','withdrawn')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified_sample','needs_review')),
  verification_reasons text[] not null default '{}',
  cobuy_enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create index on listings (status, kind);

create table listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  storage_path text not null, sha256 text,          -- sha256 used by duplicate-photo scam rule
  position int not null default 0
);

-- ---------- trust ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references listings on delete cascade,
  owner_id uuid not null references profiles,
  storage_path text not null,                        -- private bucket 'deeds'
  extraction jsonb, flags jsonb not null default '[]',
  outcome text check (outcome in ('verified_sample','needs_review')),
  reviewed_by uuid references profiles, review_note text, reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table listing_flags (                          -- scam / manipulation signals (R11)
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  code text not null,                                -- price_far_below | duplicate_photo | deed_mismatch | seller_velocity | offplatform_payment
  severity text not null check (severity in ('info','warning','critical')),
  evidence jsonb not null default '{}',
  status text not null default 'open' check (status in ('open','dismissed','confirmed')),
  created_at timestamptz not null default now()
);

-- ---------- valuation ----------
create table price_index (                            -- Bank of Thailand RPPI (or SAMPLE until replaced)
  series text not null, month date not null, value numeric not null,
  source text not null, is_sample boolean not null default true,
  primary key (series, month)
);

create table valuations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  model_version text not null,
  likely_thb numeric, low_thb numeric, high_thb numeric,
  forecast jsonb,      -- {"1Y":{central,low,high}, "3Y":..., "5Y":...}
  factors jsonb,       -- [{label, pct}]
  inputs jsonb, created_at timestamptz not null default now()
);

create table model_cards (
  model_version text primary key,
  metrics jsonb not null,      -- {median_ape, within_10_pct, range_coverage, n_train, n_test, test_period}
  dataset jsonb not null,      -- {name, rows, is_synthetic, last_update, sources[]}
  created_at timestamptz not null default now()
);

-- ---------- offers ----------
create table offer_rounds (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references listings on delete cascade,
  criteria jsonb not null,                 -- [{key,label,weight}] weights sum 100
  rules_published_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open','closed','decided')),
  accepted_offer_id uuid,
  ai_summary jsonb not null default '{}'   -- {locale: text}
);

create table offers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references offer_rounds on delete cascade,
  buyer_id uuid not null references profiles,
  price_thb numeric not null check (price_thb > 0),
  funding text not null check (funding in ('pre_approved','proof_uploaded','declared','cash')),
  closing_days int not null check (closing_days between 7 and 180),
  conditions text not null default '',
  status text not null default 'submitted' check (status in ('submitted','accepted','declined')),
  submitted_at timestamptz not null default now(),
  unique (round_id, buyer_id)
);

-- ---------- co-buy ----------
create table cobuy_groups (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  target_thb numeric not null check (target_thb > 0),
  deadline timestamptz not null,
  status text not null default 'forming' check (status in ('forming','funded','cancelled')),
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);
create unique index one_open_group_per_listing on cobuy_groups (listing_id) where status <> 'cancelled';

create table cobuy_participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references cobuy_groups on delete cascade,
  user_id uuid not null references profiles,
  lane text not null check (lane in ('co_owner','lender')),
  amount_thb numeric not null check (amount_thb > 0),
  interest_rate_pct numeric check (interest_rate_pct is null or (interest_rate_pct > 0 and interest_rate_pct <= 15)),
  area_sqm_attributed numeric,
  fet_required boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id),
  check ((lane = 'lender') = (interest_rate_pct is not null))
);

-- ---------- communication ----------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  created_by uuid not null references profiles,
  created_at timestamptz not null default now()
);
create table conversation_members (
  conversation_id uuid references conversations on delete cascade,
  user_id uuid references profiles,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations on delete cascade,
  sender_id uuid not null references profiles,
  body_original text not null check (char_length(body_original) between 1 and 2000),
  lang_original text,
  translations jsonb not null default '{}',     -- {locale: text}
  risk_flags text[] not null default '{}',      -- e.g. {'offplatform_payment'}
  created_at timestamptz not null default now()
);
create index on messages (conversation_id, created_at);

-- ---------- engagement ----------
create table saved_listings (user_id uuid references profiles, listing_id uuid references listings on delete cascade, created_at timestamptz default now(), primary key (user_id, listing_id));
create table viewing_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  requester_id uuid not null references profiles,
  preferred_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested','confirmed','declined')),
  created_at timestamptz not null default now()
);
create table rental_applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings on delete cascade,
  tenant_id uuid not null references profiles,
  move_in date, months int check (months between 1 and 36), note text,
  status text not null default 'submitted' check (status in ('submitted','accepted','declined')),
  created_at timestamptz not null default now()
);

-- ---------- transparency ledger (R8) ----------
create table ledger_entries (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references profiles,
  entry_type text not null check (entry_type in ('document_checked','offer_submitted','offer_accepted','commit_test_funds','co_owner_share','loan','listing_flagged')),
  amount_thb numeric,
  listing_id uuid references listings, group_id uuid references cobuy_groups,
  details text not null,                                -- offer_submitted: never include the sealed amount (I-01)
  is_simulated boolean not null default true,
  request_id uuid unique,                               -- idempotency
  entry_hash text                                       -- A1: sha256 chain, set by trigger (§2a)
);

-- ---------- AI ops ----------
create table ai_runs (id bigserial primary key, feature text not null, model text, latency_ms int, ok boolean, error text, input_tokens int, output_tokens int, user_id uuid, created_at timestamptz default now());
create table ai_cache (key text primary key, value jsonb not null, created_at timestamptz default now());
```

## 1a. Accounts and wallet

**Prototype (JSON store, built):**
- `accounts {userId, email, passwordHash ("scrypt$N$r$p$salt$hash"), createdAt, passwordChangedAt?}`
- `sessions {tokenHash (sha256), userId, createdAt, expiresAt}`
- `walletTxns {id, userId, kind: demo_grant | top_up, amountThb, note, createdAt}`
- profile fields: `email`, `locale`, `isDemoPersona`, `payoutMethod`, `maxCommitThb`, `utopiaLinkedAt`

Credentials are never sent to the browser. Wallet balance = grants + top-ups − commitments in non-cancelled co-buy groups (`src/lib/wallet.ts`).

**Supabase (production):** accounts and sessions use **Supabase Auth**, with no password column of our own. Add:

```sql
alter table profiles add column payout_method text check (payout_method in ('utopia_wallet','escrow_bank_transfer')),
                     add column max_commit_thb numeric check (max_commit_thb is null or max_commit_thb >= 10000);
create table wallet_transactions (            -- test money only (D-40)
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  kind text not null check (kind in ('demo_grant','top_up')),
  amount_thb numeric not null check (amount_thb > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table wallet_transactions enable row level security;
create policy wallet_read on wallet_transactions for select using (user_id = auth.uid());
-- inserts only via server functions (sign-up grant, top-up with the 20M THB cap); cobuy_commit also checks the balance
```

## 2a. Ledger fingerprints for Avalanche (migration `0004_anchors.sql`, D-33)

Same algorithm as `src/lib/ledger-hash.ts`: `hash_n = sha256(hash_{n-1} || '
' || canonical_json(entry_n))`, starting from 64 zeros.
- Compute the hash in the app at insert time (server action or RPC). In Postgres, `jsonb` key order differs from the TS canonical JSON, so **keep one implementation**: the TS one, called before insert.
- Store it in `entry_hash`. The append-only trigger already blocks edits.
- **Offer amounts:** `offer_submitted` entries carry **no amount** (sealed until close). The amount appears only in `offer_accepted`.

```sql
create table ledger_anchors (
  id uuid primary key default gen_random_uuid(),
  up_to_entry_id bigint not null references ledger_entries(id),
  entry_count int not null,
  head_hash text not null check (head_hash ~ '^[0-9a-f]{64}$'),
  message text not null,                        -- exact UTF-8 text written on-chain
  chain_id int not null default 43113 check (chain_id = 43113),   -- Fuji only (D-33)
  tx_hash text not null unique,
  explorer_url text not null,
  created_at timestamptz not null default now()
);
alter table ledger_anchors enable row level security;
create policy anchors_read on ledger_anchors for select using (true);           -- public, like the ledger
-- no insert/update/delete policies: only the server (service role) via /api/anchor or the cron job
create trigger trg_anchors_no_update before update or delete on ledger_anchors for each row execute function ledger_no_update();
```

Tokenomist and voice data are **not stored**: token checks are computed on request; recordings are forwarded once.

## 3. RLS (migration `0002_rls.sql`): summary plus key policies

| Table | Read | Write |
|---|---|---|
| profiles | Everyone signed in (public fields) | Self, **except** `utopia_member`, `is_reviewer` (trigger) |
| buildings, properties, listings, listing_photos, valuations, model_cards, price_index | Public (anon) | Listing owner (properties/listings/photos); service role (valuations, model_cards, price_index) |
| documents | Owner + reviewers | Owner insert; reviewers update review fields |
| listing_flags | Public summary (code, severity); evidence only for reviewers | Server (service role) and reviewers |
| offer_rounds | Public | Listing seller (insert; update status only) |
| offers | **Own offers**; seller sees all **only when round status ≠ open** | Buyer insert/update own while open; seller can't bid on own listing |
| cobuy_groups / participants | Public read | **Only via `cobuy_commit()` RPC** (no direct insert policy) |
| conversations / members / messages | Members only | Members insert messages; creator creates the conversation with the seller |
| saved_listings, viewing_requests, rental_applications | Owner (+ listing owner for requests and applications) | Owner insert; listing owner updates status |
| ledger_entries | Public | Insert via server functions only; **no update/delete** |
| ledger_anchors | Public | Server (service role) only; **no update/delete** |

```sql
alter table offers enable row level security;
create policy offers_read on offers for select using (
  buyer_id = auth.uid()
  or exists (select 1 from offer_rounds r join listings l on l.id = r.listing_id
             where r.id = offers.round_id and l.seller_id = auth.uid() and r.status <> 'open')
);
create policy offers_insert on offers for insert with check (
  buyer_id = auth.uid()
  and exists (select 1 from offer_rounds r join listings l on l.id = r.listing_id
              where r.id = round_id and r.status = 'open' and l.seller_id <> auth.uid())
);

alter table messages enable row level security;
create policy msg_read on messages for select using (
  exists (select 1 from conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()));
create policy msg_insert on messages for insert with check (
  sender_id = auth.uid() and exists (select 1 from conversation_members m where m.conversation_id = messages.conversation_id and m.user_id = auth.uid()));

-- protect privileged profile flags
create or replace function protect_profile_flags() returns trigger language plpgsql as $$
begin
  if (new.utopia_member is distinct from old.utopia_member or new.is_reviewer is distinct from old.is_reviewer)
     and coalesce(current_setting('request.jwt.claims', true)::json->>'role', '') <> 'service_role' then
    raise exception 'Only admins can change membership or reviewer flags';
  end if;
  return new;
end $$;
create trigger trg_protect_profile_flags before update on profiles for each row execute function protect_profile_flags();

-- ledger is append-only
create or replace function ledger_no_update() returns trigger language plpgsql as $$
begin raise exception 'ledger is append-only'; end $$;
create trigger trg_ledger_no_update before update or delete on ledger_entries for each row execute function ledger_no_update();
```

## 4. `cobuy_commit` (migration `0003_cobuy.sql`): authoritative R2–R7

```sql
create or replace function cobuy_commit(p_group uuid, p_lane text, p_amount numeric, p_rate numeric, p_request uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g cobuy_groups; prof profiles; prop properties; b buildings;
        v_committed numeric; n int; foreign_area numeric := 0; attributed numeric; fet boolean := false;
begin
  select * into g from cobuy_groups where id = p_group for update;            -- lock (race safety)
  if g.status <> 'forming' then raise exception 'GROUP_CLOSED'; end if;
  select * into prof from profiles where id = auth.uid();
  if not prof.utopia_member then raise exception 'MEMBERS_ONLY'; end if;                         -- R2
  select coalesce(sum(amount_thb),0), count(*) into v_committed, n from cobuy_participants where group_id = p_group;
  if n >= 10 then raise exception 'GROUP_FULL'; end if;                                          -- R3
  if p_amount <= 0 or p_amount > g.target_thb - v_committed then raise exception 'AMOUNT_INVALID'; end if;
  select p.* into prop from listings l join properties p on p.id = l.property_id where l.id = g.listing_id;
  if prop.type <> 'condo' and p_lane = 'co_owner' and not prof.is_thai then raise exception 'FOREIGN_LAND'; end if; -- R4
  if prop.type = 'condo' and p_lane = 'lender' then raise exception 'CONDO_NO_LENDER'; end if;
  if p_lane = 'lender' and (p_rate is null or p_rate <= 0 or p_rate > 15) then raise exception 'RATE_INVALID'; end if; -- R7
  if prop.type = 'condo' and not prof.is_thai then                                               -- R5, R6
    select * into b from buildings where id = prop.building_id for update;
    attributed := round(prop.area_sqm * p_amount / g.target_thb, 2);
    select coalesce(sum(area_sqm_attributed),0) into foreign_area from cobuy_participants where group_id = p_group;
    if b.foreign_area_used_sqm + foreign_area + attributed > 0.49 * b.total_floor_area_sqm then raise exception 'FOREIGN_QUOTA'; end if;
    fet := true;
  end if;
  insert into cobuy_participants(group_id,user_id,lane,amount_thb,interest_rate_pct,area_sqm_attributed,fet_required)
  values (p_group, auth.uid(), p_lane, p_amount, case when p_lane='lender' then p_rate end, attributed, fet);
  insert into ledger_entries(user_id,entry_type,amount_thb,listing_id,group_id,details,request_id)
  values (auth.uid(),'commit_test_funds',p_amount,g.listing_id,p_group,
          format('Committed %s THB as %s (test money)', p_amount, p_lane), p_request);
  if v_committed + p_amount >= g.target_thb and n + 1 >= 2 then
    update cobuy_groups set status = 'funded' where id = p_group;
    -- co-owner shares and loans written to the ledger (simulated registration); see API.md cobuy flow
  end if;
  return jsonb_build_object('ok', true, 'funded', v_committed + p_amount >= g.target_thb);
end $$;
grant execute on function cobuy_commit to authenticated;
```

Map error codes to translated messages in the UI (`src/i18n/*` key `cobuy.errors.<CODE>`).

## 5. Seed (`supabase/seed.sql` + `scripts/seed-users.ts`)

- **Users (via the service role, password = `DEMO_PASSWORD`):**
  - malee@demo.u-estate.app (seller, Thai)
  - somchai@… (member, Thai)
  - ploy@… (member, Thai)
  - daniel@… (member, Australian)
  - aiko@… (member, Japanese)
  - narin@… (Thai, not a member)
  - layla@… (member, Emirati, locale `ar`)
  - reviewer@… (`is_reviewer`)
- **Buildings and listings:** port the 3 existing seed listings (`src/lib/seed.ts`). Add 8–10 Bangkok condos matching the Figma cards (names may be **fictional or generic**, e.g. "Sukhumvit 101 Residence (sample)"; don't imply real projects' endorsement). Include 1 deliberately underpriced listing that triggers the scam rule.
- **Offer round** on the condo, with 2 pre-made offers (from the current seed).
- **Price index:** the SAMPLE series until the BOT file is loaded (`is_sample = true`).
- **Valuation dataset:** generated by `scripts/make-demo-dataset.ts` → `data/valuation/demo_sales.csv` (synthetic, labelled), then `npm run eval:valuation` writes `model_cards`.
