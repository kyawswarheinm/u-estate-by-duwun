-- Row-level security: ON for every table. The browser uses the anon/publishable key, so these policies ARE the security.
-- service_role (server-only key) bypasses RLS: use it only in server code for seeding, AI write-backs and the anchor job.

-- ============================================================ table privileges (RLS still decides which rows)
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.ai_runs, public.ai_cache from anon, authenticated;
revoke insert, update, delete on public.app_settings, public.ledger_entries, public.ledger_anchors, public.wallet_transactions,
  public.cobuy_groups, public.cobuy_participants, public.offer_rounds, public.notifications, public.price_index,
  public.valuations, public.model_cards, public.listing_flags from authenticated;
grant update (read_at) on public.notifications to authenticated;
grant update (status) on public.listing_flags to authenticated;          -- reviewers only (policy below)

-- Enable RLS everywhere (no policy = no access).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ============================================================ public read (transparency)
create policy app_settings_read on public.app_settings for select using (true);
create policy buildings_read on public.buildings for select using (true);
create policy properties_read on public.properties for select using (true);
create policy listings_read on public.listings for select using (status <> 'draft' or seller_id = auth.uid());
create policy listing_photos_read on public.listing_photos for select using (true);
create policy listing_flags_read on public.listing_flags for select using (true);
create policy price_index_read on public.price_index for select using (true);
create policy valuations_read on public.valuations for select using (true);
create policy model_cards_read on public.model_cards for select using (true);
create policy offer_rounds_read on public.offer_rounds for select using (true);
create policy cobuy_groups_read on public.cobuy_groups for select using (true);
create policy cobuy_participants_read on public.cobuy_participants for select using (true);
create policy ledger_read on public.ledger_entries for select using (true);
create policy anchors_read on public.ledger_anchors for select using (true);
-- Profiles hold no email or private settings, only what other parties need to see (name, nationality, membership).
create policy profiles_read on public.profiles for select using (true);

-- ============================================================ people
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());               -- protected columns blocked by trigger
create policy settings_self on public.profile_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================ property (owners)
create policy buildings_insert on public.buildings for insert to authenticated with check (owner_id = auth.uid());
create policy buildings_update on public.buildings for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy properties_insert on public.properties for insert to authenticated with check (owner_id = auth.uid());
create policy properties_update on public.properties for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy listings_insert on public.listings for insert to authenticated
  with check (seller_id = auth.uid() and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = auth.uid()));
create policy listings_update on public.listings for update to authenticated
  using (seller_id = auth.uid()) with check (seller_id = auth.uid());   -- verification/status fields blocked by trigger
create policy photos_insert on public.listing_photos for insert to authenticated
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
              and storage_path like auth.uid()::text || '/%');
create policy photos_delete on public.listing_photos for delete to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));

-- ============================================================ deeds (private)
create policy documents_read on public.documents for select to authenticated using (owner_id = auth.uid() or public.is_reviewer());
create policy documents_insert on public.documents for insert to authenticated
  with check (owner_id = auth.uid() and storage_path like auth.uid()::text || '/%'
              and (listing_id is null or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())));
create policy documents_review on public.documents for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());
create policy flags_review on public.listing_flags for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

-- ============================================================ FairOffer: sealed bids
-- A buyer sees only their own offer. The seller sees amounts only after closing the round. Writes go through RPCs.
create policy offers_read on public.offers for select using (
  buyer_id = auth.uid()
  or exists (select 1 from public.offer_rounds r join public.listings l on l.id = r.listing_id
             where r.id = offers.round_id and l.seller_id = auth.uid() and r.status <> 'open'));
revoke insert, update, delete on public.offers from authenticated;     -- use offer_submit()

-- ============================================================ communication (members only)
create policy conversations_read on public.conversations for select to authenticated using (public.is_conversation_member(id));
revoke insert, update, delete on public.conversations from authenticated;   -- use conversation_start()
create policy members_read on public.conversation_members for select to authenticated using (public.is_conversation_member(conversation_id));
revoke insert, update, delete on public.conversation_members from authenticated;   -- use conversation_start() / conversation_mark_read()
create policy messages_read on public.messages for select to authenticated using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id)
              and translations = '{}'::jsonb);                  -- translations are written by the server only
revoke update, delete on public.messages from authenticated;

create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================ engagement
create policy saved_self on public.saved_listings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy viewings_read on public.viewing_requests for select to authenticated
  using (requester_id = auth.uid() or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
create policy viewings_insert on public.viewing_requests for insert to authenticated
  with check (requester_id = auth.uid() and not exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
create policy viewings_update on public.viewing_requests for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));

create policy rentals_read on public.rental_applications for select to authenticated
  using (tenant_id = auth.uid() or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
create policy rentals_insert on public.rental_applications for insert to authenticated
  with check (tenant_id = auth.uid() and exists (select 1 from public.listings l where l.id = listing_id and l.kind = 'rent' and l.seller_id <> auth.uid()));
create policy rentals_update on public.rental_applications for update to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));

-- ============================================================ wallet (own rows only; writes via RPC / sign-up trigger)
create policy wallet_read on public.wallet_transactions for select to authenticated using (user_id = auth.uid());
grant select on public.wallet_balances to authenticated;

-- ai_runs, ai_cache: RLS on, no policies → server (service_role) only.
