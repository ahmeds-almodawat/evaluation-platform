begin;

alter table public.departments enable row level security;

drop policy if exists departments_select_by_permission on public.departments;

create policy departments_select_by_permission
on public.departments
for select
to authenticated
using (
  public.has_permission('departments.read', auth.uid())
  or public.has_permission('employees.manage', auth.uid())
  or public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'super_user'::public.app_role)
);

commit;
