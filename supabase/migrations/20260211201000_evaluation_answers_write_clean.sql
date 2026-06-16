begin;

alter table public.evaluation_answers enable row level security;

-- Drop all existing write policies to remove conflicts
do $$
declare r record;
begin
  for r in
    select polname, polcmd
    from pg_policy
    where polrelid = 'public.evaluation_answers'::regclass
      and polcmd in ('a','w','d','*')
  loop
    execute format('drop policy if exists %I on public.evaluation_answers;', r.polname);
  end loop;
end$$;

-- INSERT: evaluator can insert answers for their own pending evaluation
create policy evaluation_answers_insert_own_pending
on public.evaluation_answers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.evaluations e
    where e.id = evaluation_answers.evaluation_id
      and e.evaluator_id = auth.uid()
      and e.status = 'pending'
  )
);

-- UPDATE: evaluator can update answers for their own pending evaluation
create policy evaluation_answers_update_own_pending
on public.evaluation_answers
for update
to authenticated
using (
  exists (
    select 1
    from public.evaluations e
    where e.id = evaluation_answers.evaluation_id
      and e.evaluator_id = auth.uid()
      and e.status = 'pending'
  )
)
with check (
  exists (
    select 1
    from public.evaluations e
    where e.id = evaluation_answers.evaluation_id
      and e.evaluator_id = auth.uid()
      and e.status = 'pending'
  )
);

-- DELETE: evaluator can delete answers only while pending (optional)
create policy evaluation_answers_delete_own_pending
on public.evaluation_answers
for delete
to authenticated
using (
  exists (
    select 1
    from public.evaluations e
    where e.id = evaluation_answers.evaluation_id
      and e.evaluator_id = auth.uid()
      and e.status = 'pending'
  )
);

commit;
