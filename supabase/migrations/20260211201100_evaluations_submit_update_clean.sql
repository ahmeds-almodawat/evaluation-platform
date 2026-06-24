begin;

drop policy if exists evaluations_update_evaluator_pending on public.evaluations;

create policy evaluations_update_evaluator_pending
on public.evaluations
for update
to authenticated
using (
  evaluator_id = auth.uid()
  and status = 'pending'
)
with check (
  evaluator_id = auth.uid()
);

commit;
