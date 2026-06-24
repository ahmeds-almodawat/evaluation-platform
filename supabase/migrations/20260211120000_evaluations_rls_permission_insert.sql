begin;

-- Make sure RLS is enabled (usually already enabled)
alter table public.evaluations enable row level security;

-- Allow inserting evaluations if user has permission (custom roles OR legacy fallback via has_permission)
-- Policies are OR-ed, so this won't break existing policies.
drop policy if exists evaluations_insert_by_permission on public.evaluations;

create policy evaluations_insert_by_permission
on public.evaluations
for insert
to authenticated
with check (
  public.has_permission('evaluations.manage', auth.uid())
  or public.has_permission('evaluations.custom.create', auth.uid())
  or public.has_permission('evaluations.create', auth.uid())
);

-- Optional (recommended): allow updating/deleting created evaluations by permission
drop policy if exists evaluations_update_by_permission on public.evaluations;

create policy evaluations_update_by_permission
on public.evaluations
for update
to authenticated
using (
  public.has_permission('evaluations.manage', auth.uid())
)
with check (
  public.has_permission('evaluations.manage', auth.uid())
);

drop policy if exists evaluations_delete_by_permission on public.evaluations;

create policy evaluations_delete_by_permission
on public.evaluations
for delete
to authenticated
using (
  public.has_permission('evaluations.manage', auth.uid())
);

commit;
