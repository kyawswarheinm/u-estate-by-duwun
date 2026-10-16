-- Premium accounts and Co-Invest (D-44). Apply AFTER 20261016000600. Existing migration files are unchanged.
-- Three user types: guest (no session), standard (signed in), premium (profiles.premium, set only by
-- premium_upgrade or the service-role demo seed). Co-Invest splits a SAMPLE property into equal units of simulated
-- registered co-ownership; members buy units from the U-Estate pool and sell them back, with test money only.
-- Every money and ownership change runs in the functions below, inside one transaction, with row locks, request ids
-- for exact retries, the legal lanes (D-14, D-15) and the wallet balance check. The browser never supplies a price,
-- a balance or a share percentage.
begin;

-- ============================================================ premium entitlement
alter table public.profiles add column premium boolean not null default false;   -- protected
alter table public.profiles add column premium_since timestamptz;
insert into public.app_settings (key, value) values ('premium', '{"fee_thb": 9900}'::jsonb) on conflict (key) do nothing;

create or replace function public.protect_profile_fields() returns trigger
language plpgsql as $$
begin
  new.is_thai := (new.nationality = 'Thai');
  if public.is_end_user() then
    if new.utopia_member is distinct from old.utopia_member
       or new.utopia_linked_at is distinct from old.utopia_linked_at
       or new.is_reviewer is distinct from old.is_reviewer
       or new.is_demo_persona is distinct from old.is_demo_persona
       or new.premium is distinct from old.premium
       or new.premium_since is distinct from old.premium_since
       or new.id is distinct from old.id then
      raise exception 'PROTECTED_FIELD';
    end if;
    if old.is_demo_persona and new.nationality is distinct from old.nationality then
      raise exception 'PERSONA_FIXED';
    end if;
    -- A foreign nationality cannot be chosen while holding units the legal lanes would not allow.
    if new.nationality is distinct from old.nationality and exists (select 1 from coinvest_holdings where user_id = new.id and units > 0) then
      raise exception 'HOLDINGS_LOCK_NATIONALITY';
    end if;
  end if;
  return new;
end $$;

create or replace function public.is_premium() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select premium from profiles where id = auth.uid()), false)
$$;

-- ============================================================ signed wallet movements
-- Credits are positive (grants, top-ups, unit sales, refunds), debits negative (premium fee, unit purchases).
alter table public.wallet_transactions drop constraint if exists wallet_transactions_kind_check;
alter table public.wallet_transactions drop constraint if exists wallet_transactions_amount_thb_check;
alter table public.wallet_transactions add constraint wallet_transactions_kind_check
  check (kind in ('demo_grant', 'top_up', 'premium_fee', 'share_purchase', 'share_sale', 'refund'));
alter table public.wallet_transactions add constraint wallet_transactions_sign_check
  check ((kind in ('demo_grant', 'top_up', 'share_sale', 'refund') and amount_thb > 0)
      or (kind in ('premium_fee', 'share_purchase') and amount_thb < 0));
alter table public.wallet_transactions add column request_id uuid unique;

-- What a member can spend: every movement minus co-buy money held for groups that are not cancelled.
create or replace function public.wallet_available(p_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount_thb) from wallet_transactions where user_id = p_user), 0)
       - coalesce((select sum(cp.amount_thb) from cobuy_participants cp join cobuy_groups g on g.id = cp.group_id
                    where cp.user_id = p_user and g.status <> 'cancelled'), 0)
$$;

