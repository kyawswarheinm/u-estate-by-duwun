-- Person 1: serialize shared balances/quota, seal-round transitions and exact retries.
-- Apply AFTER 20261016000400. Existing migration files are unchanged.
begin;
create table public.mutation_receipts (
 request_id uuid primary key,
 user_id uuid not null references public.profiles(id),
 operation text not null,
 payload jsonb not null,
 result jsonb,
 created_at timestamptz not null default now()
);
alter table public.mutation_receipts enable row level security;
revoke all on public.mutation_receipts from public, anon, authenticated;
grant all on public.mutation_receipts to service_role;
-- Payloads can include sealed offers: never expose receipts or publish them to Realtime.
create function public.begin_mutation(p_request uuid, p_operation text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r mutation_receipts;
begin
 if auth.uid() is null then raise exception 'NOT_SIGNED_IN'; end if;
 if p_request is null then return null; end if;
 insert into mutation_receipts(request_id,user_id,operation,payload)
 values(p_request,auth.uid(),p_operation,p_payload) on conflict do nothing;
 select * into r from mutation_receipts where request_id=p_request for update;
 if r.user_id <> auth.uid() or r.operation <> p_operation or r.payload <> p_payload then
  raise exception 'REQUEST_MISMATCH';
 end if;
 return r.result;
end $$;
create function public.finish_mutation(p_request uuid,p_result jsonb)
returns void language sql security definer set search_path = public as $$
 update mutation_receipts set result=p_result where request_id=p_request and user_id=auth.uid()
$$;
revoke all on function public.begin_mutation(uuid,text,jsonb), public.finish_mutation(uuid,jsonb) from public, anon, authenticated;
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
    select coalesce(sum(cp.area_sqm_attributed), 0) into v_group_foreign
      from cobuy_participants cp join cobuy_groups cg on cg.id = cp.group_id
      join listings l on l.id = cg.listing_id join properties pr on pr.id = l.property_id
      where pr.building_id = b.id and cg.status <> 'cancelled';
    if b.foreign_area_used_sqm + v_group_foreign + v_attributed > 0.49 * b.total_floor_area_sqm then raise exception 'FOREIGN_QUOTA'; end if;
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
create or replace function public.offer_submit(
  p_round uuid, p_price_thb numeric, p_funding text, p_closing_days int, p_conditions text, p_request uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r offer_rounds;
  v_seller uuid;
  v_offer uuid;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  v_result := begin_mutation(p_request,'offer_submit',jsonb_build_array(p_round,p_price_thb,p_funding,p_closing_days,coalesce(p_conditions,'')));
  if v_result is not null then return (v_result->>'id')::uuid; end if;
  select * into r from offer_rounds where id = p_round for update;
  if r.id is null or r.status <> 'open' or r.closes_at <= now() then raise exception 'ROUND_CLOSED'; end if;
  select seller_id into v_seller from listings where id = r.listing_id;
  if v_seller = v_uid then raise exception 'OWN_LISTING'; end if;
  insert into offers (round_id, buyer_id, price_thb, funding, closing_days, conditions)
  values (p_round, v_uid, p_price_thb, p_funding, p_closing_days, coalesce(p_conditions, ''))
  on conflict (round_id, buyer_id) do update
    set price_thb = excluded.price_thb, funding = excluded.funding, closing_days = excluded.closing_days,
        conditions = excluded.conditions, submitted_at = now()
  returning id into v_offer;
  insert into ledger_entries (user_id, entry_type, listing_id, details, request_id)
  values (v_uid, 'offer_submitted', r.listing_id, 'Sealed offer submitted (amount hidden from other buyers until the round closes)', p_request);
  perform push_notification(v_seller, 'offer_received', 'New sealed offer', 'Amounts stay sealed until you close the round.', '/listing/' || r.listing_id || '/offers');
  perform finish_mutation(p_request,jsonb_build_object('id',v_offer));
  return v_offer;
end $$;
create or replace function public.offer_accept(p_offer uuid, p_request uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  o offers;
  r offer_rounds;
  l listings;
  b record;
  v_result jsonb;
begin
  v_result := begin_mutation(p_request,'offer_accept',jsonb_build_array(p_offer));
  if v_result is not null then return; end if;
  select * into o from offers where id = p_offer;
  select * into r from offer_rounds where id = o.round_id for update;
  select * into l from listings where id = r.listing_id;
  if l.id is null or l.seller_id is distinct from auth.uid() then raise exception 'NOT_OWNER'; end if;
  if r.status <> 'closed' then raise exception 'ROUND_NOT_CLOSED'; end if;
  update offers set status = case when id = o.id then 'accepted' else 'declined' end where round_id = r.id;
  update offer_rounds set status = 'decided', accepted_offer_id = o.id where id = r.id;
  update listings set status = 'under_offer' where id = l.id;   -- runs as definer: allowed past protect_listing_fields
  insert into ledger_entries (user_id, entry_type, amount_thb, listing_id, details, request_id)
  values (o.buyer_id, 'offer_accepted', o.price_thb, l.id,
          'Seller accepted an offer of ' || to_char(o.price_thb, 'FM999,999,999,999') || ' THB; other buyers notified with the published criteria', p_request);
  for b in select buyer_id, id from offers where round_id = r.id loop
    perform push_notification(b.buyer_id,
      case when b.id = o.id then 'offer_accepted' else 'offer_declined' end,
      case when b.id = o.id then 'Your offer was accepted' else 'Another offer was chosen' end,
      'Compared by the criteria the seller published before offers opened.',
      '/listing/' || l.id || '/offers');
  end loop;
  perform finish_mutation(p_request,'true'::jsonb);
end $$;
create or replace function public.cobuy_create_group(p_listing uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
  l listings;
begin
  if not coalesce((select utopia_member from profiles where id = v_uid), false) then raise exception 'MEMBERS_ONLY'; end if;
  select * into l from listings where id = p_listing for update;
  if l.id is null or not l.cobuy_enabled or l.status <> 'active' then raise exception 'NOT_ENABLED'; end if;
  select id into v_group from cobuy_groups where listing_id = p_listing and status <> 'cancelled';
  if v_group is null then
    insert into cobuy_groups (listing_id, target_thb, deadline, created_by)
    values (p_listing, l.asking_price_thb, now() + interval '14 days', v_uid)
    returning id into v_group;
  end if;
  return v_group;
end $$;
create or replace function public.offer_open_round(p_listing uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
  perform 1 from listings where id=p_listing for update;
  if not exists (select 1 from listings where id = p_listing and seller_id = auth.uid() and kind = 'sale') then
    raise exception 'NOT_OWNER';
  end if;
  select id into v_round from offer_rounds where listing_id = p_listing;
  if v_round is null then
    insert into offer_rounds (listing_id, criteria, closes_at)
    values (p_listing,
            '[{"key":"price","label":"Offered price","weight":50},{"key":"funding","label":"Funding readiness","weight":25},{"key":"closing","label":"Faster closing","weight":15},{"key":"conditions","label":"Fewer conditions","weight":10}]'::jsonb,
            now() + interval '72 hours')
    returning id into v_round;
  end if;
  return v_round;
end $$;
drop function public.wallet_top_up();
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
  select coalesce(sum(amount_thb), 0) into v_total from wallet_transactions where user_id = v_uid;
  if v_total + (cfg ->> 'top_up_thb')::numeric > (cfg ->> 'max_total_thb')::numeric then raise exception 'WALLET_CAP'; end if;
  insert into wallet_transactions (user_id, kind, amount_thb, note) values (v_uid, 'top_up', (cfg ->> 'top_up_thb')::numeric, 'Test money added (demo)');
  perform finish_mutation(p_request,'true'::jsonb);
end $$;

revoke update on public.profiles from authenticated;
grant update(display_name,nationality,locale) on public.profiles to authenticated;
revoke insert on public.listings from authenticated; -- creation must use listing_create
revoke insert on public.documents from authenticated; -- checks are server-authoritative
revoke update on public.listings from authenticated;
grant update(asking_price_thb,description_original,cobuy_enabled) on public.listings to authenticated;
revoke all on function public.wallet_top_up(uuid) from public,anon;
grant execute on function public.wallet_top_up(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
