-- Custom dashboards (Asana-like) with share + widget layout

create table if not exists public.custom_dashboards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null,
  title_en text not null,
  title_ar text not null,
  description_en text null,
  description_ar text null,
  is_published boolean not null default true
);

create table if not exists public.custom_dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.custom_dashboards(id) on delete cascade,
  created_at timestamptz not null default now(),
  widget_type text not null,
  -- layout metadata; renderer is free to interpret
  position jsonb not null default '{"order":0,"w":12}'::jsonb,
  config jsonb not null default '{}'::jsonb
);

create table if not exists public.custom_dashboard_shares (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.custom_dashboards(id) on delete cascade,
  created_at timestamptz not null default now(),
  share_role text null,
  share_user_id uuid null,
  can_edit boolean not null default false,
  constraint one_share_target check (
    (share_role is not null and share_user_id is null) or
    (share_role is null and share_user_id is not null)
  )
);

-- RLS
alter table public.custom_dashboards enable row level security;
alter table public.custom_dashboard_widgets enable row level security;
alter table public.custom_dashboard_shares enable row level security;

-- Read dashboards if:
-- - creator, or
-- - shared to their role, or
-- - shared to their user_id
drop policy if exists custom_dashboards_read on public.custom_dashboards;
create policy custom_dashboards_read
on public.custom_dashboards
for select
to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.custom_dashboard_shares s
    where s.dashboard_id = custom_dashboards.id
      and (
        s.share_user_id = auth.uid()
        or (
          s.share_role is not null
          and exists (
            select 1 from public.user_roles ur
            where ur.user_id = auth.uid() and ur.role::text = s.share_role
          )
        )
      )
  )
);

-- Admin/Super User can insert/update/delete dashboards
drop policy if exists custom_dashboards_write on public.custom_dashboards;
create policy custom_dashboards_write
on public.custom_dashboards
for insert
to authenticated
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
  )
);

drop policy if exists custom_dashboards_update on public.custom_dashboards;
create policy custom_dashboards_update
on public.custom_dashboards
for update
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
  )
);

drop policy if exists custom_dashboards_delete on public.custom_dashboards;
create policy custom_dashboards_delete
on public.custom_dashboards
for delete
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
  )
);

-- Widgets are readable if dashboard is readable
drop policy if exists custom_widgets_read on public.custom_dashboard_widgets;
create policy custom_widgets_read
on public.custom_dashboard_widgets
for select
to authenticated
using (
  exists (
    select 1
    from public.custom_dashboards d
    where d.id = custom_dashboard_widgets.dashboard_id
      and (
        d.created_by = auth.uid()
        or exists (
          select 1
          from public.custom_dashboard_shares s
          where s.dashboard_id = d.id
            and (
              s.share_user_id = auth.uid()
              or (
                s.share_role is not null
                and exists (
                  select 1 from public.user_roles ur
                  where ur.user_id = auth.uid() and ur.role::text = s.share_role
                )
              )
            )
        )
      )
  )
);

-- Widgets write: Admin/Super User only
drop policy if exists custom_widgets_write on public.custom_dashboard_widgets;
create policy custom_widgets_write
on public.custom_dashboard_widgets
for all
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
  )
);

-- Shares write: Admin/Super User only
drop policy if exists custom_shares_admin on public.custom_dashboard_shares;
create policy custom_shares_admin
on public.custom_dashboard_shares
for all
to authenticated
using (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
  )
)
with check (
  exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role in ('admin','super_user')
  )
);

-- Updated at trigger (local to this migration)
create or replace function public.set_updated_at_custom_dashboards()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_custom_dashboards_updated_at on public.custom_dashboards;
create trigger trg_custom_dashboards_updated_at
before update on public.custom_dashboards
for each row execute function public.set_updated_at_custom_dashboards();
