-- Add staff_id + active status for integration readiness & HR lifecycle
-- Safe to run multiple times.

alter table public.profiles
  add column if not exists staff_id text;

alter table public.profiles
  add column if not exists is_active boolean not null default true;

-- Helpful indexes for search + login resolution
create index if not exists profiles_staff_id_idx on public.profiles (staff_id);
create index if not exists profiles_phone_idx on public.profiles (phone);
create index if not exists profiles_is_active_idx on public.profiles (is_active);

-- Optional: keep staff_id trimmed
update public.profiles
set staff_id = nullif(trim(staff_id), '')
where staff_id is not null;
