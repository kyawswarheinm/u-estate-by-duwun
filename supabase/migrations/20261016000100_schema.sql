-- U-Estate database schema (Supabase Postgres). Explained in docs/DATABASE.md.
-- Order: 0100 schema → 0200 functions/triggers → 0300 row-level security → 0400 realtime + storage.
-- Verify locally without a Supabase project: npm run db:verify

-- ============================================================ settings
create table public.app_settings (
  key text primary key,
  value jsonb not null
);
insert into public.app_settings (key, value) values
  ('demo_mode', 'true'::jsonb),                 -- one-click personas, demo membership link, test-money top-ups
  ('wallet', '{"signup_grant_thb": 5000000, "top_up_thb": 1000000, "max_total_thb": 20000000}'::jsonb);

-- ============================================================ people
-- Accounts live in Supabase Auth (auth.users). A profile row is created by trigger on sign-up.
-- No email or password is stored here: emails stay in auth.users (never readable by other users).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  nationality text not null default 'Thai',
  is_thai boolean not null default true,                 -- derived from nationality by trigger
  utopia_member boolean not null default false,          -- protected: admin / demo function only
  utopia_linked_at timestamptz,
  is_reviewer boolean not null default false,            -- protected
  is_demo_persona boolean not null default false,        -- protected
  roles text[] not null default '{buyer,seller}',
  locale text not null default 'en' check (locale in ('en', 'th', 'ar', 'zh-Hant', 'es')),
  created_at timestamptz not null default now()
);

-- Private per-user settings (owner-only RLS).
create table public.profile_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  payout_method text not null default 'escrow_bank_transfer' check (payout_method in ('utopia_wallet', 'escrow_bank_transfer')),
  max_commit_thb numeric check (max_commit_thb is null or max_commit_thb between 10000 and 20000000),
  updated_at timestamptz not null default now()
);

-- ============================================================ property
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles (id) on delete set null default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  district text,
  province text default 'Bangkok',
  total_floor_area_sqm numeric not null check (total_floor_area_sqm > 0),
  foreign_area_used_sqm numeric not null default 0 check (foreign_area_used_sqm >= 0),
  build_year int,
  created_at timestamptz not null default now()
);

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  type text not null check (type in ('condo', 'house', 'land', 'townhouse', 'building')),
  building_id uuid references public.buildings (id) on delete set null,
  title text not null check (char_length(title) between 5 and 80),
  district text not null,
  province text not null,
  area_sqm numeric not null check (area_sqm > 0),
  bedrooms int,
  floor int,
  build_year int,
  lat double precision,
  lng double precision,
  nearest_rail text,
  rail_walk_min int,
  deed_type text,
  official_appraisal_thb numeric check (official_appraisal_thb is null or official_appraisal_thb > 0),
  appraisal_source text,
  appraisal_date text,                                   -- 'YYYY-MM'
  last_sale_price_thb numeric,
  last_sale_date text,                                   -- 'YYYY-MM'
  index_series text not null default 'condo_bkk' check (index_series in ('condo_bkk', 'house_bkk')),
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  code text unique check (code ~ '^[a-z0-9-]{3,40}$'),   -- optional demo-friendly id, e.g. 'l-condo' (URLs accept code or uuid)
  property_id uuid not null references public.properties (id) on delete cascade,
  seller_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('sale', 'rent')),
  asking_price_thb numeric not null check (asking_price_thb > 0),   -- monthly rent when kind = 'rent'
  description_original text check (description_original is null or char_length(description_original) <= 4000),
  description_lang text default 'en',
  description_translations jsonb not null default '{}',             -- {locale: text}, written by the server
  status text not null default 'active' check (status in ('draft', 'active', 'under_offer', 'sold', 'rented', 'withdrawn')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified_sample', 'needs_review')),
  verification_reasons text[] not null default '{}',
  cobuy_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listings_status_kind_idx on public.listings (status, kind);
create index listings_seller_idx on public.listings (seller_id);

-- Photos: files in Storage bucket 'listing-photos' at <seller uid>/<listing id>/<file>.
create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  storage_path text not null unique,
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),   -- duplicate-photo scam rule (R11)
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index listing_photos_sha_idx on public.listing_photos (sha256);

-- ============================================================ trust
-- Deed checks: files in the PRIVATE bucket 'deeds' at <owner uid>/<listing id>/<file>.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  storage_path text not null,
  extraction jsonb,
  flags jsonb not null default '[]',
  outcome text check (outcome in ('verified_sample', 'needs_review')),
  reviewed_by uuid references public.profiles (id),
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.listing_flags (                      -- scam / manipulation signals (R11)
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  code text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  evidence jsonb not null default '{}',                  -- never personal data
  status text not null default 'open' check (status in ('open', 'dismissed', 'confirmed')),
  created_at timestamptz not null default now()
);

-- ============================================================ valuation
create table public.price_index (
  series text not null,
  month date not null,
  value numeric not null,
  source text not null,
  is_sample boolean not null default true,
  primary key (series, month)
);

