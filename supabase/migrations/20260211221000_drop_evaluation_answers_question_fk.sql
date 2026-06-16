begin;

-- Drop FK if present. This FK currently points to public.evaluation_questions and blocks
-- template-based evaluations where question_id comes from template_snapshot questions.
alter table public.evaluation_answers
  drop constraint if exists evaluation_answers_question_id_fkey;

commit;
