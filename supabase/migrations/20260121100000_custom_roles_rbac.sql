-- Custom Roles (RBAC)
-- Allows Admin to create named roles and attach permissions.

create table if not exists public.custom_roles (
  role_key text primary key,
  name_en text not null,
  name_ar text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.custom_role_permissions (
  role_key text not null references public.custom_roles(role_key) on delete cascade,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role_key, permission)
);

-- One custom role per user (as requested)
create table if not exists public.user_custom_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_key text not null references public.custom_roles(role_key) on delete restrict,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.custom_roles enable row level security;
alter table public.custom_role_permissions enable row level security;
alter table public.user_custom_roles enable row level security;

-- Policies: keep permissive for now; actual access is enforced by app-level permission "roles.manage".
-- If you want stricter DB-level RBAC later, we can implement that after your HR/Hospital modules stabilize.
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='custom_roles' and policyname='custom_roles_read'
  ) then
    create policy custom_roles_read on public.custom_roles for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='custom_roles' and policyname='custom_roles_write'
  ) then
    create policy custom_roles_write on public.custom_roles for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='custom_role_permissions' and policyname='custom_role_permissions_read'
  ) then
    create policy custom_role_permissions_read on public.custom_role_permissions for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='custom_role_permissions' and policyname='custom_role_permissions_write'
  ) then
    create policy custom_role_permissions_write on public.custom_role_permissions for all using (true) with check (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_custom_roles' and policyname='user_custom_roles_read'
  ) then
    create policy user_custom_roles_read on public.user_custom_roles for select using (true);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='user_custom_roles' and policyname='user_custom_roles_write'
  ) then
    create policy user_custom_roles_write on public.user_custom_roles for all using (true) with check (true);
  end if;
end $$;
