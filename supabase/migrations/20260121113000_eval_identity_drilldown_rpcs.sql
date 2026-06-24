-- Evaluation identity & breakdown permissions (period-based)
-- Adds audit_events table + secure RPCs used by EmployeeReport drill-down.
begin;

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  target_user_id uuid null,
  period text null,
  evaluation_id uuid null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists audit_events_actor_idx on public.audit_events(actor_user_id, created_at desc);
create index if not exists audit_events_target_idx on public.audit_events(target_user_id, created_at desc);

alter table public.audit_events enable row level security;

drop policy if exists audit_events_read on public.audit_events;
create policy audit_events_read
on public.audit_events
for select
to authenticated
using (public.has_permission(auth.uid(), 'audit.read'));

drop policy if exists audit_events_insert_block on public.audit_events;
create policy audit_events_insert_block
on public.audit_events
for insert
to authenticated
with check (false);

create or replace function public.log_audit_event(
  p_event_type text,
  p_target_user uuid default null,
  p_period text default null,
  p_evaluation_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events(actor_user_id, event_type, target_user_id, period, evaluation_id, metadata)
  values (auth.uid(), p_event_type, p_target_user, p_period, p_evaluation_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;

-- 1) Period list for a user (avg of evaluator averages)
create or replace function public.get_user_period_scores(
  p_evaluatee uuid
)
returns table (
  period text,
  avg_score numeric,
  evaluations_count int
)
language sql
stable
security definer
set search_path = public
as $$
  with eval_avg as (
    select
      e.id as evaluation_id,
      e.period,
      avg(ea.score::numeric) as eval_score
    from public.evaluations e
    join public.evaluation_answers ea on ea.evaluation_id = e.id
    where e.evaluatee_id = p_evaluatee
    group by e.id, e.period
  )
  select
    period,
    avg(eval_score)::numeric(10,2) as avg_score,
    count(*)::int as evaluations_count
  from eval_avg
  group by period
  order by period;
$$;

-- 2) Period breakdown (anonymous)
create or replace function public.get_period_score_breakdown(
  p_evaluatee uuid,
  p_period text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'evaluations.score_breakdown.view') then
    raise exception 'not_authorized';
  end if;

  return (
    with eval_avg as (
      select
        e.id as evaluation_id,
        avg(ea.score::numeric) as eval_score
      from public.evaluations e
      join public.evaluation_answers ea on ea.evaluation_id = e.id
      where e.evaluatee_id = p_evaluatee
        and e.period = p_period
      group by e.id
    )
    select jsonb_build_object(
      'period', p_period,
      'evaluations_count', count(*),
      'average', avg(eval_score),
      'min', min(eval_score),
      'max', max(eval_score)
    )
    from eval_avg
  );
end;
$$;

-- 3) Per-question aggregates (redacted)
create or replace function public.get_period_question_aggregates(
  p_evaluatee uuid,
  p_period text
)
returns table (
  question_id uuid,
  question_text_en text,
  question_text_ar text,
  avg_value numeric,
  count_answers int
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'evaluations.score_breakdown.view') then
    raise exception 'not_authorized';
  end if;

  return query
  select
    q.id,
    q.text_en,
    q.text_ar,
    avg(ea.score::numeric)::numeric(10,2) as avg_value,
    count(*)::int as count_answers
  from public.evaluations e
  join public.evaluation_answers ea on ea.evaluation_id = e.id
  join public.evaluation_questions q on q.id = ea.question_id
  where e.evaluatee_id = p_evaluatee
    and e.period = p_period
  group by q.id, q.text_en, q.text_ar
  order by q.sort_order nulls last, q.text_en;
end;
$$;

-- 4) Full detail (identities + per-question answers) + audit log
create or replace function public.get_period_detailed_answers(
  p_evaluatee uuid,
  p_period text
)
returns table (
  evaluation_id uuid,
  evaluator_id uuid,
  evaluator_name_en text,
  evaluator_name_ar text,
  question_id uuid,
  question_text_en text,
  question_text_ar text,
  value numeric,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), 'evaluations.rater_identity.view') then
    raise exception 'not_authorized';
  end if;

  if not public.has_permission(auth.uid(), 'evaluations.anonymous.reveal') then
    raise exception 'not_authorized';
  end if;

  perform public.log_audit_event(
    'EVAL_IDENTITY_REVEAL',
    p_evaluatee,
    p_period,
    null,
    jsonb_build_object('mode', 'full_detail_per_question')
  );

  return query
  select
    e.id as evaluation_id,
    e.evaluator_id,
    p.name_en,
    p.name_ar,
    q.id,
    q.text_en,
    q.text_ar,
    ea.score::numeric,
    ea.created_at
  from public.evaluations e
  join public.evaluation_answers ea on ea.evaluation_id = e.id
  join public.evaluation_questions q on q.id = ea.question_id
  join public.profiles p on p.id = e.evaluator_id
  where e.evaluatee_id = p_evaluatee
    and e.period = p_period
  order by p.name_en nulls last, q.sort_order nulls last, ea.created_at;

end;
$$;

commit;
