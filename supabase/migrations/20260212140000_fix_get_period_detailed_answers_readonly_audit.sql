begin;

create or replace function public.get_period_detailed_answers(
  p_evaluatee uuid,
  p_period text,
  p_requester uuid default auth.uid()
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
declare
  v_read_only text;
begin
  if p_requester is null then
    raise exception 'not_authorized';
  end if;

  if not public.has_permission('evaluations.rater_identity.view', p_requester) then
    raise exception 'not_authorized';
  end if;

  if not public.has_permission('evaluations.anonymous.reveal', p_requester) then
    raise exception 'not_authorized';
  end if;

  -- ✅ Guard: PostgREST executes STABLE functions in a read-only transaction.
  -- If read-only, do NOT try to insert audit logs (it will fail).
  v_read_only := current_setting('transaction_read_only', true);

  if coalesce(v_read_only, 'off') <> 'on' and auth.uid() is not null then
    perform public.log_audit_event(
      'EVAL_IDENTITY_REVEAL',
      p_evaluatee,
      p_period,
      null,
      jsonb_build_object('mode', 'full_detail_per_question')
    );
  end if;

  return query
  select
    e.id as evaluation_id,
    e.evaluator_id,
    pr.name_en,
    pr.name_ar,
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
  join public.profiles pr on pr.id = e.evaluator_id
  where e.evaluatee_id = p_evaluatee
    and e.period = p_period
  order by pr.name_en nulls last,
           coalesce(q.text_en, tq.text_en) nulls last,
           ea.created_at;

end;
$$;

commit;
