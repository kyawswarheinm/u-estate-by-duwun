-- Functions and triggers. Business rules that move money-like state or ownership run HERE (authoritative),
-- mirrored in TypeScript (src/lib/rules.ts, src/lib/wallet.ts) for instant form feedback and unit tests.
-- Errors are raised as short CODES (e.g. 'MEMBERS_ONLY'); the app maps them to translated messages.

-- ============================================================ helpers
create or replace function public.is_end_user() returns boolean
language sql stable as $$
  -- true for requests made with a user's or the anon key (PostgREST roles); false for service_role / postgres
  select current_user in ('authenticated', 'anon')
$$;

create or replace function public.demo_mode() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select value = 'true'::jsonb from app_settings where key = 'demo_mode'), false)
$$;

create or replace function public.is_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_reviewer from profiles where id = auth.uid()), false)
$$;

create or replace function public.is_conversation_member(p_conversation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = p_conversation and user_id = auth.uid())
$$;

create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.push_notification(p_user uuid, p_kind text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, kind, title, body, link) values (p_user, p_kind, p_title, coalesce(p_body, ''), p_link)
$$;

-- ============================================================ sign-up → profile, settings, test money
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nat text := coalesce(nullif(meta ->> 'nationality', ''), 'Thai');
  v_grant numeric := coalesce((select (value ->> 'signup_grant_thb')::numeric from app_settings where key = 'wallet'), 5000000);
begin
  insert into profiles (id, display_name, nationality, is_thai, locale)
  values (
    new.id,
    left(coalesce(nullif(meta ->> 'name', ''), split_part(coalesce(new.email, 'member'), '@', 1)), 60),
    v_nat,
    v_nat = 'Thai',
    case when meta ->> 'locale' in ('en', 'th', 'ar', 'zh-Hant', 'es') then meta ->> 'locale' else 'en' end
  );
  insert into profile_settings (user_id) values (new.id);
  insert into wallet_transactions (user_id, kind, amount_thb, note) values (new.id, 'demo_grant', v_grant, 'Welcome test money (demo)');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ protected fields
create or replace function public.protect_profile_fields() returns trigger
language plpgsql as $$
begin
  new.is_thai := (new.nationality = 'Thai');
  if public.is_end_user() then
    if new.utopia_member is distinct from old.utopia_member
       or new.utopia_linked_at is distinct from old.utopia_linked_at
       or new.is_reviewer is distinct from old.is_reviewer
       or new.is_demo_persona is distinct from old.is_demo_persona
       or new.id is distinct from old.id then
      raise exception 'PROTECTED_FIELD';
    end if;
    if old.is_demo_persona and new.nationality is distinct from old.nationality then
      raise exception 'PERSONA_FIXED';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_fields();

create or replace function public.protect_listing_fields() returns trigger
language plpgsql as $$
begin
  if public.is_end_user() and (
       new.verification_status is distinct from old.verification_status
    or new.verification_reasons is distinct from old.verification_reasons
    or new.seller_id is distinct from old.seller_id
    or new.property_id is distinct from old.property_id
    or new.description_translations is distinct from old.description_translations
    or (new.status in ('under_offer', 'sold') and new.status is distinct from old.status)) then
    raise exception 'PROTECTED_FIELD';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger listings_protect before update on public.listings
  for each row execute function public.protect_listing_fields();

create or replace function public.protect_owner_column() returns trigger
language plpgsql as $$
begin
  if public.is_end_user() and new.owner_id is distinct from old.owner_id then
    raise exception 'PROTECTED_FIELD';
  end if;
  return new;
end $$;
create trigger properties_protect before update on public.properties for each row execute function public.protect_owner_column();
create trigger buildings_protect before update on public.buildings for each row execute function public.protect_owner_column();

create trigger profile_settings_touch before update on public.profile_settings for each row execute function public.set_updated_at();

-- Ledger and anchors are append-only for everyone, including the server.
create or replace function public.append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'APPEND_ONLY';
end $$;
create trigger ledger_append_only before update or delete on public.ledger_entries for each row execute function public.append_only();
create trigger anchors_append_only before update or delete on public.ledger_anchors for each row execute function public.append_only();

-- FairOffer weights cannot change after publication (R10).
create or replace function public.lock_offer_criteria() returns trigger
language plpgsql as $$
begin
  if new.criteria is distinct from old.criteria or new.rules_published_at is distinct from old.rules_published_at then
    raise exception 'CRITERIA_LOCKED';
  end if;
  return new;
