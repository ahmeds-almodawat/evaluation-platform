-- Clean Model RBAC (SAFE version)
-- Custom roles are real RBAC; legacy roles are compatibility only.
-- This version avoids bulk-updating user_roles to not trigger "last admin" guard.

begin;

-- 1) Add mapping: custom_roles.legacy_role
alter table public.custom_roles
  add column if not exists legacy_role text not null default 'user';

-- 2) Enforce allowed legacy tiers
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'custom_roles_legacy_role_check'
  ) then
    alter table public.custom_roles
      add constraint custom_roles_legacy_role_check
      check (legacy_role in ('admin','super_user','audit','user'));
  end if;
end $$;

-- 3) Ensure the 4 default custom roles exist (and map to same legacy tier)
insert into public.custom_roles (role_key, name_en, name_ar, description, legacy_role)
values
  ('admin',      'Admin',      'مدير النظام',   'Full administrative access', 'admin'),
  ('super_user', 'Super User', 'مستخدم متميز',  'User management + reporting', 'super_user'),
  ('audit',      'Audit',      'مدقق',          'Read-only audit/reporting access', 'audit'),
  ('user',       'User',       'مستخدم',        'Standard user access', 'user')
on conflict (role_key) do update
set
  name_en = excluded.name_en,
  name_ar = excluded.name_ar,
  description = excluded.description,
  legacy_role = excluded.legacy_role;

-- 4) Backfill legacy_role for existing custom roles safely
update public.custom_roles cr
set legacy_role = case
  when lower(cr.role_key) = 'admin' then 'admin'
  when lower(cr.role_key) in ('super_user','superuser','super-user') then 'super_user'
  when lower(cr.role_key) in ('audit','auditor') then 'audit'
  when lower(cr.role_key) = 'user' then 'user'
  else 'user'
end
where cr.legacy_role is null
   or cr.legacy_role not in ('admin','super_user','audit','user');

-- 5) Trigger function: sync user_roles from user_custom_roles
-- NOTE: user_roles.role is enum app_role, so cast to enum.
create or replace function public.sync_legacy_user_role_from_custom()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_role_key text;
  v_legacy_role text;
begin
  if (tg_op = 'DELETE') then
    v_user_id := old.user_id;

    -- When custom role assignment removed: set legacy tier to 'user'
    -- This may be blocked by your "last admin" guard if this user is the last admin.
    -- That is OK; it prevents locking you out.
    begin
      insert into public.user_roles (user_id, role)
      values (v_user_id, 'user'::public.app_role)
      on conflict (user_id) do update
        set role = excluded.role;
    exception when others then
      -- If a guard prevents demotion (e.g., last admin), do not fail the whole transaction.
      -- We leave legacy role unchanged.
      null;
    end;

    return old;
  end if;

  v_user_id := new.user_id;
  v_role_key := new.role_key;

  select cr.legacy_role
    into v_legacy_role
  from public.custom_roles cr
  where cr.role_key = v_role_key;

  v_legacy_role := coalesce(v_legacy_role, 'user');

  begin
    insert into public.user_roles (user_id, role)
    values (v_user_id, (v_legacy_role)::public.app_role)
    on conflict (user_id) do update
      set role = excluded.role;
  exception when others then
    -- If your "last admin" guard blocks a demotion, keep existing legacy role.
    null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_sync_legacy_user_role_from_custom on public.user_custom_roles;

create trigger trg_sync_legacy_user_role_from_custom
after insert or update or delete
on public.user_custom_roles
for each row
execute function public.sync_legacy_user_role_from_custom();

-- 6) One-time baseline: ensure every profile has a legacy row = 'user' (does NOT demote anyone)
-- This avoids touching existing admins/super_users.
insert into public.user_roles (user_id, role)
select p.id, 'user'::public.app_role
from public.profiles p
left join public.user_roles ur on ur.user_id = p.id
where ur.user_id is null
on conflict (user_id) do nothing;

-- 7) Optional (SAFE) "one-time sync" strategy:
-- We DO NOT rewrite user_roles here. Instead, we ensure that users who already have a legacy tier
-- also have matching default custom role assignments ONLY for the 4 default roles.
-- This will not demote admins; it just aligns user_custom_roles for legacy tiers.
insert into public.user_custom_roles (user_id, role_key)
select ur.user_id, ur.role::text
from public.user_roles ur
where ur.role::text in ('admin','super_user','audit','user')
on conflict (user_id) do nothing;

commit;
