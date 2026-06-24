begin;

alter table public.evaluation_answers enable row level security;

drop policy if exists evaluation_answers_insert_submitter on public.evaluation_answers;

create policy evaluation_answers_insert_submitter
on public.evaluation_answers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.evaluations e
    where e.id = evaluation_answers.evaluation_id
      and e.evaluator_id = auth.uid()
  )
);

commit;
