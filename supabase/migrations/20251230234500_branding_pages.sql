-- Per-page branding storage (optional).
-- The UI uses localStorage by default; this table is for future sync + multi-admin consistency.

create table if not exists public.branding_pages (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.branding_pages enable row level security;

-- Admin / Super User can read
drop policy if exists branding_pages_read on public.branding_pages;
create policy branding_pages_read
on public.branding_pages
for select
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
);

-- Admin / Super User can upsert (insert/update)
drop policy if exists branding_pages_write on public.branding_pages;
create policy branding_pages_write
on public.branding_pages
for insert
to authenticated
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user')
  )
);

drop policy if exists branding_pages_update on public.branding_pages;
create policy branding_pages_update
on public.branding_pages
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
