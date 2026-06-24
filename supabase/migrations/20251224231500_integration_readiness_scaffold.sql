-- Integration readiness scaffold (non-breaking)
-- Adds optional tables and baseline RLS for future ERP/HIS integrations.
-- Safe to apply even if the portal is not integrated yet.

-- 1) Audit logs (best-effort table, only created if missing)
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema='public' and table_name='audit_logs'
  ) then
    create table public.audit_logs (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      actor_user_id uuid null,
      action text not null,
      success boolean not null default true,
      metadata jsonb not null default '{}'::jsonb
    );
  end if;
end $$;

-- 2) External mappings
create table if not exists public.external_mappings (
  id uuid primary key default gen_random_uuid(),
  system text not null,
  entity_type text not null,
  entity_id uuid not null,
  external_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(system, entity_type, entity_id),
  unique(system, entity_type, external_id)
);

create index if not exists external_mappings_lookup_idx
  on public.external_mappings (system, entity_type, entity_id);

-- 3) Idempotency storage (optional)
create table if not exists public.api_idempotency (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  key text not null,
  request_hash text null,
  response_status int not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  unique(client_id, key)
);

-- 4) Integration clients registry (optional)
create table if not exists public.integration_clients (
  client_id text primary key,
  name text not null,
  is_active boolean not null default true,
  scopes text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at triggers
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname='set_updated_at_external_mappings') then
    create trigger set_updated_at_external_mappings
    before update on public.external_mappings
    for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname='set_updated_at_integration_clients') then
    create trigger set_updated_at_integration_clients
    before update on public.integration_clients
    for each row execute function public.set_updated_at();
  end if;
end $$;

-- RLS baselines
alter table public.audit_logs enable row level security;
alter table public.external_mappings enable row level security;
alter table public.api_idempotency enable row level security;
alter table public.integration_clients enable row level security;

-- Drop and recreate policies safely
do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname='public'
    and tablename in ('audit_logs','external_mappings','api_idempotency','integration_clients')
  loop
    execute format('drop policy if exists %I on public.%I;', p.policyname, p.tablename);
  end loop;
end $$;

-- Read policies
create policy "audit_logs_select"
on public.audit_logs
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'super_user'::public.app_role) or public.has_role(auth.uid(), 'audit'::public.app_role)
);

create policy "external_mappings_select"
on public.external_mappings
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'super_user'::public.app_role) or public.has_role(auth.uid(), 'audit'::public.app_role)
);

create policy "integration_clients_select"
on public.integration_clients
for select
to authenticated
using (
  public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'super_user'::public.app_role)
);

-- Write policies (admin/super only)
create policy "external_mappings_write"
on public.external_mappings
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'super_user'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'super_user'::public.app_role));

create policy "integration_clients_write"
on public.integration_clients
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Idempotency table is typically written only by server/service-role;
-- we keep it locked to admin/super for authenticated, but service-role bypasses RLS anyway.
create policy "api_idempotency_select"
on public.api_idempotency
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'super_user'::public.app_role));

create policy "api_idempotency_write"
on public.api_idempotency
for all
to authenticated
using (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'super_user'::public.app_role))
with check (public.has_role(auth.uid(), 'admin'::public.app_role) or public.has_role(auth.uid(), 'super_user'::public.app_role));
