-- Enforce single effective role per user
--
-- Why:
-- - Multiple rows per user cause confusing UX (e.g., showing "user" even if also "admin").
-- - Multiple roles complicate security reviews and can create edge-case bypasses.
--
-- This migration:
-- 1) Deduplicates existing rows, keeping the highest-privilege role.
-- 2) Adds a unique constraint so each user has exactly one role row.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'user_roles'
  ) then
    raise notice 'public.user_roles does not exist; skipping.';
    return;
  end if;
end $$;

-- 1) Deduplicate: keep the highest role per user_id
with ranked as (
  select
    id,
    user_id,
    role,
    row_number() over (
      partition by user_id
      order by case role
        when 'admin'::public.app_role then 4
        when 'super_user'::public.app_role then 3
        when 'audit'::public.app_role then 2
        when 'user'::public.app_role then 1
        else 0
      end desc,
      id asc
    ) as rn
  from public.user_roles
)
delete from public.user_roles ur
using ranked r
where ur.id = r.id
  and r.rn > 1;

-- 2) Ensure one role row per user_id going forward
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_roles_user_id_unique'
  ) then
    alter table public.user_roles
      add constraint user_roles_user_id_unique unique (user_id);
  end if;
end $$;