end $$;
create trigger offer_rounds_lock before update on public.offer_rounds for each row execute function public.lock_offer_criteria();

-- ============================================================ listings
create or replace function public.listing_create(
  p_kind text, p_type text, p_title text, p_district text, p_province text, p_area_sqm numeric, p_price_thb numeric,
  p_build_year int default null, p_deed_type text default null, p_appraisal_thb numeric default null, p_cobuy boolean default false,
  p_building_name text default null, p_building_total_sqm numeric default null, p_building_foreign_sqm numeric default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_building uuid;
  v_property uuid;
  v_listing uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if p_kind = 'rent' and p_price_thb > 2000000 then raise exception 'RENT_TOO_HIGH'; end if;
  if p_type = 'condo' and coalesce(p_cobuy, false) and p_kind = 'sale' then
    if p_building_total_sqm is null then raise exception 'BUILDING_AREA_REQUIRED'; end if;
    insert into buildings (owner_id, name, district, province, total_floor_area_sqm, foreign_area_used_sqm)
    values (v_uid, coalesce(nullif(p_building_name, ''), left(p_title, 60) || ' (building)'), p_district, p_province,
            p_building_total_sqm, coalesce(p_building_foreign_sqm, 0))
    returning id into v_building;
  end if;
  insert into properties (owner_id, type, building_id, title, district, province, area_sqm, build_year, deed_type,
                          official_appraisal_thb, appraisal_source, appraisal_date, index_series)
  values (v_uid, p_type, v_building, p_title, p_district, p_province, p_area_sqm, p_build_year, p_deed_type,
          p_appraisal_thb, case when p_appraisal_thb is null then null else 'Entered by the seller (not yet checked)' end,
          to_char(now(), 'YYYY-MM'), case when p_type = 'condo' then 'condo_bkk' else 'house_bkk' end)
  returning id into v_property;
  insert into listings (property_id, seller_id, kind, asking_price_thb, cobuy_enabled)
  values (v_property, v_uid, p_kind, p_price_thb, coalesce(p_cobuy, false) and p_kind = 'sale')
  returning id into v_listing;
  return v_listing;
end $$;

-- ============================================================ FairOffer (R10)
create or replace function public.offer_open_round(p_listing uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_round uuid;
begin
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

-- Anyone can see HOW MANY sealed offers a round has, never the amounts.
create or replace function public.offer_count(p_round uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from offers where round_id = p_round
$$;

create or replace function public.offer_submit(
  p_round uuid, p_price_thb numeric, p_funding text, p_closing_days int, p_conditions text, p_request uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  r offer_rounds;
  v_seller uuid;
  v_offer uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select * into r from offer_rounds where id = p_round;
  if r.id is null or r.status <> 'open' then raise exception 'ROUND_CLOSED'; end if;
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
  return v_offer;
end $$;

create or replace function public.offer_close_round(p_round uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update offer_rounds r set status = 'closed'
  where r.id = p_round and r.status = 'open'
    and exists (select 1 from listings l where l.id = r.listing_id and l.seller_id = auth.uid());
  if not found then raise exception 'NOT_OWNER_OR_CLOSED'; end if;
end $$;

-- AI summary text is written per locale by the seller's session after the code ranking (D-32).
create or replace function public.offer_set_summary(p_round uuid, p_locale text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_locale not in ('en', 'th', 'ar', 'zh-Hant', 'es') or char_length(p_text) > 2000 then raise exception 'VALIDATION'; end if;
  update offer_rounds r set ai_summary = r.ai_summary || jsonb_build_object(p_locale, p_text)
  where r.id = p_round and r.status <> 'open'
    and exists (select 1 from listings l where l.id = r.listing_id and l.seller_id = auth.uid());
  if not found then raise exception 'NOT_OWNER_OR_OPEN'; end if;
end $$;

create or replace function public.offer_accept(p_offer uuid, p_request uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  o offers;
  r offer_rounds;
  l listings;
  b record;
begin
  select * into o from offers where id = p_offer;
  select * into r from offer_rounds where id = o.round_id;
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
end $$;

-- ============================================================ co-buy (R2–R7 + wallet, authoritative)
create or replace function public.cobuy_create_group(p_listing uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
  l listings;
begin
  if not coalesce((select utopia_member from profiles where id = v_uid), false) then raise exception 'MEMBERS_ONLY'; end if;
  select * into l from listings where id = p_listing;
  if l.id is null or not l.cobuy_enabled or l.status <> 'active' then raise exception 'NOT_ENABLED'; end if;
  select id into v_group from cobuy_groups where listing_id = p_listing and status <> 'cancelled';
  if v_group is null then
    insert into cobuy_groups (listing_id, target_thb, deadline, created_by)
    values (p_listing, l.asking_price_thb, now() + interval '14 days', v_uid)
    returning id into v_group;
  end if;
  return v_group;
end $$;

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
begin
  select * into g from cobuy_groups where id = p_group for update;                -- lock: no over-funding races
  if g.id is null or g.status <> 'forming' then raise exception 'GROUP_CLOSED'; end if;
  select * into prof from profiles where id = v_uid;
  if prof.id is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not prof.utopia_member then raise exception 'MEMBERS_ONLY'; end if;                                     -- R2
  if exists (select 1 from cobuy_participants where group_id = p_group and user_id = v_uid) then raise exception 'ALREADY_JOINED'; end if;
  select coalesce(sum(amount_thb), 0), count(*) into v_committed, n from cobuy_participants where group_id = p_group;
  if n >= 10 then raise exception 'GROUP_FULL'; end if;                                                      -- R3
  if p_amount is null or p_amount <= 0 or p_amount > g.target_thb - v_committed then raise exception 'AMOUNT_INVALID'; end if;
  select pr.* into prop from listings l join properties pr on pr.id = l.property_id where l.id = g.listing_id;
  select seller_id into v_seller from listings where id = g.listing_id;
  if v_seller = v_uid then raise exception 'OWN_LISTING'; end if;
  if p_lane not in ('co_owner', 'lender') then raise exception 'VALIDATION'; end if;
  if prop.type <> 'condo' and p_lane = 'co_owner' and not prof.is_thai then raise exception 'FOREIGN_LAND'; end if; -- R4
  if prop.type = 'condo' and p_lane = 'lender' then raise exception 'CONDO_NO_LENDER'; end if;
  if p_lane = 'lender' and (p_rate is null or p_rate <= 0 or p_rate > 15) then raise exception 'RATE_INVALID'; end if; -- R7
  if prop.type = 'condo' and not prof.is_thai then                                                         -- R5, R6
    select * into b from buildings where id = prop.building_id for update;
    if b.id is null then raise exception 'BUILDING_MISSING'; end if;
    v_attributed := round(prop.area_sqm * p_amount / g.target_thb, 2);
    select coalesce(sum(area_sqm_attributed), 0) into v_group_foreign from cobuy_participants where group_id = p_group;
    if b.foreign_area_used_sqm + v_group_foreign + v_attributed > 0.49 * b.total_floor_area_sqm then raise exception 'FOREIGN_QUOTA'; end if;
    v_fet := true;
  end if;
  -- Wallet (D-40): test money only
  select coalesce(sum(amount_thb), 0) into v_funded from wallet_transactions where user_id = v_uid;
  select coalesce(sum(cp.amount_thb), 0) into v_user_committed
    from cobuy_participants cp join cobuy_groups cg on cg.id = cp.group_id
    where cp.user_id = v_uid and cg.status <> 'cancelled';
  if p_amount > v_funded - v_user_committed then raise exception 'WALLET_BALANCE'; end if;
  select max_commit_thb into v_max from profile_settings where user_id = v_uid;
  if v_max is not null and p_amount > v_max then raise exception 'WALLET_LIMIT'; end if;

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
  return jsonb_build_object('ok', true, 'funded', v_now_funded, 'fet_required', v_fet);
end $$;

-- ============================================================ communication
create or replace function public.conversation_start(p_listing uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_seller uuid;
  v_conv uuid;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  select seller_id into v_seller from listings where id = p_listing;
  if v_seller is null then raise exception 'NOT_FOUND'; end if;
  if v_seller = v_uid then raise exception 'OWN_LISTING'; end if;
  select id into v_conv from conversations where listing_id = p_listing and created_by = v_uid;
  if v_conv is null then
    insert into conversations (listing_id, created_by) values (p_listing, v_uid) returning id into v_conv;
    insert into conversation_members (conversation_id, user_id) values (v_conv, v_uid), (v_conv, v_seller);
  end if;
  if coalesce(trim(p_body), '') <> '' then
    insert into messages (conversation_id, sender_id, body_original) values (v_conv, v_uid, p_body);
  end if;
  return v_conv;
end $$;

-- Every new message: bump the thread and notify the other members (they also get it live via Realtime).
create or replace function public.on_message_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  v_listing uuid;
  v_name text;
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id returning listing_id into v_listing;
  update conversation_members set last_read_at = new.created_at where conversation_id = new.conversation_id and user_id = new.sender_id;
  select display_name into v_name from profiles where id = new.sender_id;
  for m in select user_id from conversation_members where conversation_id = new.conversation_id and user_id <> new.sender_id loop
    perform push_notification(m.user_id, 'message', 'New message from ' || coalesce(v_name, 'a member'), left(new.body_original, 120), '/messages/' || new.conversation_id);
  end loop;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages for each row execute function public.on_message_created();

create or replace function public.conversation_mark_read(p_conversation uuid) returns void
language sql security definer set search_path = public as $$
  update conversation_members set last_read_at = now() where conversation_id = p_conversation and user_id = auth.uid()
$$;

create or replace function public.notifications_mark_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;

-- ============================================================ wallet (test money, D-40)
create or replace view public.wallet_balances with (security_invoker = true) as
select
  p.id as user_id,
  coalesce((select sum(w.amount_thb) from public.wallet_transactions w where w.user_id = p.id), 0) as funded_thb,
  coalesce((select sum(cp.amount_thb) from public.cobuy_participants cp join public.cobuy_groups g on g.id = cp.group_id
            where cp.user_id = p.id and g.status <> 'cancelled'), 0) as committed_thb,
  coalesce((select sum(w.amount_thb) from public.wallet_transactions w where w.user_id = p.id), 0)
    - coalesce((select sum(cp.amount_thb) from public.cobuy_participants cp join public.cobuy_groups g on g.id = cp.group_id
                where cp.user_id = p.id and g.status <> 'cancelled'), 0) as available_thb
from public.profiles p
where p.id = auth.uid();

create or replace function public.wallet_top_up() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  cfg jsonb := (select value from app_settings where key = 'wallet');
  v_total numeric;
begin
  if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  if not demo_mode() then raise exception 'DISABLED'; end if;
  select coalesce(sum(amount_thb), 0) into v_total from wallet_transactions where user_id = v_uid;
  if v_total + (cfg ->> 'top_up_thb')::numeric > (cfg ->> 'max_total_thb')::numeric then raise exception 'WALLET_CAP'; end if;
  insert into wallet_transactions (user_id, kind, amount_thb, note) values (v_uid, 'top_up', (cfg ->> 'top_up_thb')::numeric, 'Test money added (demo)');
end $$;

-- Demo only: in production U-topia confirms membership. Personas keep fixed memberships.
create or replace function public.demo_toggle_membership() returns boolean
language plpgsql security definer set search_path = public as $$
declare v_now boolean;
begin
  if not demo_mode() then raise exception 'DISABLED'; end if;
  update profiles set utopia_member = not utopia_member,
                      utopia_linked_at = case when utopia_member then null else now() end
  where id = auth.uid() and not is_demo_persona
  returning utopia_member into v_now;
  if v_now is null then raise exception 'NOT_ALLOWED'; end if;
  return v_now;
end $$;

-- ============================================================ execute permissions
-- New functions are executable by PUBLIC by default: lock everything, then open only the RPCs the app calls.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.offer_count(uuid) to anon, authenticated;
grant execute on function public.is_conversation_member(uuid), public.is_reviewer(), public.demo_mode(), public.is_end_user() to anon, authenticated;
grant execute on function
  public.listing_create(text, text, text, text, text, numeric, numeric, int, text, numeric, boolean, text, numeric, numeric),
  public.offer_open_round(uuid),
  public.offer_submit(uuid, numeric, text, int, text, uuid),
  public.offer_close_round(uuid),
  public.offer_set_summary(uuid, text, text),
  public.offer_accept(uuid, uuid),
  public.cobuy_create_group(uuid),
  public.cobuy_commit(uuid, text, numeric, numeric, uuid),
  public.conversation_start(uuid, text),
  public.conversation_mark_read(uuid),
  public.notifications_mark_read(uuid[]),
  public.wallet_top_up(),
  public.demo_toggle_membership()
to authenticated;
-- Trigger functions run as the table owner; they need no grants.
