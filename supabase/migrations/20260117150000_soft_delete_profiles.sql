-- Step 4: Soft-delete users (archive/restore)

-- Add a soft-delete timestamp to profiles.
alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- Helpful index for admin screens and export filters
create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at);

-- Optional: ensure "active" means not deleted
-- (kept as application logic; no constraint here)
