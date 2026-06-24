-- Enterprise polish bundle (Step 4)
-- Adds: Evaluation Cycles + Reminder RPC, Data Health duplicate detectors, Outliers/Anomalies report RPCs,
-- materialized views for faster reports, plus demo data generator + wipe scripts.
--
-- Run in Supabase SQL editor.

-----------------------------
-- 0) Safety / helpers
-----------------------------
create extension if not exists pgcrypto;

-----------------------------
-- 1) Data Health RPCs
-----------------------------
create or replace function public.rpc_data_health_duplicate_staff_ids(p_limit int default 25)
returns table(staff_id text, cnt bigint, example_names text)
language sql
security definer
set search_path = public
as $$
  select p.staff_id,
         count(*)::bigint as cnt,
         string_agg(coalesce(p.name_en, p.name_ar, '?'), ', ' order by coalesce(p.name_en, '')) as example_names
    from public.profiles p
   where p.staff_id is not null
     and length(trim(p.staff_id)) > 0
   group by p.staff_id
  having count(*) > 1
   order by count(*) desc, p.staff_id
   limit p_limit;
$$;

grant execute on function public.rpc_data_health_duplicate_staff_ids(int) to authenticated;

create or replace function public.rpc_data_health_duplicate_emails(p_limit int default 25)
returns table(email text, cnt bigint, example_names text)
language sql
security definer
set search_path = public
as $$
  select lower(p.email) as email,
         count(*)::bigint as cnt,
         string_agg(coalesce(p.name_en, p.name_ar, '?'), ', ' order by coalesce(p.name_en, '')) as example_names
    from public.profiles p
   where p.email is not null
     and length(trim(p.email)) > 0
   group by lower(p.email)
  having count(*) > 1
   order by count(*) desc, lower(p.email)
   limit p_limit;
$$;

grant execute on function public.rpc_data_health_duplicate_emails(int) to authenticated;

-----------------------------
-- 2) Evaluation Cycles + Reminders
-----------------------------
create table if not exists public.evaluation_cycles (
  id uuid primary key default gen_random_uuid(),
  period text not null unique, -- YYYY-MM
  status text not null default 'draft' check (status in ('draft','open','closed')),
  send_at timestamptz null,
  due_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'update_evaluation_cycles_updated_at') then
    create trigger update_evaluation_cycles_updated_at
      before update on public.evaluation_cycles
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

alter table public.evaluation_cycles enable row level security;

drop policy if exists "cycles_select_admin_super" on public.evaluation_cycles;
create policy "cycles_select_admin_super"
  on public.evaluation_cycles
  for select
  to authenticated
  using (public.is_admin_or_superuser() or public.has_permission(auth.uid(),'reports.view'));

drop policy if exists "cycles_mutate_admin_super" on public.evaluation_cycles;
create policy "cycles_mutate_admin_super"
  on public.evaluation_cycles
  for all
  to authenticated
  using (public.is_admin_or_superuser() or public.has_permission(auth.uid(),'evaluations.manage'))
  with check (public.is_admin_or_superuser() or public.has_permission(auth.uid(),'evaluations.manage'));