-- The top-up cap counts grants and top-ups only (spending must not make room for more test money).
create or replace function public.wallet_top_up(p_request uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  cfg jsonb := (select value from app_settings where key = 'wallet');
  v_total numeric;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not demo_mode() then raise exception 'DISABLED'; end if;
  v_result := begin_mutation(p_request,'wallet_top_up','{}'::jsonb);
  if v_result is not null then return; end if;
  perform 1 from profiles where id=v_uid for no key update;
  select coalesce(sum(amount_thb), 0) into v_total from wallet_transactions where user_id = v_uid and kind in ('demo_grant', 'top_up');
  if v_total + (cfg ->> 'top_up_thb')::numeric > (cfg ->> 'max_total_thb')::numeric then raise exception 'WALLET_CAP'; end if;
  insert into wallet_transactions (user_id, kind, amount_thb, note) values (v_uid, 'top_up', (cfg ->> 'top_up_thb')::numeric, 'Test money added (demo)');
  perform finish_mutation(p_request,'true'::jsonb);
end $$;

-- ============================================================ ledger: unit transfers
alter table public.ledger_entries drop constraint if exists ledger_entries_entry_type_check;
alter table public.ledger_entries add constraint ledger_entries_entry_type_check
  check (entry_type in ('document_checked', 'offer_submitted', 'offer_accepted', 'commit_test_funds', 'co_owner_share', 'loan', 'listing_flagged', 'share_transfer'));

-- ============================================================ Co-Invest
create table public.coinvest_offerings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]{3,40}$'),
  property_id uuid not null unique references public.properties (id),
  total_units int not null check (total_units between 10 and 100000),
  unit_par_thb numeric not null check (unit_par_thb > 0),
  target_thb numeric not null check (target_thb > 0),
  units_outstanding int not null default 0,
  status text not null default 'funding' check (status in ('funding', 'active', 'closed')),
  base_value_thb numeric not null check (base_value_thb > 0),
  base_month text not null check (base_month ~ '^[0-9]{4}-[0-9]{2}$'),
  current_value_thb numeric not null check (current_value_thb > 0),   -- index-tracked estimate, set by code (D-32)
  valued_month text not null check (valued_month ~ '^[0-9]{4}-[0-9]{2}$'),
  gross_yield_pct numeric not null default 4 check (gross_yield_pct between 0 and 15),  -- assumption for simulated income
  max_holders int not null default 20 check (max_holders between 2 and 50),
  opens_at timestamptz not null default now(),
  funded_at timestamptz,
  created_at timestamptz not null default now(),
  check (units_outstanding between 0 and total_units),
  check (target_thb = total_units * unit_par_thb)
);
create table public.coinvest_holdings (
  offering_id uuid not null references public.coinvest_offerings (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  units int not null check (units >= 0),
  cost_thb numeric not null default 0 check (cost_thb >= 0),
  area_sqm_attributed numeric not null default 0 check (area_sqm_attributed >= 0),
  fet_required boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (offering_id, user_id)
);
create index coinvest_holdings_user_idx on public.coinvest_holdings (user_id);
create table public.coinvest_trades (
  id uuid primary key default gen_random_uuid(),
  offering_id uuid not null references public.coinvest_offerings (id),
  user_id uuid not null references public.profiles (id) on delete cascade,
  side text not null check (side in ('buy', 'sell')),
  phase text not null check (phase in ('funding', 'active')),
  units int not null check (units > 0),
  unit_price_thb numeric not null check (unit_price_thb > 0),
  amount_thb numeric not null check (amount_thb > 0),
  request_id uuid unique,
  created_at timestamptz not null default now()
);
create index coinvest_trades_offering_idx on public.coinvest_trades (offering_id, created_at);
create index coinvest_trades_user_idx on public.coinvest_trades (user_id, created_at);
create trigger coinvest_trades_append_only before update or delete on public.coinvest_trades for each row execute function public.append_only();
alter table public.wallet_transactions add column offering_id uuid references public.coinvest_offerings (id);
alter table public.wallet_transactions add column trade_id uuid references public.coinvest_trades (id);

alter table public.coinvest_offerings enable row level security;
alter table public.coinvest_holdings enable row level security;
alter table public.coinvest_trades enable row level security;
grant select on public.coinvest_offerings to anon, authenticated;
grant select on public.coinvest_holdings, public.coinvest_trades to authenticated;
revoke insert, update, delete on public.coinvest_offerings, public.coinvest_holdings, public.coinvest_trades from anon, authenticated;
-- Offerings and funding progress are public (the preview). Who holds what is visible to the member and to premium members.
create policy coinvest_offerings_read on public.coinvest_offerings for select using (true);
create policy coinvest_holdings_read on public.coinvest_holdings for select to authenticated using (user_id = auth.uid() or public.is_premium());
create policy coinvest_trades_read on public.coinvest_trades for select to authenticated using (user_id = auth.uid() or public.is_premium());
alter publication supabase_realtime add table public.coinvest_offerings;   -- live funding progress

-- Floor area counted against a building's 49% foreign quota: recorded use, co-buy groups that are not cancelled and
-- Co-Invest units of foreign members (optionally leaving out one holding that is being recalculated).
create or replace function public.foreign_area_committed(p_building uuid, p_except_offering uuid, p_except_user uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select foreign_area_used_sqm from buildings where id = p_building), 0)
    + coalesce((select sum(cp.area_sqm_attributed) from cobuy_participants cp join cobuy_groups cg on cg.id = cp.group_id
                join listings l on l.id = cg.listing_id join properties pr on pr.id = l.property_id
                where pr.building_id = p_building and cg.status <> 'cancelled'), 0)
    + coalesce((select sum(h.area_sqm_attributed) from coinvest_holdings h join coinvest_offerings o on o.id = h.offering_id
                join properties pr on pr.id = o.property_id
                where pr.building_id = p_building
                  and not (h.offering_id is not distinct from p_except_offering and h.user_id is not distinct from p_except_user)), 0)
