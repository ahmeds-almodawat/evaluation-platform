-- Scheduled Jobs SQL bundle
-- Creates system_* RPCs intended to be called from Edge Function using SERVICE ROLE.

begin;

-- 1) Add metadata column to messages for idempotency/deduping (safe)
do $$
begin
  if to_regclass('public.messages') is not null then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'messages'
        and column_name = 'metadata'
    ) then
      alter table public.messages add column metadata jsonb;
    end if;
  end if;
end $$;

-- 2) System message helper (bypasses auth.uid())
create or replace function public.system_send_message_to_users(
  p_title text,
  p_body text,
  p_user_ids uuid[],
  p_metadata jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_message_id uuid;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    raise exception 'No recipients';
  end if;

  if to_regclass('public.messages') is null or to_regclass('public.message_recipients') is null then
    raise exception 'Messages system not installed';
  end if;

  insert into public.messages(message_type, title, body, sender_id, sender_anonymous, metadata)
  values ('broadcast', p_title, p_body, null, true, p_metadata)
  returning id into v_message_id;

  insert into public.message_recipients(message_id, recipient_id)
  select v_message_id, u from unnest(p_user_ids) u;

  return v_message_id;
end;
$$;

-- 3) Scheduled reminders:
--    - If evaluation_cycles exists: sends reminders for OPEN cycles (status='open') and due_date not passed
--    - Else: sends reminders for current month (YYYY-MM)
--    - Reminds evaluators who have pending evaluations (status != 'completed') for that period
--    - Dedupes within last 12 hours per period (via messages.metadata)
create or replace function public.system_send_cycle_reminders()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periods text[];
  v_period text;
  v_now timestamptz := now();
  v_title text;
  v_body text;
  v_sent_total int := 0;
  v_recips uuid[];
  v_count int;
  v_message_id uuid;
begin
  if to_regclass('public.evaluations') is null then
    raise exception 'evaluations table not found';
  end if;

  -- Determine target periods
  if to_regclass('public.evaluation_cycles') is not null then
    select array_agg(c.period order by c.period)
      into v_periods
    from public.evaluation_cycles c
    where coalesce(c.status, 'open') = 'open'
      and (c.due_date is null or c.due_date::timestamptz >= v_now);
  end if;

  if v_periods is null or array_length(v_periods, 1) is null then
    v_periods := array[to_char(date_trunc('month', v_now)::date, 'YYYY-MM')];
  end if;

  foreach v_period in array v_periods loop
    -- Deduping
    if to_regclass('public.messages') is not null then
      if exists (
        select 1
        from public.messages m
        where m.metadata->>'job' = 'cycle_reminder'
          and m.metadata->>'period' = v_period
          and m.created_at >= (v_now - interval '12 hours')
      ) then
        continue;
      end if;
    end if;

    -- Recipients: evaluators with pending evaluations in this period
    select array_agg(distinct e.evaluator_id)
      into v_recips
    from public.evaluations e
    where e.evaluator_id is not null
      and coalesce(e.status, '') <> 'completed'
      and coalesce(e.period, to_char(date_trunc('month', e.created_at)::date, 'YYYY-MM')) = v_period;

    if v_recips is null or array_length(v_recips, 1) is null then
      continue;
    end if;

    v_title := 'Evaluation reminder / تذكير تقييم';
    v_body :=
      'You have pending evaluations for period ' || v_period ||
      '. Please complete them as soon as possible.' ||
      E'\n\n' ||
      'لديك تقييمات معلّقة لفترة ' || v_period ||
      '. الرجاء إكمالها في أقرب وقت.';

    v_message_id := public.system_send_message_to_users(
      v_title,
      v_body,
      v_recips,
      jsonb_build_object('job', 'cycle_reminder', 'period', v_period)
    );

    v_count := array_length(v_recips, 1);
    v_sent_total := v_sent_total + coalesce(v_count, 0);
  end loop;

  return jsonb_build_object('ok', true, 'sent', v_sent_total);
end;
$$;

-- 4) Refresh reporting cache (materialized views)
create or replace function public.system_refresh_reporting_cache()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refreshed text[] := '{}';
begin
  if to_regclass('public.mv_cross_dept_matrix_monthly') is not null then
    begin
      execute 'refresh materialized view concurrently public.mv_cross_dept_matrix_monthly';
      v_refreshed := array_append(v_refreshed, 'mv_cross_dept_matrix_monthly');
    exception when others then
      execute 'refresh materialized view public.mv_cross_dept_matrix_monthly';
      v_refreshed := array_append(v_refreshed, 'mv_cross_dept_matrix_monthly(nonconcurrent)');
    end;
  end if;

  return jsonb_build_object('ok', true, 'refreshed', v_refreshed);
end;
$$;

-- Allow SERVICE ROLE (Edge Functions) to call these
grant execute on function public.system_send_message_to_users(text,text,uuid[],jsonb) to service_role;
grant execute on function public.system_send_cycle_reminders() to service_role;
grant execute on function public.system_refresh_reporting_cache() to service_role;

commit;
