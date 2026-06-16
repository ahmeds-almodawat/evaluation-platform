begin;

alter table public.evaluation_answers
  add column if not exists text_score text;

commit;
