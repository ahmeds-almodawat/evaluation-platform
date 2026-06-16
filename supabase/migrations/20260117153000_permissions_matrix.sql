-- Permissions Matrix (enterprise-ready)
-- Adds role-based permissions and optional per-user overrides.

begin;

-- 1) Tables
create table if not exists public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  role public.app_role not null,
  permission text not null,
  created_at timestamptz not null default now(),
  unique (role, permission)
);

create table if not exists public.user_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null,
  is_granted boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, permission)
);

alter table public.role_permissions enable row level security;
alter table public.user_permissions enable row level security;

-- 2) RLS policies
-- role_permissions: readable by any authenticated user; manageable by admin only.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='role_permissions' and policyname='role_permissions_read_authenticated'
  ) then
    create policy role_permissions_read_authenticated
      on public.role_permissions
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='role_permissions' and policyname='role_permissions_manage_admin'
  ) then
    create policy role_permissions_manage_admin
      on public.role_permissions
      for all
      to authenticated
      using (public.has_role(auth.uid(), 'admin'::public.app_role))
      with check (public.has_role(auth.uid(), 'admin'::public.app_role));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_permissions' and policyname='user_permissions_read_self_or_admin'
  ) then
    create policy user_permissions_read_self_or_admin
      on public.user_permissions
      for select
      to authenticated
      using (
        user_id = auth.uid()
        or public.has_role(auth.uid(), 'admin'::public.app_role)
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_permissions' and policyname='user_permissions_manage_admin_insert'
  ) then
    create policy user_permissions_manage_admin_insert
      on public.user_permissions
      for insert
      to authenticated
      with check (public.has_role(auth.uid(), 'admin'::public.app_role));

    create policy user_permissions_manage_admin_update
      on public.user_permissions
      for update
      to authenticated
      using (public.has_role(auth.uid(), 'admin'::public.app_role))
      with check (public.has_role(auth.uid(), 'admin'::public.app_role));

    create policy user_permissions_manage_admin_delete
      on public.user_permissions
      for delete
      to authenticated
      using (public.has_role(auth.uid(), 'admin'::public.app_role));
  end if;
end $$;

-- 3) Seed default permissions (idempotent)
-- Permission codes:
-- dashboards.department.view, dashboards.company.view
-- reports.view, reports.export
-- employees.read
-- departments.manage
-- users.manage, users.create, users.update, users.archive, users.restore, users.export, users.bulk
-- audit.read
-- templates.manage
-- branding.manage
-- messages.broadcast
-- alerts.view
-- evaluations.manage, evaluations.custom.create, evaluations.anonymous.manage

-- Admin: all permissions
insert into public.role_permissions(role, permission)
select 'admin'::public.app_role, p
from (values
  ('dashboards.department.view'),('dashboards.company.view'),
  ('reports.view'),('reports.export'),
  ('employees.read'),
  ('departments.manage'),
  ('users.manage'),('users.create'),('users.update'),('users.archive'),('users.restore'),('users.export'),('users.bulk'),
  ('audit.read'),
  ('templates.manage'),
  ('branding.manage'),
  ('messages.broadcast'),
  ('alerts.view'),
  ('evaluations.manage'),('evaluations.custom.create'),('evaluations.anonymous.manage')
) v(p)
on conflict do nothing;

-- Super User: operational permissions (no calculation logic / alerts)
insert into public.role_permissions(role, permission)
select 'super_user'::public.app_role, p
from (values
  ('dashboards.department.view'),('dashboards.company.view'),
  ('reports.view'),('reports.export'),
  ('employees.read'),
  ('departments.manage'),
  ('users.manage'),('users.create'),('users.update'),('users.archive'),('users.restore'),('users.export'),('users.bulk'),
  ('messages.broadcast'),
  ('evaluations.manage'),('evaluations.custom.create')
) v(p)
on conflict do nothing;

-- Audit: read-only permissions
insert into public.role_permissions(role, permission)
select 'audit'::public.app_role, p
from (values
  ('dashboards.company.view'),
  ('reports.view'),('reports.export'),
  ('employees.read'),
  ('audit.read')
) v(p)
on conflict do nothing;

-- User: minimal (no additional permissions; app provides self-service views)
-- (Intentionally empty)

commit;
