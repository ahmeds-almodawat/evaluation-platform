-- Audit logs table + helper.
-- Run this in Supabase SQL Editor.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid not null,
  actor_email text null,
  action text not null,
  entity_type text null,
  entity_id uuid null,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.audit_logs enable row level security;

-- Read: admin/super_user/audit can view
create policy "audit_logs_read_privileged" on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin','super_user','audit')
  )
);

-- Insert: any authenticated user can insert their own log
create policy "audit_logs_insert_own" on public.audit_logs
for insert
to authenticated
with check (actor_user_id = auth.uid());
