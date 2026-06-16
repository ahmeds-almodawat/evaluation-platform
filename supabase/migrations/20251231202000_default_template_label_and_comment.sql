-- Default template tweaks (requested):
-- 1) Option #2 label: EN "Acceptable", AR "مقبول"
-- 2) Replace question #3 with optional text comment (max 200 chars)

begin;

do $$
declare
  v_tpl uuid;
begin
  select id into v_tpl
  from public.evaluation_templates
  where lower(name) = 'default evaluation'
  order by created_at asc
  limit 1;

  if v_tpl is null then
    -- If the seeded template name differs, do nothing safely.
    return;
  end if;

  -- Update label #2 in the stored labels jsonb
  update public.evaluation_templates
  set labels = jsonb_set(
        jsonb_set(labels, '{2,en}', to_jsonb('Acceptable'::text), true),
        '{2,ar}', to_jsonb('مقبول'::text), true
      ),
      updated_at = now()
  where id = v_tpl;

  -- Update question #3 to be optional text comment
  update public.evaluation_template_questions
  set question_type = 'text',
      max_chars = 200,
      required = false,
      text_en = 'Add comment (optional)',
      text_ar = 'اضف تعليق اختياري',
      updated_at = now()
  where template_id = v_tpl
    and sort_order = 3;
end $$;

commit;