create table public.valuations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  model_version text not null,
  likely_thb numeric, low_thb numeric, high_thb numeric,
  forecast jsonb,
  factors jsonb,
  inputs jsonb,
  created_at timestamptz not null default now()
);

create table public.model_cards (
  model_version text primary key,
  metrics jsonb not null,
  dataset jsonb not null,
  created_at timestamptz not null default now()
);

-- ============================================================ FairOffer
create table public.offer_rounds (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings (id) on delete cascade,
  criteria jsonb not null,                               -- [{key,label,weight}], weights sum to 100, locked (trigger)
  rules_published_at timestamptz not null default now(),
  closes_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'closed', 'decided')),
  accepted_offer_id uuid,
  ai_summary jsonb not null default '{}'                 -- {locale: text}
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.offer_rounds (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  price_thb numeric not null check (price_thb > 0),
  funding text not null check (funding in ('pre_approved', 'proof_uploaded', 'declared', 'cash')),
  closing_days int not null check (closing_days between 7 and 180),
  conditions text not null default '' check (char_length(conditions) <= 500),
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'declined')),
  submitted_at timestamptz not null default now(),
  unique (round_id, buyer_id)
);

-- ============================================================ co-buy
create table public.cobuy_groups (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  target_thb numeric not null check (target_thb > 0),
  deadline timestamptz not null,
  status text not null default 'forming' check (status in ('forming', 'funded', 'cancelled')),
  created_by uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index cobuy_one_open_group_per_listing on public.cobuy_groups (listing_id) where status <> 'cancelled';

create table public.cobuy_participants (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.cobuy_groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  lane text not null check (lane in ('co_owner', 'lender')),
  amount_thb numeric not null check (amount_thb > 0),
  interest_rate_pct numeric check (interest_rate_pct is null or (interest_rate_pct > 0 and interest_rate_pct <= 15)),
  area_sqm_attributed numeric,
  fet_required boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (group_id, user_id),
  check ((lane = 'lender') = (interest_rate_pct is not null))
);

-- ============================================================ communication
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_by uuid not null references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  unique (listing_id, created_by)                        -- one thread per buyer per listing
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  body_original text not null check (char_length(body_original) between 1 and 2000),
  lang_original text,
  translations jsonb not null default '{}',              -- {locale: text}, written by the server after AI translation
  risk_flags text[] not null default '{}',               -- e.g. {'offplatform_payment'} (scam-phrase guard)
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);

-- In-app notifications (new offer, new message, group funded, offer accepted…). Delivered live via Realtime.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('message', 'offer_received', 'offer_accepted', 'offer_declined', 'cobuy_joined', 'cobuy_funded', 'viewing', 'document', 'system')),
  title text not null,
  body text not null default '',
  link text check (link is null or link like '/%'),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ============================================================ engagement
create table public.saved_listings (
  user_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.viewing_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  preferred_at timestamptz not null,
  status text not null default 'requested' check (status in ('requested', 'confirmed', 'declined')),
  created_at timestamptz not null default now()
);

create table public.rental_applications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  tenant_id uuid not null references public.profiles (id) on delete cascade default auth.uid(),
  move_in date,
  months int check (months between 1 and 36),
  note text check (note is null or char_length(note) <= 1000),
  status text not null default 'submitted' check (status in ('submitted', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);

-- ============================================================ wallet (test money only, D-40)
create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('demo_grant', 'top_up')),
  amount_thb numeric not null check (amount_thb > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index wallet_transactions_user_idx on public.wallet_transactions (user_id);

-- ============================================================ transparency ledger (R8, append-only)
create table public.ledger_entries (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles (id) on delete set null,
  entry_type text not null check (entry_type in ('document_checked', 'offer_submitted', 'offer_accepted', 'commit_test_funds', 'co_owner_share', 'loan', 'listing_flagged')),
  amount_thb numeric,                                    -- never set for offer_submitted (sealed bids)
  listing_id uuid references public.listings (id) on delete set null,
  group_id uuid references public.cobuy_groups (id) on delete set null,
  details text not null,
  is_simulated boolean not null default true,
  request_id uuid unique,                                -- idempotency
  check (entry_type <> 'offer_submitted' or amount_thb is null)
);

-- A1: fingerprints of the ledger published on Avalanche Fuji (D-33). Only hashes, never personal data.
create table public.ledger_anchors (
  id uuid primary key default gen_random_uuid(),
  up_to_entry_id bigint not null,
  entry_count int not null,
  head_hash text not null check (head_hash ~ '^[0-9a-f]{64}$'),
  message text not null,
  chain_id int not null default 43113 check (chain_id = 43113),   -- Fuji testnet only
  tx_hash text not null unique,
  explorer_url text not null,
  created_at timestamptz not null default now()
);

-- ============================================================ AI operations (server only)
create table public.ai_runs (
  id bigint generated always as identity primary key,
  feature text not null,
  model text,
  latency_ms int,
  ok boolean,
  error text,
  input_tokens int,
  output_tokens int,
  user_id uuid,
  created_at timestamptz not null default now()
);

create table public.ai_cache (
  key text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
