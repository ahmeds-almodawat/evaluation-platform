begin;

drop policy if exists evaluations_insert_by_permission on public.evaluations;

create policy evaluations_insert_by_permission
on public.evaluations
for insert
to authenticated
with check (
  public.has_permission('evaluations.send', auth.uid())
  or public.has_permission('evaluations.manage', auth.uid())
  or public.has_permission('evaluations.create', auth.uid())
  or public.has_permission('evaluations.custom.create', auth.uid())
);

commit;
