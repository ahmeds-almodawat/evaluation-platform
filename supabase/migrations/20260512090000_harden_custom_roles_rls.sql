-- Harden Custom Roles RLS
-- Purpose: replace earlier permissive custom role policies with DB-level RBAC.
-- This migration is intentionally additive/override-style so it is safe on projects
-- where the earlier custom role migration was already applied.

begin;

create or replace function public.is_admin_user(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user_id is null then
    return false;
  end if;

  return exists (
    select 1
    from public.user_roles ur
    where ur.user_id = v_user_id
      and ur.role::text = 'admin'
  );
end;
$$;

grant execute on function public.is_admin_user(uuid) to authenticated, service_role;

alter table if exists public.custom_roles enable row level security;
alter table if exists public.custom_role_permissions enable row level security;
alter table if exists public.user_custom_roles enable row level security;

-- Remove insecure broad policies from the earlier custom_roles_rbac migration.
drop policy if exists custom_roles_read on public.custom_roles;
drop policy if exists custom_roles_write on public.custom_roles;
drop policy if exists custom_role_permissions_read on public.custom_role_permissions;
drop policy if exists custom_role_permissions_write on public.custom_role_permissions;
drop policy if exists user_custom_roles_read on public.user_custom_roles;
drop policy if exists user_custom_roles_write on public.user_custom_roles;

-- custom_roles: admins can read/manage all; users may read only their assigned role name.
create policy custom_roles_select_admin_or_assigned
on public.custom_roles
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.user_custom_roles ucr
    where ucr.user_id = auth.uid()
      and ucr.role_key = custom_roles.role_key
  )
);

create policy custom_roles_insert_admin
on public.custom_roles
for insert
to authenticated
with check (public.is_admin_user(auth.uid()));

create policy custom_roles_update_admin
on public.custom_roles
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

create policy custom_roles_delete_admin
on public.custom_roles
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

-- custom_role_permissions: admins can read/manage all; users may read permissions for their assigned role only.
create policy custom_role_permissions_select_admin_or_assigned
on public.custom_role_permissions
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or exists (
    select 1
    from public.user_custom_roles ucr
    where ucr.user_id = auth.uid()
      and ucr.role_key = custom_role_permissions.role_key
  )
);

create policy custom_role_permissions_insert_admin
on public.custom_role_permissions
for insert
to authenticated
with check (public.is_admin_user(auth.uid()));

create policy custom_role_permissions_update_admin
on public.custom_role_permissions
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

create policy custom_role_permissions_delete_admin
on public.custom_role_permissions
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

-- user_custom_roles: admins can read/manage all; users may read only their own assignment.
create policy user_custom_roles_select_admin_or_self
on public.user_custom_roles
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or user_id = auth.uid()
);

create policy user_custom_roles_insert_admin
on public.user_custom_roles
for insert
to authenticated
with check (public.is_admin_user(auth.uid()));

create policy user_custom_roles_update_admin
on public.user_custom_roles
for update
to authenticated
using (public.is_admin_user(auth.uid()))
with check (public.is_admin_user(auth.uid()));

create policy user_custom_roles_delete_admin
on public.user_custom_roles
for delete
to authenticated
using (public.is_admin_user(auth.uid()));

commit;
