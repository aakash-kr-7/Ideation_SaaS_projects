-- Storage buckets and owner-scoped policies.
-- This migration creates the required storage buckets declaratively and
-- ensures user-assets is owner-path-scoped, fixing the documented High
-- finding in Security.md.

-- exports: private, tenant-path-scoped report artifacts
insert into storage.buckets (id, name, public, file_size_limit)
values ('exports', 'exports', false, 52428800)
on conflict (id) do update set public = false;

-- cached-sources: private, service-role only raw-source cache
insert into storage.buckets (id, name, public, file_size_limit)
values ('cached-sources', 'cached-sources', false, 52428800)
on conflict (id) do update set public = false;

-- user-assets: private with owner-path scoping
-- Previously public with no path constraint — now private and owner-scoped.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-assets', 'user-assets', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'];

-- Drop existing storage policies so they can be recreated cleanly
do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'sb_%'
  loop
    execute format('drop policy if exists %I on storage.objects', policy_name);
  end loop;
end $$;

-- exports bucket: owner can read their own exports
create policy "sb_exports_owner_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- exports bucket: service role can insert/update/delete (no direct user upload)
-- Service role bypasses RLS so no explicit policy is needed.

-- cached-sources: service-role only (no user access)
-- No policies needed; service role bypasses RLS and all other roles are denied.

-- user-assets: owner-path scoped upload, read, update, delete
create policy "sb_user_assets_owner_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sb_user_assets_owner_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sb_user_assets_owner_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "sb_user_assets_owner_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

notify pgrst, 'reload schema';
