-- =========================================
-- Supabase Storage Setup (buckets + policies)
-- 用於 Flex Message 編輯器的圖片和影片儲存
-- =========================================

-- 建立 Buckets

-- broadcast-videos: 廣播影片儲存
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'broadcast-videos',
  'broadcast-videos',
  true,
  52428800, -- 50MB
  array['video/mp4', 'video/quicktime', 'video/x-msvideo']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- broadcast-images: 廣播圖片儲存
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'broadcast-images',
  'broadcast-images',
  true,
  5242880, -- 5MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- flex-assets: Flex 編輯器資源
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'flex-assets',
  'flex-assets',
  true,
  10485760, -- 10MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- =========================================
-- Storage Policies
-- 注意：storage.objects 已經啟用 RLS，我們只需要設定 policies
-- =========================================

-- 清除舊的 policies
drop policy if exists "broadcast_videos_public_read" on storage.objects;
drop policy if exists "broadcast_videos_auth_upload" on storage.objects;
drop policy if exists "broadcast_videos_owner_update" on storage.objects;
drop policy if exists "broadcast_videos_owner_delete" on storage.objects;

drop policy if exists "broadcast_images_public_read" on storage.objects;
drop policy if exists "broadcast_images_auth_upload" on storage.objects;
drop policy if exists "broadcast_images_owner_update" on storage.objects;
drop policy if exists "broadcast_images_owner_delete" on storage.objects;

drop policy if exists "flex_assets_public_read" on storage.objects;
drop policy if exists "flex_assets_auth_upload" on storage.objects;
drop policy if exists "flex_assets_owner_update" on storage.objects;
drop policy if exists "flex_assets_owner_delete" on storage.objects;

-- broadcast-videos policies
create policy "broadcast_videos_public_read"
on storage.objects for select
to public
using (bucket_id = 'broadcast-videos');

create policy "broadcast_videos_auth_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'broadcast-videos');

create policy "broadcast_videos_owner_update"
on storage.objects for update
to authenticated
using (bucket_id = 'broadcast-videos' and (auth.uid())::text = (owner)::text)
with check (bucket_id = 'broadcast-videos');

create policy "broadcast_videos_owner_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'broadcast-videos' and (auth.uid())::text = (owner)::text);

-- broadcast-images policies
create policy "broadcast_images_public_read"
on storage.objects for select
to public
using (bucket_id = 'broadcast-images');

create policy "broadcast_images_auth_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'broadcast-images');

create policy "broadcast_images_owner_update"
on storage.objects for update
to authenticated
using (bucket_id = 'broadcast-images' and (auth.uid())::text = (owner)::text)
with check (bucket_id = 'broadcast-images');

create policy "broadcast_images_owner_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'broadcast-images' and (auth.uid())::text = (owner)::text);

-- flex-assets policies
create policy "flex_assets_public_read"
on storage.objects for select
to public
using (bucket_id = 'flex-assets');

create policy "flex_assets_auth_upload"
on storage.objects for insert
to authenticated
with check (bucket_id = 'flex-assets');

create policy "flex_assets_owner_update"
on storage.objects for update
to authenticated
using (bucket_id = 'flex-assets' and (auth.uid())::text = (owner)::text)
with check (bucket_id = 'flex-assets');

create policy "flex_assets_owner_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'flex-assets' and (auth.uid())::text = (owner)::text);

-- =========================================
-- 完成！
-- =========================================
