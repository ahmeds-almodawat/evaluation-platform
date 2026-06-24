begin;

-- 1) Fix per-question aggregates to support template_snapshot question IDs
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
  if not public.has_permission('evaluations.score_breakdown.view', auth.uid()) then
    raise exception 'not_authorized';
  end if;

  return query
  select
    ea.question_id,
    coalesce(q.text_en, tq.text_en) as question_text_en,
    coalesce(q.text_ar, tq.text_ar) as question_text_ar,
    avg(ea.score::numeric)::numeric(10,2) as avg_value,
    count(*)::int as count_answers
  from public.evaluations e
  join public.evaluation_answers ea on ea.evaluation_id = e.id
  left join public.evaluation_questions q on q.id = ea.question_id
  left join lateral (
    select
      (x->>'text_en') as text_en,
      (x->>'text_ar') as text_ar
    from jsonb_array_elements(coalesce(e.template_snapshot->'questions','[]'::jsonb)) x
    where (x->>'id') is not null
      and (x->>'id')::uuid = ea.question_id
    limit 1
  ) tq on true
  where e.evaluatee_id = p_evaluatee
    and e.period = p_period
  group by ea.question_id, q.text_en, q.text_ar, tq.text_en, tq.text_ar
  order by coalesce(q.text_en, tq.text_en) nulls last;

end;
$$;

-- 2) Fix rater identities + detailed answers to support template_snapshot question IDs
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
  if not public.has_permission('evaluations.rater_identity.view', auth.uid()) then
    raise exception 'not_authorized';
  end if;

  if not public.has_permission('evaluations.anonymous.reveal', auth.uid()) then
    raise exception 'not_authorized';
  end if;

  -- audit log (keeps your security model)
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
    ea.question_id,
    coalesce(q.text_en, tq.text_en) as question_text_en,
    coalesce(q.text_ar, tq.text_ar) as question_text_ar,
    ea.score::numeric as value,
    ea.created_at
  from public.evaluations e
  join public.evaluation_answers ea on ea.evaluation_id = e.id
  left join public.evaluation_questions q on q.id = ea.question_id
  left join lateral (
    select
      (x->>'text_en') as text_en,
      (x->>'text_ar') as text_ar
    from jsonb_array_elements(coalesce(e.template_snapshot->'questions','[]'::jsonb)) x
    where (x->>'id') is not null
      and (x->>'id')::uuid = ea.question_id
    limit 1
  ) tq on true
  join public.profiles p on p.id = e.evaluator_id
  where e.evaluatee_id = p_evaluatee
    and e.period = p_period
  order by p.name_en nulls last, coalesce(q.text_en, tq.text_en) nulls last, ea.created_at;

end;
$$;

commit;
