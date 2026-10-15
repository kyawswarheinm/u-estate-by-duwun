-- Realtime: the browser subscribes to these tables with supabase.channel(...).on('postgres_changes', ...).
-- Realtime applies the same RLS policies, so a user only receives rows they are allowed to read.
alter publication supabase_realtime add table
  public.messages,             -- live chat
  public.conversations,        -- thread list ordering (last_message_at)
  public.notifications,        -- bell / toasts
  public.listings,             -- new listings and status changes appear live on Browse
  public.offer_rounds,         -- round opened / closed / decided
  public.cobuy_groups,         -- funded status
  public.cobuy_participants,   -- live funding progress bar
  public.ledger_entries,       -- live transparency ledger
  public.ledger_anchors;       -- new Avalanche fingerprint
-- offers are NOT published: sealed amounts must never stream to anyone but the buyer (use offer_count() for live counts).

-- Storage buckets. Path convention: <user id>/<listing id>/<file name>  (the first folder must be the uploader's id).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('deeds', 'deeds', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy "listing photos are public" on storage.objects for select
  using (bucket_id = 'listing-photos');
create policy "sellers upload photos to their own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sellers delete their own photos" on storage.objects for delete to authenticated
  using (bucket_id = 'listing-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "owners and reviewers read deeds" on storage.objects for select to authenticated
  using (bucket_id = 'deeds' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_reviewer()));
create policy "owners upload their own deeds" on storage.objects for insert to authenticated
  with check (bucket_id = 'deeds' and (storage.foldername(name))[1] = auth.uid()::text);
