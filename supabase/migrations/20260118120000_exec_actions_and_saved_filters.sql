-- Step 5: Executive Actions + Server-side Saved Filters

begin;

-- 1) Saved filters (per user), scoped by a string (e.g. 'executive_dashboards')
create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  is_shared boolean not null default false
);

create index if not exists saved_filters_owner_scope_idx on public.saved_filters(owner_user_id, scope);

-- 2) Dashboard flags (lightweight markers)
create table if not exists public.dashboard_flags (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,
  target_type text not null, -- 'profile' | 'department'
  target_id uuid not null,
  flag_type text not null default 'attention',
  note text null
);

create index if not exists dashboard_flags_target_idx on public.dashboard_flags(target_type, target_id);

-- 3) Action tickets (follow-ups)
create table if not exists public.action_tickets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text null,
  severity text not null default 'medium', -- low | medium | high
  status text not null default 'open',     -- open | in_progress | done
  due_date date null,
  assignee_user_id uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.action_ticket_targets (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.action_tickets(id) on delete cascade,
  target_type text not null, -- 'profile' | 'department'
  target_id uuid not null,
  label text null
);

create index if not exists action_ticket_targets_ticket_idx on public.action_ticket_targets(ticket_id);
create index if not exists action_ticket_targets_target_idx on public.action_ticket_targets(target_type, target_id);

-- 4) RLS
alter table public.saved_filters enable row level security;
alter table public.dashboard_flags enable row level security;
alter table public.action_tickets enable row level security;
alter table public.action_ticket_targets enable row level security;

-- saved_filters: owner can manage; shared can be read by authenticated.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_filters' and policyname='saved_filters_read'
  ) then
    create policy saved_filters_read
      on public.saved_filters
      for select
      to authenticated
      using (owner_user_id = auth.uid() or is_shared = true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='saved_filters' and policyname='saved_filters_manage_owner_or_admin'
  ) then
    create policy saved_filters_manage_owner_or_admin
      on public.saved_filters
      for all
      to authenticated
      using (owner_user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::public.app_role))
      with check (owner_user_id = auth.uid() or public.has_role(auth.uid(), 'admin'::public.app_role));
  end if;
end $$;

-- dashboard_flags: anyone with dashboards/company view can read; only creator/admin can delete.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='dashboard_flags' and policyname='dashboard_flags_read'
  ) then
    create policy dashboard_flags_read
      on public.dashboard_flags
      for select
      to authenticated
      using (
        true
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='dashboard_flags' and policyname='dashboard_flags_insert'
  ) then
    create policy dashboard_flags_insert
      on public.dashboard_flags
      for insert
      to authenticated
      with check (created_by = auth.uid());
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='dashboard_flags' and policyname='dashboard_flags_delete'
  ) then
    create policy dashboard_flags_delete
      on public.dashboard_flags
      for delete
      to authenticated
      using (created_by = auth.uid() or public.has_role(auth.uid(), 'admin'::public.app_role));
  end if;
end $$;

-- action_tickets: readable by authenticated; manageable by admin/super_user only.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='action_tickets' and policyname='action_tickets_read'
  ) then
    create policy action_tickets_read
      on public.action_tickets
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='action_tickets' and policyname='action_tickets_manage_admin_super'
  ) then
    create policy action_tickets_manage_admin_super
      on public.action_tickets
      for all
      to authenticated
      using (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'super_user'::public.app_role)
      )
      with check (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'super_user'::public.app_role)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='action_ticket_targets' and policyname='action_ticket_targets_read'
  ) then
    create policy action_ticket_targets_read
      on public.action_ticket_targets
      for select
      to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='action_ticket_targets' and policyname='action_ticket_targets_manage_admin_super'
  ) then
    create policy action_ticket_targets_manage_admin_super
      on public.action_ticket_targets
      for all
      to authenticated
      using (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'super_user'::public.app_role)
      )
      with check (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        or public.has_role(auth.uid(), 'super_user'::public.app_role)
      );
  end if;
end $$;

-- 5) Extend permissions matrix (idempotent)
insert into public.role_permissions(role, permission)
select 'admin'::public.app_role, p
from (values
  ('dashboards.exec.view'),
  ('actions.view'),('actions.manage')
) v(p)
on conflict do nothing;

insert into public.role_permissions(role, permission)
select 'super_user'::public.app_role, p
from (values
  ('dashboards.exec.view'),
  ('actions.view'),('actions.manage')
) v(p)
on conflict do nothing;

insert into public.role_permissions(role, permission)
select 'audit'::public.app_role, p
from (values
  ('dashboards.exec.view'),
  ('actions.view')
) v(p)
on conflict do nothing;

commit;
