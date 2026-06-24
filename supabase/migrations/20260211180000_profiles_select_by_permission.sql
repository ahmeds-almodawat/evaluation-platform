begin;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
drop policy if exists profiles_select_by_permission on public.profiles;

create policy profiles_select_by_permission
on public.profiles
for select
to authenticated
using (
  -- user can always read their own profile
  id = auth.uid()
  -- or anyone with employee viewing permission
  or public.has_permission('employees.read', auth.uid())
  or public.has_permission('employees.manage', auth.uid())
  -- legacy fallback (optional)
  or public.has_role(auth.uid(), 'admin'::public.app_role)
  or public.has_role(auth.uid(), 'super_user'::public.app_role)
);

commit;