create or replace function public.rpc_cycles_list(p_limit int default 24)
returns table(id uuid, period text, status text, send_at timestamptz, due_at timestamptz, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.id, c.period, c.status, c.send_at, c.due_at, c.created_at
    from public.evaluation_cycles c
   order by c.period desc
   limit p_limit;
$$;

grant execute on function public.rpc_cycles_list(int) to authenticated;

create or replace function public.rpc_cycles_upsert(
  p_period text,
  p_send_at timestamptz default null,
  p_due_at timestamptz default null,
  p_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.is_admin_or_superuser() or public.has_permission(auth.uid(),'evaluations.manage')) then
    raise exception 'not_allowed';
  end if;

  insert into public.evaluation_cycles(period, send_at, due_at, status, created_by)
  values (p_period, p_send_at, p_due_at, coalesce(p_status,'draft'), auth.uid())
  on conflict (period) do update
    set send_at = coalesce(excluded.send_at, public.evaluation_cycles.send_at),
        due_at = coalesce(excluded.due_at, public.evaluation_cycles.due_at),
        status = coalesce(excluded.status, public.evaluation_cycles.status)
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.rpc_cycles_upsert(text, timestamptz, timestamptz, text) to authenticated;

create or replace function public.rpc_cycles_close(p_period text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.evaluation_cycles
     set status = 'closed'
   where period = p_period;
$$;

grant execute on function public.rpc_cycles_close(text) to authenticated;

create or replace function public.rpc_cycles_stats(p_period text)
returns table(total bigint, completed bigint, pending bigint)
language sql
security definer
set search_path = public
as $$
  with e as (
    select status
      from public.evaluations
     where period = p_period
  )
  select count(*)::bigint as total,
         count(*) filter (where status = 'completed')::bigint as completed,
         count(*) filter (where status <> 'completed')::bigint as pending
    from e;
$$;

grant execute on function public.rpc_cycles_stats(text) to authenticated;

-- Reminders are sent via the existing messages system (messages + message_recipients).
create or replace function public.rpc_cycles_send_reminders(
  p_period text,
  p_title text default null,
  p_body text default null
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_ids uuid[];
  v_title text;
  v_body text;
  v_count int;
begin
  if not (public.is_admin_or_superuser() or public.has_permission(auth.uid(),'evaluations.manage')) then
    raise exception 'not_allowed';
  end if;

  select array_agg(distinct evaluator_id)
    into v_user_ids
    from public.evaluations
   where period = p_period
     and status = 'pending'
     and evaluator_id is not null;

  v_count := coalesce(array_length(v_user_ids, 1), 0);
  if v_count = 0 then
    return 0;
  end if;

  v_title := coalesce(p_title, 'Evaluation reminder');
  v_body := coalesce(p_body, 'You have pending evaluations. Please complete them.');

  perform public.send_broadcast_message(
    v_title,
    v_body,
    null,
    null,
    v_user_ids
  );

  return v_count;
end;
$$;

grant execute on function public.rpc_cycles_send_reminders(text, text, text) to authenticated;

-----------------------------
-- 3) Reports cache (Materialized view) + Outliers / Anomalies RPCs
-----------------------------

-- Per-evaluation avg score (supports both old score columns and per-question answers).
create or replace view public.v_completed_evaluation_scores as
select
  e.id as evaluation_id,
  e.period,
  e.evaluatee_id,
  e.evaluator_id,
  -- Prefer per-question answers when available
  coalesce(
    (select avg(a.value)::numeric from public.evaluation_answers a where a.evaluation_id = e.id),
    (
      (
        case when e.performance_score > 0 then e.performance_score else null end
        + case when e.teamwork_score > 0 then e.teamwork_score else null end
        + case when e.workload_score is not null and e.workload_score > 0 then e.workload_score else null end
      )::numeric
      / nullif(
        (case when e.performance_score > 0 then 1 else 0 end)
        + (case when e.teamwork_score > 0 then 1 else 0 end)
        + (case when e.workload_score is not null and e.workload_score > 0 then 1 else 0 end)
      , 0)
    )
  ) as avg_score
from public.evaluations e
where e.status = 'completed';

create materialized view if not exists public.mv_user_month_scores as
select
  s.period as month_key,
  s.evaluatee_id as user_id,
  avg(s.avg_score) as avg_score,
  count(*)::int as n
from public.v_completed_evaluation_scores s
group by s.period, s.evaluatee_id;

create index if not exists idx_mv_user_month_scores_user_month on public.mv_user_month_scores(user_id, month_key);
create index if not exists idx_mv_user_month_scores_month on public.mv_user_month_scores(month_key);

create or replace function public.rpc_reports_refresh_cache()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.is_admin_or_superuser() or public.has_permission(auth.uid(),'reports.export')) then
    raise exception 'not_allowed';
  end if;
  refresh materialized view concurrently public.mv_user_month_scores;
end;
$$;

grant execute on function public.rpc_reports_refresh_cache() to authenticated;

create or replace view public.v_latest_user_scores as
select distinct on (user_id)
  user_id,
  month_key,
  avg_score,
  n
from public.mv_user_month_scores
order by user_id, month_key desc;

-- Outliers: users with sudden drop compared to previous month
create or replace function public.rpc_reports_outliers(
  p_month_key text,
  p_min_n int default 3,
  p_limit int default 50
)
returns table(
  month_key text,
  evaluatee_id uuid,
  avg_score numeric,
  prev_avg numeric,
  delta numeric,
  n int
)
language sql
security definer
set search_path = public
as $$
  with m as (
    select user_id, month_key, avg_score, n,
           lag(avg_score) over (partition by user_id order by month_key) as prev_avg
      from public.mv_user_month_scores
  )
  select m.month_key,
         m.user_id as evaluatee_id,
         m.avg_score,
         m.prev_avg,
         (m.avg_score - m.prev_avg) as delta,
         m.n
    from m
   where m.month_key = p_month_key
     and m.n >= p_min_n
     and m.prev_avg is not null
     and (m.avg_score - m.prev_avg) <= -0.75
   order by (m.avg_score - m.prev_avg) asc
   limit p_limit;
$$;

grant execute on function public.rpc_reports_outliers(text, int, int) to authenticated;

-- Anomalous raters: very low/high averages (simple heuristic)
create or replace function public.rpc_reports_rater_anomalies(
  p_month_key text,
  p_min_n int default 5,
  p_limit int default 50
)
returns table(
  month_key text,
  evaluator_id uuid,
  avg_score numeric,
  n int,
  note text
)
language sql
security definer
set search_path = public
as $$
  with e as (
    select s.period as month_key,
           s.evaluator_id,
           avg(s.avg_score) as avg_score,
           count(*)::int as n
      from public.v_completed_evaluation_scores s
     where s.period = p_month_key
       and s.evaluator_id is not null
     group by s.period, s.evaluator_id
  )
  select e.month_key,
         e.evaluator_id,
         e.avg_score,
         e.n,
         case
           when e.avg_score <= 1.8 then 'Very low average'
           when e.avg_score >= 4.2 then 'Very high average'
           else 'Out of expected range'
         end as note
    from e
   where e.n >= p_min_n
     and (e.avg_score <= 1.8 or e.avg_score >= 4.2)
   order by e.n desc, e.avg_score asc
   limit p_limit;
$$;

grant execute on function public.rpc_reports_rater_anomalies(text, int, int) to authenticated;

-----------------------------
-- 4) Demo data generator (creates completed evaluations + answers)
-----------------------------
-- IMPORTANT: run in a test project only.
-- Generates random completed evaluations for the last N months.

