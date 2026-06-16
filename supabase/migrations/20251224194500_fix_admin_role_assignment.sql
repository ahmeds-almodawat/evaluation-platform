-- Fix role escalation: only admins can create/assign the admin role.
--
-- Why:
-- - UI guards are not a security boundary.
-- - If super_user can write to user_roles (directly or indirectly),
--   they must never be able to create/assign admin.
--
-- This migration:
-- 1) Hardens helper functions to safely bypass RLS (future-proof if FORCE RLS is enabled)
-- 2) Replaces user_roles RLS policies with ones that:
--    - let users read their own role
--    - let admin/super_user/audit read roles
--    - let admin manage any roles
--    - let super_user manage ONLY non-admin roles

-- 1) Harden helper functions
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

create or replace function public.get_user_role(_user_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select role
  from public.user_roles
  where user_id = _user_id
  limit 1;
$$;

-- 2) Replace user_roles policies
alter table public.user_roles enable row level security;

-- Drop ALL existing policies on public.user_roles (safe/ idempotent)
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
  loop
    execute format('drop policy if exists %I on public.user_roles;', p.policyname);
  end loop;
end $$;

-- SELECT
create policy "user_roles_select_own_or_privileged" on public.user_roles
for select to authenticated
using (
  user_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
  or public.has_role(auth.uid(), 'audit')
);

-- INSERT
create policy "user_roles_insert_admin_or_super_user_non_admin" on public.user_roles
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or (
    public.has_role(auth.uid(), 'super_user')
    and role <> 'admin'
  )
);

-- UPDATE
create policy "user_roles_update_admin_or_super_user_non_admin" on public.user_roles
for update to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or (
    public.has_role(auth.uid(), 'super_user')
    and role <> 'admin'
  )
)
with check (
  public.has_role(auth.uid(), 'admin')
  or (
    public.has_role(auth.uid(), 'super_user')
    and role <> 'admin'
  )
);

-- DELETE
create policy "user_roles_delete_admin_or_super_user_non_admin" on public.user_roles
for delete to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or (
    public.has_role(auth.uid(), 'super_user')
    and role <> 'admin'
  )
);