$$;

-- Internal: one unit trade against the U-Estate pool. Callers check who may trade; this checks everything else.
create or replace function public.coinvest_apply_trade(p_user uuid, p_offering uuid, p_side text, p_units int, p_request uuid, p_at timestamptz)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  prof profiles;
  o coinvest_offerings;
  prop properties;
  b buildings;
  h coinvest_holdings;
  v_prior coinvest_trades;
  v_held int;
  v_new int;
  v_price numeric;
  v_amount numeric;
  v_phase text;
  v_area numeric := 0;
  v_fet boolean := false;
  v_holders int;
  v_trade uuid;
  v_kind text;
  v_pct numeric;
  v_funded boolean := false;
begin
  if p_request is not null then
    select * into v_prior from coinvest_trades where request_id = p_request;
    if v_prior.id is not null then
      if v_prior.user_id <> p_user or v_prior.offering_id <> p_offering or v_prior.side <> p_side or v_prior.units <> p_units then raise exception 'REQUEST_MISMATCH'; end if;
      return jsonb_build_object('ok', true, 'replayed', true, 'trade_id', v_prior.id);
    end if;
  end if;
  -- Lock order everywhere: profile (wallet) → offering → building.
  select * into prof from profiles where id = p_user for no key update;
  if prof.id is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into o from coinvest_offerings where id = p_offering for update;
  if o.id is null or o.status = 'closed' then raise exception 'OFFERING_CLOSED'; end if;
  if p_side is null or p_side not in ('buy', 'sell') then raise exception 'VALIDATION'; end if;
  if p_units is null or p_units <= 0 or p_units > 1000 then raise exception 'UNITS_INVALID'; end if;
  select * into prop from properties where id = o.property_id;
  select * into h from coinvest_holdings where offering_id = p_offering and user_id = p_user for update;
  v_held := coalesce(h.units, 0);
  v_phase := case when o.status = 'funding' then 'funding' else 'active' end;
  v_price := case when o.status = 'funding' then o.unit_par_thb else round(o.current_value_thb / o.total_units, 2) end;
  v_amount := round(v_price * p_units, 2);
  if p_side = 'buy' then
    if p_units > o.total_units - o.units_outstanding then
      if o.total_units = o.units_outstanding then raise exception 'POOL_EMPTY'; end if;
      raise exception 'NOT_ENOUGH_UNITS';
    end if;
    if v_held = 0 then
      select count(*) into v_holders from coinvest_holdings where offering_id = p_offering and units > 0;
      if v_holders >= o.max_holders then raise exception 'HOLDERS_FULL'; end if;
    end if;
    v_new := v_held + p_units;
  else
    if p_units > v_held then raise exception 'NOT_ENOUGH_UNITS'; end if;
    v_new := v_held - p_units;
  end if;
  -- Legal lanes (D-14, D-15): foreign members hold units only in condos, within the building's 49% floor-area quota.
  if not prof.is_thai then
    if prop.type <> 'condo' then raise exception 'FOREIGN_LAND'; end if;
    if prop.building_id is null then raise exception 'BUILDING_MISSING'; end if;
    select * into b from buildings where id = prop.building_id for update;
    v_area := ceil(prop.area_sqm * v_new / o.total_units * 100) / 100;
    v_fet := v_new > 0;
    if p_side = 'buy' and foreign_area_committed(b.id, p_offering, p_user) + v_area > 0.49 * b.total_floor_area_sqm then raise exception 'FOREIGN_QUOTA'; end if;
  end if;
  if p_side = 'buy' and v_amount > wallet_available(p_user) then raise exception 'WALLET_BALANCE'; end if;

  insert into coinvest_trades (offering_id, user_id, side, phase, units, unit_price_thb, amount_thb, request_id, created_at)
  values (p_offering, p_user, p_side, v_phase, p_units, v_price, v_amount, p_request, p_at)
  returning id into v_trade;
  insert into coinvest_holdings as ch (offering_id, user_id, units, cost_thb, area_sqm_attributed, fet_required, updated_at)
  values (p_offering, p_user, v_new, case when p_side = 'buy' then v_amount else 0 end, v_area, v_fet, p_at)
  on conflict (offering_id, user_id) do update set
    units = excluded.units,
    cost_thb = case when p_side = 'buy' then ch.cost_thb + v_amount
                    when v_new = 0 then 0
                    else round(ch.cost_thb - ch.cost_thb * p_units / v_held, 2) end,
    area_sqm_attributed = excluded.area_sqm_attributed,
    fet_required = excluded.fet_required,
    updated_at = excluded.updated_at;
  update coinvest_offerings set units_outstanding = units_outstanding + case when p_side = 'buy' then p_units else -p_units end where id = p_offering;
  v_kind := case when p_side = 'buy' then 'share_purchase' when v_phase = 'funding' then 'refund' else 'share_sale' end;
  insert into wallet_transactions (user_id, kind, amount_thb, note, offering_id, trade_id, created_at)
  values (p_user, v_kind, case when p_side = 'buy' then -v_amount else v_amount end,
          case when p_side = 'buy' then 'Bought ' || p_units || ' Co-Invest units: ' || prop.title || ' (test money)'
               when v_kind = 'refund' then 'Withdrew ' || p_units || ' units during funding, refunded: ' || prop.title || ' (test money)'
               else 'Sold ' || p_units || ' Co-Invest units to the U-Estate pool: ' || prop.title || ' (test money)' end,
          p_offering, v_trade, p_at);
  v_pct := round(v_new::numeric / o.total_units * 100, 2);
  insert into ledger_entries (created_at, user_id, entry_type, amount_thb, details, request_id)
  values (p_at, p_user, 'share_transfer', v_amount,
          case when p_side = 'buy' then prof.display_name || ' bought ' || p_units || ' of ' || o.total_units || ' units of ' || prop.title || '; now holds ' || v_pct || '% (simulated co-ownership, test money)'
               else prof.display_name || case when v_phase = 'funding' then ' withdrew ' else ' sold ' end || p_units || ' of ' || o.total_units || ' units of ' || prop.title || ' to the U-Estate pool; now holds ' || v_pct || '% (simulated, test money)' end,
          p_request);
  if p_side = 'buy' and o.status = 'funding' and o.units_outstanding + p_units = o.total_units then
    update coinvest_offerings set status = 'active', funded_at = p_at where id = p_offering;
    v_funded := true;
  end if;
  return jsonb_build_object('ok', true, 'replayed', false, 'trade_id', v_trade, 'funded', v_funded, 'units', v_new, 'amount_thb', v_amount);
