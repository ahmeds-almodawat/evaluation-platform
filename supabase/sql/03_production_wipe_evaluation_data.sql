-- Production evaluation-only data wipe
-- Date: 2026-06-24
--
-- Purpose:
-- - Remove all existing pre-production / pilot evaluation records before go-live.
-- - This is intended to be run before real production evaluations are created.
-- - Do not run after production evaluations exist unless you intentionally want
--   those evaluation records removed too.
--
-- Explicitly preserved:
-- - No users or people records are deleted: auth.users and public.profiles remain.
-- - No setup/settings records are deleted: roles, permissions, departments,
--   org units, manager assignments, templates, question bank, branding, and
--   user settings remain.
-- - Messages and audit logs remain. Only notifications linked directly to
--   deleted evaluations are removed.
--
-- Safety behavior:
-- - Running this file as-is only shows preflight counts, then stops at the
--   safety gate before deleting anything.
-- - To execute the wipe, uncomment the set_config line marked EXECUTE GATE.
-- - The wipe uses DELETE instead of TRUNCATE ... CASCADE so unrelated
--   notification rows are not silently removed.

create temp table if not exists pg_temp.production_wipe_counts (
  phase text not null,
  table_name text not null,
  row_count bigint not null,
  captured_at timestamptz not null default now()
) on commit preserve rows;

truncate table pg_temp.production_wipe_counts;

-- 1) PREFLIGHT COUNTS
do $$
declare
  target_table text;
  target_count bigint;
begin
  foreach target_table in array array[
    'monthly_unit_scores',
    'monthly_department_scores',
    'monthly_employee_scores',
    'custom_evaluation_send_events',
    'anonymous_evaluation_drafts',
    'anonymous_evaluation_responses',
    'anonymous_evaluation_recipients',
    'anonymous_evaluation_secrets',
    'anonymous_evaluations',
    'evaluation_answers',
    'evaluation_drafts',
    'evaluations',
    'evaluation_campaigns'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('select count(*) from public.%I', target_table) into target_count;
      insert into pg_temp.production_wipe_counts (phase, table_name, row_count)
      values ('before', target_table, target_count);
    end if;
  end loop;

  if to_regclass('public.notifications') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'related_evaluation_id'
    )
  then
    select count(*) into target_count
    from public.notifications
    where related_evaluation_id is not null;

    insert into pg_temp.production_wipe_counts (phase, table_name, row_count)
    values ('before', 'notifications.related_evaluation_id', target_count);
  end if;
end $$;

select phase, table_name, row_count, captured_at
from pg_temp.production_wipe_counts
where phase = 'before'
order by table_name;

begin;

set local lock_timeout = '15s';
set local statement_timeout = '5min';

-- 2) EXECUTE GATE
-- Uncomment the next line only after reviewing the preflight counts.
-- This confirmation is transaction-local and expires after commit/rollback.
-- select set_config('app.confirm_production_evaluation_wipe', 'YES_DELETE_EVALUATION_DATA', true);

do $$
begin
  if coalesce(current_setting('app.confirm_production_evaluation_wipe', true), '') <> 'YES_DELETE_EVALUATION_DATA' then
    raise exception
      'Safety gate is not enabled. Review counts, then uncomment the EXECUTE GATE set_config line to delete production-start evaluation data.';
  end if;
end $$;

-- 3) TARGETED WIPE
do $$
declare
  target_table text;
  deleted_rows bigint;
  audit_metadata jsonb;
  wipe_request_id text := gen_random_uuid()::text;
begin
  -- Preserve unrelated notifications. Only evaluation-linked notifications are removed.
  if to_regclass('public.notifications') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'related_evaluation_id'
    )
  then
    delete from public.notifications
    where related_evaluation_id is not null;

    get diagnostics deleted_rows = row_count;
    insert into pg_temp.production_wipe_counts (phase, table_name, row_count)
    values ('deleted', 'notifications.related_evaluation_id', deleted_rows);
  end if;

  foreach target_table in array array[
    'monthly_unit_scores',
    'monthly_department_scores',
    'monthly_employee_scores',
    'custom_evaluation_send_events',
    'anonymous_evaluation_drafts',
    'anonymous_evaluation_responses',
    'anonymous_evaluation_recipients',
    'anonymous_evaluation_secrets',
    'anonymous_evaluations',
    'evaluation_answers',
    'evaluation_drafts',
    'evaluations',
    'evaluation_campaigns'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('delete from public.%I', target_table);
      get diagnostics deleted_rows = row_count;

      insert into pg_temp.production_wipe_counts (phase, table_name, row_count)
      values ('deleted', target_table, deleted_rows);
    end if;
  end loop;

  audit_metadata := jsonb_build_object(
    'request_id', wipe_request_id,
    'script', 'supabase/sql/03_production_wipe_evaluation_data.sql',
    'reason', 'production_start_evaluation_data_wipe',
    'preserved', jsonb_build_array(
      'auth.users',
      'profiles',
      'user_roles',
      'role_permissions',
      'user_permissions',
      'custom_roles',
      'departments',
      'org_units',
      'manager_unit_assignments',
      'evaluation_templates',
      'evaluation_template_questions',
      'evaluation_questions',
      'messages',
      'audit_logs'
    ),
    'deleted_counts', (
      select coalesce(jsonb_object_agg(table_name, row_count), '{}'::jsonb)
      from pg_temp.production_wipe_counts
      where phase = 'deleted'
    )
  );

  if to_regclass('public.audit_logs') is not null then
    insert into public.audit_logs (actor_user_id, action, success, metadata)
    values (null, 'PRODUCTION_EVALUATION_DATA_WIPE', true, audit_metadata);
  end if;
end $$;

commit;

-- 4) POST-WIPE VERIFICATION
truncate table pg_temp.production_wipe_counts;

do $$
declare
  target_table text;
  target_count bigint;
begin
  foreach target_table in array array[
    'monthly_unit_scores',
    'monthly_department_scores',
    'monthly_employee_scores',
    'custom_evaluation_send_events',
    'anonymous_evaluation_drafts',
    'anonymous_evaluation_responses',
    'anonymous_evaluation_recipients',
    'anonymous_evaluation_secrets',
    'anonymous_evaluations',
    'evaluation_answers',
    'evaluation_drafts',
    'evaluations',
    'evaluation_campaigns'
  ] loop
    if to_regclass(format('public.%I', target_table)) is not null then
      execute format('select count(*) from public.%I', target_table) into target_count;
      insert into pg_temp.production_wipe_counts (phase, table_name, row_count)
      values ('after', target_table, target_count);
    end if;
  end loop;

  if to_regclass('public.notifications') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'related_evaluation_id'
    )
  then
    select count(*) into target_count
    from public.notifications
    where related_evaluation_id is not null;

    insert into pg_temp.production_wipe_counts (phase, table_name, row_count)
    values ('after', 'notifications.related_evaluation_id', target_count);
  end if;
end $$;

select phase, table_name, row_count, captured_at
from pg_temp.production_wipe_counts
where phase = 'after'
order by table_name;
