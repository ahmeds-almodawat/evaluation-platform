begin;

alter table public.evaluation_questions
  add column if not exists answer_type text not null default 'choices',
  add column if not exists scale_max integer,
  add column if not exists max_chars integer;

-- For choices questions, keep scale_max (example default 4)
update public.evaluation_questions
set scale_max = coalesce(scale_max, 4)
where answer_type = 'choices'
  and scale_max is null;

commit;
