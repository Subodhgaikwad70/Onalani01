-- Public image buckets for property and listing photos.
-- Apply via Supabase SQL Editor or `supabase db push`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'property-photos',
    'property-photos',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
  ),
  (
    'listing-photos',
    'listing-photos',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can view public bucket objects.
create policy "Public read property photos"
on storage.objects for select
to public
using (bucket_id = 'property-photos');

create policy "Public read listing photos"
on storage.objects for select
to public
using (bucket_id = 'listing-photos');

-- Staff uploads go under {user_id}/… via signed URLs or authenticated clients.
create policy "Authenticated upload property photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Authenticated upload listing photos"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Authenticated update own property photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Authenticated update own listing photos"
on storage.objects for update
to authenticated
using (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Authenticated delete own property photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'property-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "Authenticated delete own listing photos"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'listing-photos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
