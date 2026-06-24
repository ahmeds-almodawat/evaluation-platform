-- Branding settings persisted in DB + Storage bucket for branding assets
-- This makes branding (logo, favicon, header icon, sizing, colors) consistent across devices.

-- 1) Table to store a single row (id=1)
create table if not exists public.branding_settings (
  id integer primary key,
  branding jsonb not null default '{}'::jsonb,
  page_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.branding_settings enable row level security;

-- Everyone authenticated can read (so all users see the same branding)
drop policy if exists branding_settings_read on public.branding_settings;
create policy branding_settings_read
on public.branding_settings
for select
to authenticated
using (true);

-- Only Admin/Super User can write
drop policy if exists branding_settings_write on public.branding_settings;
create policy branding_settings_write
on public.branding_settings
for insert
to authenticated
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
);

drop policy if exists branding_settings_update on public.branding_settings;
create policy branding_settings_update
on public.branding_settings
for update
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
);

-- Seed a default row (safe if already exists)
insert into public.branding_settings (id, branding, page_overrides)
values (1, '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;


-- 2) Storage bucket for branding assets
-- NOTE: requires Supabase Storage. This is safe to run even if bucket already exists.
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

-- 3) Storage policies
-- Allow authenticated users to read branding assets
drop policy if exists branding_assets_read on storage.objects;
create policy branding_assets_read
on storage.objects
for select
to authenticated
using (bucket_id = 'branding');

-- Allow only Admin/Super User to upload/update/delete branding assets
drop policy if exists branding_assets_insert on storage.objects;
create policy branding_assets_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'branding'
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
);

drop policy if exists branding_assets_update on storage.objects;
create policy branding_assets_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'branding'
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
)
with check (
  bucket_id = 'branding'
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
);

drop policy if exists branding_assets_delete on storage.objects;
create policy branding_assets_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'branding'
  and exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
);
