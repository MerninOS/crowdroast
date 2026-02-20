-- Lot images stored in Supabase Storage (external object storage).
-- Bucket is public-read so image URLs can be rendered in buyer/hub views.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lot-images',
  'lot-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public read access for images
drop policy if exists "lot_images_public_read" on storage.objects;
create policy "lot_images_public_read"
on storage.objects for select
using (bucket_id = 'lot-images');

-- Authenticated users can upload as themselves.
-- Allow either owner match or user-id folder match for compatibility.
drop policy if exists "lot_images_insert_own_folder" on storage.objects;
create policy "lot_images_insert_own_folder"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'lot-images'
  and (
    owner = auth.uid()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

-- Owners can update/delete only their own objects
drop policy if exists "lot_images_update_own_folder" on storage.objects;
create policy "lot_images_update_own_folder"
on storage.objects for update
to authenticated
using (
  bucket_id = 'lot-images'
  and (
    owner = auth.uid()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
)
with check (
  bucket_id = 'lot-images'
  and (
    owner = auth.uid()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

drop policy if exists "lot_images_delete_own_folder" on storage.objects;
create policy "lot_images_delete_own_folder"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'lot-images'
  and (
    owner = auth.uid()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);
