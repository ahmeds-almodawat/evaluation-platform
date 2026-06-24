-- Default Evaluation: keep exactly two scored questions.
-- Requested change: remove workload question and remove the optional text/comment question.
-- This migration is intentionally additive/overriding so old migrations stay in order.

begin;

do $$
declare
  v_tpl uuid;
  v_question_count int := 0;
begin
  select id into v_tpl
  from public.evaluation_templates
  where lower(name) = 'default evaluation'
  order by created_at asc
  limit 1;

  if v_tpl is null then
    return;
  end if;

  -- Keep the already-requested label #2 wording.
  update public.evaluation_templates
  set labels = jsonb_set(
        jsonb_set(coalesce(labels, '{}'::jsonb), '{2,en}', to_jsonb('Acceptable'::text), true),
        '{2,ar}', to_jsonb('مقبول'::text), true
      ),
      updated_at = now()
  where id = v_tpl;

  -- Remove every default question after the first two, including legacy workload/comment rows.
  delete from public.evaluation_template_questions
  where template_id = v_tpl
    and (
      sort_order > 2
      or lower(coalesce(text_en, '')) like '%workload%'
      or lower(coalesce(text_en, '')) like '%comment%'
      or coalesce(text_ar, '') like '%حجم العمل%'
      or coalesce(text_ar, '') like '%عبء العمل%'
      or coalesce(text_ar, '') like '%تعليق%'
    );

  -- Normalize the remaining first two questions as required scale questions.
  with ranked as (
    select id, row_number() over (order by sort_order, created_at, id) as rn
    from public.evaluation_template_questions
    where template_id = v_tpl
    order by sort_order, created_at, id
    limit 2
  )
  update public.evaluation_template_questions q
  set sort_order = ranked.rn,
      required = true,
      question_type = 'scale',
      max_chars = null,
      updated_at = now()
  from ranked
  where q.id = ranked.id;

  select count(*) into v_question_count
  from public.evaluation_template_questions
  where template_id = v_tpl;

  -- Update only non-completed default evaluation snapshots so pending evaluations also show two questions.
  if v_question_count >= 2 then
    update public.evaluations e
    set template_snapshot = jsonb_set(
          coalesce(e.template_snapshot, '{}'::jsonb),
          '{questions}',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', q.id,
                'sort_order', q.sort_order,
                'text_en', q.text_en,
                'text_ar', q.text_ar,
                'required', q.required,
                'question_type', coalesce(q.question_type, 'scale'),
                'max_chars', q.max_chars
              ) order by q.sort_order
            )
            from public.evaluation_template_questions q
            where q.template_id = v_tpl
          ), '[]'::jsonb),
          true
        ),
        workload_score = null,
        comment = null,
        updated_at = now()
    where e.status <> 'completed'
      and (
        e.template_id = v_tpl
        or e.template_snapshot->>'template_id' = v_tpl::text
        or lower(coalesce(e.template_snapshot->>'name', '')) = 'default evaluation'
      );
  end if;
end $$;

commit;