create or replace function public.rpc_generate_demo_evaluations(
  p_months int default 6,
  p_pairs_per_user int default 3
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  u_ids uuid[];
  months text[];
  m text;
  eval_count int := 0;
  i int;
  j int;
  evaluator uuid;
  evaluatee uuid;
  eid uuid;
  tmpl uuid;
begin
  if not public.is_admin_or_superuser() then
    raise exception 'not_allowed';
  end if;

  select array_agg(id) into u_ids from public.profiles;
  if coalesce(array_length(u_ids,1),0) < 4 then
    raise exception 'Need at least 4 users in profiles to generate demo evaluations';
  end if;

  -- Pick any published template if exists (optional)
  select id into tmpl from public.evaluation_templates where status = 'published' order by created_at desc limit 1;

  -- Months: last p_months including current month key
  months := array(select to_char(date_trunc('month', now()) - (n || ' months')::interval, 'YYYY-MM') from generate_series(0, greatest(p_months-1,0)) as n);

  foreach m in array months loop
    for i in 1..coalesce(array_length(u_ids,1),0) loop
      evaluatee := u_ids[i];
      for j in 1..p_pairs_per_user loop
        -- Random evaluator not equal to evaluatee
        evaluator := u_ids[1 + floor(random() * (array_length(u_ids,1)-1))::int];
        if evaluator = evaluatee then
          evaluator := u_ids[case when i = 1 then 2 else 1 end];
        end if;

        insert into public.evaluations(
          evaluator_id,
          evaluatee_id,
          period,
          status,
          performance_score,
          teamwork_score,
          workload_score,
          template_id
        ) values (
          evaluator,
          evaluatee,
          m,
          'completed',
          (1 + floor(random()*4))::int,
          (1 + floor(random()*4))::int,
          (1 + floor(random()*4))::int,
          tmpl
        ) returning id into eid;

        -- Optional per-question answers (if default template questions exist)
        insert into public.evaluation_answers(evaluation_id, question_id, score)
        select eid, q.id, (1 + floor(random()*4))::int
          from public.evaluation_template_questions q
         where tmpl is not null and q.template_id = tmpl
         on conflict do nothing;

        eval_count := eval_count + 1;
      end loop;
    end loop;
  end loop;

  -- Refresh cache for reports
  begin
    refresh materialized view concurrently public.mv_user_month_scores;
  exception when others then
    -- If concurrent refresh not possible (no unique index etc), fallback
    refresh materialized view public.mv_user_month_scores;
  end;

  return eval_count;
end;
$$;

grant execute on function public.rpc_generate_demo_evaluations(int, int) to authenticated;

-----------------------------
-- 5) Wipe scripts (choose ONE)
-----------------------------
-- Option A: wipe only evaluation data (recommended before pilot)
-- TRUNCATE keeps users/departments/roles.
--
-- begin;
-- truncate table
--   public.evaluation_answers,
--   public.evaluations
-- restart identity cascade;
-- refresh materialized view public.mv_user_month_scores;
-- commit;
--
-- Option B: wipe evaluations + messages/notifications/audit logs (keep users)
--
-- begin;
-- truncate table
--   public.message_recipients,
--   public.messages,
--   public.notifications,
--   public.audit_logs,
--   public.evaluation_answers,
--   public.evaluations
-- restart identity cascade;
-- refresh materialized view public.mv_user_month_scores;
-- commit;
