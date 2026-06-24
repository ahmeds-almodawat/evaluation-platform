-- Admin-only notifications
--
-- Goal:
-- - Only admins receive and can read in-app notifications.
-- - Notifications are generated server-side (triggers), not from the client.
--
-- This migration is written to be safe to re-run.

-- -----------------------------------------------------------------------------
-- 1) Helper: insert a notification for every admin
-- -----------------------------------------------------------------------------
create or replace function public.notify_admins(
  _type text,
  _title_en text,
  _title_ar text,
  _message_en text,
  _message_ar text,
  _related_evaluation_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- If notifications table doesn't exist (edge case), do nothing.
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'notifications'
  ) then
    return;
  end if;

  insert into public.notifications (
    user_id,
    type,
    title_en,
    title_ar,
    message_en,
    message_ar,
    related_evaluation_id,
    is_read
  )
  select distinct
    ur.user_id,
    coalesce(_type, 'admin'),
    _title_en,
    _title_ar,
    _message_en,
    _message_ar,
    _related_evaluation_id,
    false
  from public.user_roles ur
  where ur.role = 'admin'::public.app_role;
end;
$$;


-- -----------------------------------------------------------------------------
-- 2) Triggers: notify admins when evaluations are created and when they complete
-- -----------------------------------------------------------------------------

create or replace function public.trg_notify_admin_on_evaluations_insert()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  cnt int;
  p text;
begin
  select count(*) into cnt from new_rows;
  select max(period) into p from new_rows;

  perform public.notify_admins(
    'evaluation',
    'New evaluations created',
    'تم إنشاء تقييمات جديدة',
    format('%s evaluations were created for period %s.', cnt, coalesce(p, '')), 
    format('تم إنشاء %s تقييمات للفترة %s.', cnt, coalesce(p, '')),
    null
  );

  return null;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='evaluations') then
    if not exists (select 1 from pg_trigger where tgname = 'notify_admin_evaluations_insert') then
      create trigger notify_admin_evaluations_insert
      after insert on public.evaluations
      referencing new table as new_rows
      for each statement
      execute function public.trg_notify_admin_on_evaluations_insert();
    end if;
  end if;
end $$;


create or replace function public.trg_notify_admin_on_evaluations_completed()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  cnt int;
  p text;
begin
  select count(*)
  into cnt
  from new_rows n
  join old_rows o using (id)
  where o.status is distinct from 'completed'
    and n.status = 'completed';

  if cnt is null or cnt = 0 then
    return null;
  end if;

  select max(n.period)
  into p
  from new_rows n
  join old_rows o using (id)
  where o.status is distinct from 'completed'
    and n.status = 'completed';

  perform public.notify_admins(
    'evaluation',
    'Evaluations completed',
    'تم إكمال التقييمات',
    format('%s evaluations were marked completed for period %s.', cnt, coalesce(p, '')),
    format('تم تحديد %s تقييمات كمكتملة للفترة %s.', cnt, coalesce(p, '')),
    null
  );

  return null;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='evaluations') then
    if not exists (select 1 from pg_trigger where tgname = 'notify_admin_evaluations_completed') then
      create trigger notify_admin_evaluations_completed
      after update on public.evaluations
      referencing new table as new_rows old table as old_rows
      for each statement
      execute function public.trg_notify_admin_on_evaluations_completed();
    end if;
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 3) RLS: notifications are readable only by admins (their own rows)
-- -----------------------------------------------------------------------------

do $$
declare
  p record;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'notifications'
  ) then
    raise notice 'public.notifications does not exist; skipping RLS policy setup.';
    return;
  end if;

  alter table public.notifications enable row level security;
  alter table public.notifications force row level security;

  -- Drop any existing policies to keep the model simple and predictable.
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
  loop
    execute format('drop policy if exists %I on public.notifications;', p.policyname);
  end loop;

  -- Admins can only read their own notifications.
  execute $pol$
    create policy "notifications_select_admin_own"
    on public.notifications
    for select
    to authenticated
    using (
      user_id = auth.uid()
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  $pol$;

  -- Admins can mark their own notifications as read.
  execute $pol$
    create policy "notifications_update_admin_own"
    on public.notifications
    for update
    to authenticated
    using (
      user_id = auth.uid()
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
    with check (
      user_id = auth.uid()
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  $pol$;

  -- Admins can delete their own notifications.
  execute $pol$
    create policy "notifications_delete_admin_own"
    on public.notifications
    for delete
    to authenticated
    using (
      user_id = auth.uid()
      and public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  $pol$;

  -- No INSERT policy for authenticated users (default deny).

  -- Tighten grants (RLS remains the primary enforcement).
  revoke all on table public.notifications from anon;
  grant select, update, delete on table public.notifications to authenticated;
end $$;


-- -----------------------------------------------------------------------------
-- 4) Performance: index for dropdown queries
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='notifications') then
    if not exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and indexname = 'notifications_user_created_at_idx'
    ) then
      create index notifications_user_created_at_idx
        on public.notifications (user_id, created_at desc);
    end if;
  end if;
end $$;
