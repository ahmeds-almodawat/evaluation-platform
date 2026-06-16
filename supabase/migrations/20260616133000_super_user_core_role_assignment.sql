-- Super User Core Role Assignment Fix
-- Purpose:
-- - Super Users with users.manage can create/update users as User, Audit, or Super User.
-- - Super Users cannot create/assign/edit Admin users.
-- - Role dropdowns and user role display work even after custom role RLS hardening.

begin;

-- Helper used by RLS to determine whether a role key maps to a non-admin legacy tier.
-- SECURITY DEFINER + row_security off avoids policy recursion when policies check custom_roles.
create or replace function public.role_key_is_non_admin(p_role_key text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce((
    select cr.legacy_role <> 'admin'
    from public.custom_roles cr
    where lower(cr.role_key) = lower(btrim(coalesce(p_role_key, '')))
    limit 1
  ), false);
$$;

grant execute on function public.role_key_is_non_admin(text) to authenticated, service_role;

-- Make sure the four core custom roles exist and are mapped to the correct legacy tiers.
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

alter table if exists public.custom_roles enable row level security;
alter table if exists public.user_custom_roles enable row level security;

-- Replace only the relevant hardened policies. Keep admin-only write on custom_roles.
drop policy if exists custom_roles_select_admin_or_assigned on public.custom_roles;
create policy custom_roles_select_admin_or_assigned
on public.custom_roles
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or public.has_permission('users.manage', auth.uid())
  or exists (
    select 1
    from public.user_custom_roles ucr
    where ucr.user_id = auth.uid()
      and ucr.role_key = custom_roles.role_key
  )
);

-- Super Users need to read user role assignments on Users Management.
drop policy if exists user_custom_roles_select_admin_or_self on public.user_custom_roles;
create policy user_custom_roles_select_admin_or_self
on public.user_custom_roles
for select
to authenticated
using (
  public.is_admin_user(auth.uid())
  or public.has_permission('users.manage', auth.uid())
  or user_id = auth.uid()
);

-- Direct DB-level safety: users.manage can assign/edit/delete only non-admin custom roles.
-- Admin remains admin-only.
drop policy if exists user_custom_roles_insert_admin on public.user_custom_roles;
create policy user_custom_roles_insert_admin
on public.user_custom_roles
for insert
to authenticated
with check (
  public.is_admin_user(auth.uid())
  or (
    public.has_permission('users.manage', auth.uid())
    and public.role_key_is_non_admin(role_key)
  )
);

drop policy if exists user_custom_roles_update_admin on public.user_custom_roles;
create policy user_custom_roles_update_admin
on public.user_custom_roles
for update
to authenticated
using (
  public.is_admin_user(auth.uid())
  or (
    public.has_permission('users.manage', auth.uid())
    and public.role_key_is_non_admin(role_key)
  )
)
with check (
  public.is_admin_user(auth.uid())
  or (
    public.has_permission('users.manage', auth.uid())
    and public.role_key_is_non_admin(role_key)
  )
);

drop policy if exists user_custom_roles_delete_admin on public.user_custom_roles;
create policy user_custom_roles_delete_admin
on public.user_custom_roles
for delete
to authenticated
using (
  public.is_admin_user(auth.uid())
  or (
    public.has_permission('users.manage', auth.uid())
    and public.role_key_is_non_admin(role_key)
  )
);

commit;
