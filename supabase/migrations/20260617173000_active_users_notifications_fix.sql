-- Active user evaluation + notification fix
--
-- Goals:
-- 1) Archived/inactive users must not receive new evaluation assignments.
-- 2) If a user is archived/deactivated, pending evaluation requests involving that user are removed.
-- 3) Every active evaluator receives an in-app notification when a new pending evaluation is created.
-- 4) Users can read/update/delete their own notification rows. Admin summary notifications remain supported.

-- -----------------------------------------------------------------------------
-- Notifications RLS: own notifications for all authenticated users
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
    raise notice 'public.notifications does not exist; skipping notifications policy setup.';
    return;
  end if;

  alter table public.notifications enable row level security;
  alter table public.notifications force row level security;

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
  loop
    execute format('drop policy if exists %I on public.notifications;', p.policyname);
  end loop;

  create policy "notifications_select_own"
  on public.notifications
  for select
  to authenticated
  using (user_id = auth.uid());

  create policy "notifications_update_own"
  on public.notifications
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

  create policy "notifications_delete_own"
  on public.notifications
  for delete
  to authenticated
  using (user_id = auth.uid());

  -- Notification inserts should be server-side only through SECURITY DEFINER triggers/functions.
  revoke all on table public.notifications from anon;
  grant select, update, delete on table public.notifications to authenticated;
end $$;

-- -----------------------------------------------------------------------------
-- Helper: create one notification for the assigned evaluator
-- -----------------------------------------------------------------------------
create or replace function public.notify_evaluator_new_evaluation()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  evaluator_active boolean;
begin
  if new.evaluator_id is null then
    return new;
  end if;

  -- Do not notify archived/deactivated evaluators.
  select coalesce(p.is_active, true) and p.deleted_at is null
  into evaluator_active
  from public.profiles p
  where p.id = new.evaluator_id;

  if evaluator_active is distinct from true then
    return new;
  end if;

  insert into public.notifications (
    user_id,
    title_en,
    title_ar,
    message_en,
    message_ar,
    type,
    related_evaluation_id,
    is_read
  )
  values (
    new.evaluator_id,
    'New evaluation request',
    'طلب تقييم جديد',
    format('You have a new evaluation request for period %s.', coalesce(new.period, '')),
    format('لديك طلب تقييم جديد للفترة %s.', coalesce(new.period, '')),
    'evaluation',
    new.id,
    false
  )
  on conflict do nothing;

  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'evaluations') then
    drop trigger if exists notify_evaluator_evaluation_insert on public.evaluations;
    create trigger notify_evaluator_evaluation_insert
    after insert on public.evaluations
    for each row
    execute function public.notify_evaluator_new_evaluation();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Cleanup when a profile is archived/deactivated
-- -----------------------------------------------------------------------------
create or replace function public.cleanup_archived_profile_surveys()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if (new.is_active is false or new.deleted_at is not null)
     and (coalesce(old.is_active, true) is distinct from false or old.deleted_at is null) then

    -- Pending requests are not historical records yet, so remove only pending rows.
    delete from public.evaluations e
    where e.status = 'pending'
      and (e.evaluator_id = new.id or e.evaluatee_id = new.id);

    -- Remove evaluation notification reminders for the archived user.
    delete from public.notifications n
    where n.user_id = new.id
      and n.type = 'evaluation';
  end if;

  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'profiles') then
    drop trigger if exists cleanup_archived_profile_surveys on public.profiles;
    create trigger cleanup_archived_profile_surveys
    after update of is_active, deleted_at on public.profiles
    for each row
    execute function public.cleanup_archived_profile_surveys();
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Helpful indexes
-- -----------------------------------------------------------------------------
create index if not exists notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_related_evaluation_id_idx
  on public.notifications (related_evaluation_id)
  where related_evaluation_id is not null;

create index if not exists evaluations_pending_evaluator_idx
  on public.evaluations (evaluator_id)
  where status = 'pending';

create index if not exists evaluations_pending_evaluatee_idx
  on public.evaluations (evaluatee_id)
  where status = 'pending';
