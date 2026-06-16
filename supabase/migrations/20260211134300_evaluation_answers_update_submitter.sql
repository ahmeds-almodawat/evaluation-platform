begin;

drop policy if exists evaluation_answers_update_submitter on public.evaluation_answers;

create policy evaluation_answers_update_submitter
on public.evaluation_answers
for update
to authenticated
using (
  exists (
    select 1
    from public.evaluations e
    where e.id = evaluation_answers.evaluation_id
      and e.evaluator_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.evaluations e
    where e.id = evaluation_answers.evaluation_id
      and e.evaluator_id = auth.uid()
  )
);

commit;