end $$;

-- Internal: Standard → Premium, paying the one-time demo fee from the test-money wallet.
create or replace function public.premium_apply(p_user uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  prof profiles;
  v_fee numeric := coalesce((select (value ->> 'fee_thb')::numeric from app_settings where key = 'premium'), 9900);
begin
  select * into prof from profiles where id = p_user for no key update;
  if prof.id is null then raise exception 'NOT_SIGNED_IN'; end if;
  if prof.premium then raise exception 'ALREADY_PREMIUM'; end if;
  if v_fee > wallet_available(p_user) then raise exception 'WALLET_BALANCE'; end if;
  insert into wallet_transactions (user_id, kind, amount_thb, note, created_at) values (p_user, 'premium_fee', -v_fee, 'Premium upgrade, one-time demo fee (test money)', p_at);
  update profiles set premium = true, premium_since = p_at where id = p_user;
end $$;

-- ---- RPCs the app calls (authenticated)
create or replace function public.premium_upgrade(p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not demo_mode() then raise exception 'DISABLED'; end if;
  v_result := begin_mutation(p_request, 'premium_upgrade', '{}'::jsonb);
  if v_result is not null then return v_result; end if;
  perform premium_apply(v_uid, now());
  v_result := jsonb_build_object('ok', true);
  perform finish_mutation(p_request, v_result);
  return v_result;
end $$;

create or replace function public.coinvest_buy(p_offering uuid, p_units int, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from profiles where id = v_uid and premium) then raise exception 'PREMIUM_ONLY'; end if;
  v_result := begin_mutation(p_request, 'coinvest_buy', jsonb_build_array(p_offering, p_units));
  if v_result is not null then return v_result; end if;
  v_result := coinvest_apply_trade(v_uid, p_offering, 'buy', p_units, p_request, now());
  perform finish_mutation(p_request, v_result);
  return v_result;
end $$;

create or replace function public.coinvest_sell(p_offering uuid, p_units int, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not exists (select 1 from profiles where id = v_uid and premium) then raise exception 'PREMIUM_ONLY'; end if;
  v_result := begin_mutation(p_request, 'coinvest_sell', jsonb_build_array(p_offering, p_units));
  if v_result is not null then return v_result; end if;
  v_result := coinvest_apply_trade(v_uid, p_offering, 'sell', p_units, p_request, now());
  perform finish_mutation(p_request, v_result);
  return v_result;
end $$;

-- ---- Demo seed (service role only): replays scripts/db/seed-population.ts through the same rules.
create or replace function public.demo_seed_premium(p_user uuid, p_at timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id = p_user and premium) then return; end if;
  perform premium_apply(p_user, p_at);
end $$;

create or replace function public.demo_seed_trade(p_user uuid, p_offering uuid, p_side text, p_units int, p_request uuid, p_at timestamptz, p_value numeric)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_request is null then raise exception 'VALIDATION'; end if;
  if exists (select 1 from coinvest_trades where request_id = p_request) then
    return coinvest_apply_trade(p_user, p_offering, p_side, p_units, p_request, p_at);   -- replay check only
  end if;
  -- Value the offering at the trade's month first (the index-tracked estimate computed by the seed script).
  if p_value is not null then
    update coinvest_offerings set current_value_thb = p_value, valued_month = to_char(p_at at time zone 'UTC', 'YYYY-MM')
    where id = p_offering and status = 'active';
  end if;
  return coinvest_apply_trade(p_user, p_offering, p_side, p_units, p_request, p_at);
end $$;

create or replace function public.coinvest_revalue(p_offering uuid, p_value numeric, p_month text) returns void
language sql security definer set search_path = public as $$
  update coinvest_offerings set current_value_thb = p_value, valued_month = p_month where id = p_offering and status = 'active'
$$;

-- ============================================================ co-buy: the foreign quota also counts Co-Invest units
create or replace function public.cobuy_commit(p_group uuid, p_lane text, p_amount numeric, p_rate numeric default null, p_request uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  g cobuy_groups;
  prof profiles;
  prop properties;
  b buildings;
  v_seller uuid;
  v_committed numeric;
  n int;
  v_group_foreign numeric := 0;
  v_attributed numeric;
  v_fet boolean := false;
  v_funded numeric;
  v_user_committed numeric;
  v_max numeric;
  v_owner_equity numeric;
  p record;
  v_now_funded boolean;
  v_result jsonb;
begin
  v_result := begin_mutation(p_request, 'cobuy_commit', jsonb_build_array(p_group,p_lane,p_amount,p_rate));
  if v_result is not null then return v_result; end if;
  -- All wallet mutations lock the same profile BEFORE a group or building.
  select * into prof from profiles where id = v_uid for no key update;
  select * into g from cobuy_groups where id = p_group for update;                -- lock: no over-funding races
  if g.id is null or g.status <> 'forming' or g.deadline <= now() then raise exception 'GROUP_CLOSED'; end if;
  if prof.id is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not prof.utopia_member then raise exception 'MEMBERS_ONLY'; end if;                                     -- R2
  if exists (select 1 from cobuy_participants where group_id = p_group and user_id = v_uid) then raise exception 'ALREADY_JOINED'; end if;
  select coalesce(sum(amount_thb), 0), count(*) into v_committed, n from cobuy_participants where group_id = p_group;
  if n >= 10 then raise exception 'GROUP_FULL'; end if;                                                      -- R3
  if p_amount is null or p_amount <= 0 or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount > g.target_thb - v_committed then raise exception 'AMOUNT_INVALID'; end if;
  if n = 0 and p_amount = g.target_thb then raise exception 'MIN_PARTICIPANTS'; end if;
  if n = 9 and v_committed + p_amount < g.target_thb then raise exception 'LAST_SLOT'; end if;
  select pr.* into prop from listings l join properties pr on pr.id = l.property_id where l.id = g.listing_id;
  select seller_id into v_seller from listings where id = g.listing_id;
  if v_seller = v_uid then raise exception 'OWN_LISTING'; end if;
  if p_lane is null or p_lane not in ('co_owner', 'lender') then raise exception 'VALIDATION'; end if;
  if prop.type <> 'condo' and p_lane = 'co_owner' and not prof.is_thai then raise exception 'FOREIGN_LAND'; end if; -- R4
  if prop.type = 'condo' and p_lane = 'lender' then raise exception 'CONDO_NO_LENDER'; end if;
  if p_lane = 'lender' and (p_rate is null or p_rate <= 0 or p_rate > 15) then raise exception 'RATE_INVALID'; end if; -- R7
  if prop.type = 'condo' and not prof.is_thai then                                                         -- R5, R6
    select * into b from buildings where id = prop.building_id for update;
    if b.id is null then raise exception 'BUILDING_MISSING'; end if;
    v_attributed := ceil(prop.area_sqm * p_amount / g.target_thb * 100) / 100;
    -- 0700: the quota now also counts Co-Invest units held by foreign members in the same building.
    v_group_foreign := foreign_area_committed(b.id, null, null);
    if v_group_foreign + v_attributed > 0.49 * b.total_floor_area_sqm then raise exception 'FOREIGN_QUOTA'; end if;
    v_fet := true;
  end if;
  -- Wallet (D-40): test money only
  select coalesce(sum(amount_thb), 0) into v_funded from wallet_transactions where user_id = v_uid;
  select coalesce(sum(cp.amount_thb), 0) into v_user_committed
    from cobuy_participants cp join cobuy_groups cg on cg.id = cp.group_id
    where cp.user_id = v_uid and cg.status <> 'cancelled';
  if p_amount > v_funded - v_user_committed then raise exception 'WALLET_BALANCE'; end if;
  select max_commit_thb into v_max from profile_settings where user_id = v_uid for update;
  if v_max is not null and p_amount > v_max then raise exception 'WALLET_LIMIT'; end if;

  if v_committed + p_amount = g.target_thb and p_lane = 'lender'
     and not exists (select 1 from cobuy_participants where group_id=p_group and lane='co_owner') then
    raise exception 'OWNER_REQUIRED';
  end if;
  insert into cobuy_participants (group_id, user_id, lane, amount_thb, interest_rate_pct, area_sqm_attributed, fet_required)
  values (p_group, v_uid, p_lane, p_amount, case when p_lane = 'lender' then p_rate end, v_attributed, v_fet);
  insert into ledger_entries (user_id, entry_type, amount_thb, listing_id, group_id, details, request_id)
  values (v_uid, 'commit_test_funds', p_amount, g.listing_id, p_group,
          prof.display_name || ' committed ' || to_char(p_amount, 'FM999,999,999,999') || ' THB as '
            || case when p_lane = 'lender' then 'lender at ' || p_rate || '% fixed' else 'co-owner' end || ' (test money)',
          p_request);
  perform push_notification(v_seller, 'cobuy_joined', 'A member joined the co-buy group', prof.display_name || ' committed test money.', '/cobuy/' || p_group);

  v_now_funded := v_committed + p_amount >= g.target_thb and n + 1 >= 2;
  if v_now_funded then
    update cobuy_groups set status = 'funded' where id = p_group;
    select coalesce(sum(amount_thb), 0) into v_owner_equity from cobuy_participants where group_id = p_group and lane = 'co_owner';
    for p in select * from cobuy_participants where group_id = p_group loop
      if p.lane = 'co_owner' then
        insert into ledger_entries (user_id, entry_type, listing_id, group_id, details)
        values (p.user_id, 'co_owner_share', g.listing_id, p_group,
                'Registered co-owner share ' || round(p.amount_thb / nullif(v_owner_equity, 0) * 100, 2) || '% (pending Land Office registration, simulated)');
      else
        insert into ledger_entries (user_id, entry_type, amount_thb, listing_id, group_id, details)
        values (p.user_id, 'loan', p.amount_thb, g.listing_id, p_group,
                'Registered mortgage loan at ' || p.interest_rate_pct || '% fixed, 5 years (simulated)');
      end if;
      perform push_notification(p.user_id, 'cobuy_funded', 'Co-buy group fully funded', 'Next (simulated): sign the co-owner agreement and register at the Land Office.', '/cobuy/' || p_group);
    end loop;
    perform push_notification(v_seller, 'cobuy_funded', 'A co-buy group fully funded your listing', '', '/cobuy/' || p_group);
  end if;
  v_result := jsonb_build_object('ok', true, 'funded', v_now_funded, 'fet_required', v_fet);
  perform finish_mutation(p_request,v_result);
  return v_result;
end $$;

-- ============================================================ execute permissions
revoke execute on function
  public.is_premium(), public.wallet_available(uuid), public.foreign_area_committed(uuid, uuid, uuid),
  public.coinvest_apply_trade(uuid, uuid, text, int, uuid, timestamptz), public.premium_apply(uuid, timestamptz),
  public.premium_upgrade(uuid), public.coinvest_buy(uuid, int, uuid), public.coinvest_sell(uuid, int, uuid),
  public.demo_seed_premium(uuid, timestamptz), public.demo_seed_trade(uuid, uuid, text, int, uuid, timestamptz, numeric),
  public.coinvest_revalue(uuid, numeric, text), public.wallet_top_up(uuid), public.cobuy_commit(uuid, text, numeric, numeric, uuid)
from public, anon, authenticated;
grant execute on function public.is_premium() to anon, authenticated;   -- used by the read policies
grant execute on function public.premium_upgrade(uuid), public.coinvest_buy(uuid, int, uuid), public.coinvest_sell(uuid, int, uuid),
  public.wallet_top_up(uuid), public.cobuy_commit(uuid, text, numeric, numeric, uuid) to authenticated;
grant execute on function public.demo_seed_premium(uuid, timestamptz), public.demo_seed_trade(uuid, uuid, text, int, uuid, timestamptz, numeric),
  public.coinvest_revalue(uuid, numeric, text) to service_role;
notify pgrst, 'reload schema';
commit;
