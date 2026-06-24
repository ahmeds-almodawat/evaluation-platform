begin;

alter table public.evaluation_drafts enable row level security;

drop policy if exists evaluation_drafts_insert_by_permission on public.evaluation_drafts;

create policy evaluation_drafts_insert_by_permission
on public.evaluation_drafts
for insert
to authenticated
with check (
  public.has_permission('evaluations.send', auth.uid())
  or public.has_permission('evaluations.manage', auth.uid())
  or public.has_permission('evaluations.create', auth.uid())
);

commit;
