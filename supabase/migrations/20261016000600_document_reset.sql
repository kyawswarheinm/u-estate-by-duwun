-- Atomic deed results and archive-preserving demo reset. Apply after 005.
begin;
alter table public.listings add column archived_at timestamptz;

create function public.save_document_check(p_owner uuid,p_listing uuid,p_path text,p_extraction jsonb,p_flags jsonb,p_outcome text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 perform 1 from listings where id=p_listing and seller_id=p_owner and archived_at is null for update;
 if not found then raise exception 'NOT_OWNER'; end if;
 if p_path not like p_owner::text || '/' || p_listing::text || '/%'
    or not exists(select 1 from storage.objects where bucket_id='deeds' and name=p_path) then
   raise exception 'DOCUMENT_MISSING';
 end if;
 if jsonb_typeof(p_flags) <> 'array' or p_outcome not in ('verified_sample','needs_review') then raise exception 'VALIDATION'; end if;
 insert into documents(owner_id,listing_id,storage_path,extraction,flags,outcome)
 values(p_owner,p_listing,p_path,p_extraction,p_flags,p_outcome) returning id into v_id;
 update listings set verification_status=p_outcome,
 verification_reasons=array(select f->>'message' from jsonb_array_elements(p_flags) f where f->>'severity'<>'info') where id=p_listing;
 insert into ledger_entries(user_id,listing_id,entry_type,details,is_simulated)
 values(p_owner,p_listing,'document_checked','AI deed check: ' || p_outcome || ' (sample; Land Office verification required)',true);
 return v_id;
end $$;
revoke all on function public.save_document_check(uuid,uuid,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_document_check(uuid,uuid,text,jsonb,jsonb,text) to service_role;

-- Reset only the three designated demo listings, never a signed-up person's listings.
-- Old listings/rounds/offers and every ledger/anchor stay queryable by ID for audit.
-- The public aliases now point at fresh copies. Cancel old groups to release test funds.
create function public.demo_reset(p_request uuid,p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare old listings; fresh uuid; r uuid; result jsonb; previous jsonb; count_reset int:=0;
begin
 if not demo_mode() or not is_reviewer() then raise exception 'NOT_ALLOWED'; end if;
 if p_dry_run then return jsonb_build_object('eligible',true,'scope','three seeded demo aliases; accounts and their listings preserved; ledger and anchors retained'); end if;
 previous:=begin_mutation(p_request,'demo_reset','{}'::jsonb);
 if previous is not null then return previous; end if;
 perform 1 from app_settings where key='demo_mode' for update;
 -- Serialize with commits before locking groups: same profile -> group ordering.
 perform id from profiles order by id for no key update;
 for old in select l.* from listings l join profiles p on p.id=l.seller_id
   where l.code in ('l-condo','l-house','l-condo2') and p.is_demo_persona and l.archived_at is null order by l.id for update of l loop
  update cobuy_groups set status='cancelled' where listing_id=old.id and status<>'cancelled';
  update offer_rounds set status='closed' where listing_id=old.id and status='open';
  update listings set code=null,archived_at=now() where id=old.id;
  insert into listings(code,property_id,seller_id,kind,asking_price_thb,cobuy_enabled,description_original,description_lang)
  values(old.code,old.property_id,old.seller_id,old.kind,
    case old.code when 'l-condo' then 4000000 when 'l-house' then 6000000 else 2900000 end,
    old.code<>'l-condo2',old.description_original,old.description_lang) returning id into fresh;
  if old.code='l-condo' then
   insert into offer_rounds(listing_id,criteria,closes_at)
   values(fresh,'[{"key":"price","label":"Offered price","weight":50},{"key":"funding","label":"Funding readiness","weight":25},{"key":"closing","label":"Faster closing","weight":15},{"key":"conditions","label":"Fewer conditions","weight":10}]',now()+interval '24 hours') returning id into r;
   insert into offers(round_id,buyer_id,price_thb,funding,closing_days,conditions)
   select r,id,3900000,'pre_approved',30,'Subject to inspection' from profiles where id='00000000-0000-4000-8000-000000000106' and is_demo_persona;
   insert into offers(round_id,buyer_id,price_thb,funding,closing_days,conditions)
   select r,id,4050000,'declared',60,'Subject to bank loan approval; subject to inspection' from profiles where id='00000000-0000-4000-8000-000000000103' and is_demo_persona;
  end if;
  count_reset:=count_reset+1;
 end loop;
 if count_reset<>3 then raise exception 'DEMO_SEED_MISSING'; end if;
 result:=jsonb_build_object('reset_listings',count_reset,'history_preserved',true);
 perform finish_mutation(p_request,result);
 return result;
end $$;
revoke all on function public.demo_reset(uuid,boolean) from public,anon;
grant execute on function public.demo_reset(uuid,boolean) to authenticated;

-- Concurrent thread starts from the same buyer must converge on one conversation.
create or replace function public.conversation_start(p_listing uuid,p_body text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_seller uuid; v_conv uuid;
begin
 if v_uid is null then raise exception 'NOT_SIGNED_IN'; end if;
 select seller_id into v_seller from listings where id=p_listing and archived_at is null;
 if v_seller is null then raise exception 'NOT_FOUND'; end if;
 if v_seller=v_uid then raise exception 'OWN_LISTING'; end if;
 perform 1 from profiles where id=v_uid for no key update;
 select id into v_conv from conversations where listing_id=p_listing and created_by=v_uid;
 if v_conv is null then
  insert into conversations(listing_id,created_by) values(p_listing,v_uid) returning id into v_conv;
  insert into conversation_members(conversation_id,user_id) values(v_conv,v_uid),(v_conv,v_seller);
 end if;
 if coalesce(trim(p_body),'')<>'' then
  insert into messages(conversation_id,sender_id,body_original) values(v_conv,v_uid,p_body);
 end if;
 return v_conv;
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
  if l.id is null or not l.cobuy_enabled or l.status <> 'active' or l.archived_at is not null then raise exception 'NOT_ENABLED'; end if;
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
  if not exists (select 1 from listings where id = p_listing and seller_id = auth.uid() and kind = 'sale' and archived_at is null) then
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
notify pgrst,'reload schema';
commit;
