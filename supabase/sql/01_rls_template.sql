-- RLS TEMPLATE (review before running)
-- This file is a reference snapshot of the intended RLS for the core tables.
-- In this project, the authoritative version is in:
--   supabase/migrations/20251224213000_finalize_rls_profiles_departments_evaluations.sql

-- -----------------------------------------------------------------------------
-- Helper: safely read a user's department_id (bypasses RLS)
-- -----------------------------------------------------------------------------
create or replace function public.get_user_department_id(_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select department_id
  from public.profiles
  where id = _user_id
  limit 1;
$$;

revoke all on function public.get_user_department_id(uuid) from public;
grant execute on function public.get_user_department_id(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- departments
-- -----------------------------------------------------------------------------
alter table public.departments enable row level security;

create policy "departments_select_authenticated" on public.departments
for select to authenticated
using (true);

create policy "departments_insert_admin_or_super_user" on public.departments
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

create policy "departments_update_admin_or_super_user" on public.departments
for update to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
)
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

create policy "departments_delete_admin_or_super_user" on public.departments
for delete to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Read:
-- - self
-- - same-department colleagues
-- - evaluator/evaluatee relationship (needed for cross-department evaluation UX)
-- - privileged roles: admin/super_user/audit
create policy "profiles_select_self_dept_related_or_privileged" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
  or public.has_role(auth.uid(), 'audit')
  or department_id = public.get_user_department_id(auth.uid())
  or exists (
    select 1 from public.evaluations e
    where e.evaluator_id = auth.uid()
      and e.evaluatee_id = profiles.id
  )
  or exists (
    select 1 from public.evaluations e
    where e.evaluatee_id = auth.uid()
      and e.evaluator_id = profiles.id
  )
);

-- Insert: normally handled by trigger; allow admin/super_user for backfills
create policy "profiles_insert_admin_or_super_user" on public.profiles
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

-- Update (self): allow updating own profile but block department_id changes
create policy "profiles_update_self_no_department_change" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and department_id = public.get_user_department_id(auth.uid())
);

-- Update (admin): any profile
create policy "profiles_update_admin" on public.profiles
for update to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Update (super_user): any NON-admin profile
create policy "profiles_update_super_user_non_admin_target" on public.profiles
for update to authenticated
using (
  public.has_role(auth.uid(), 'super_user')
  and not public.has_role(id, 'admin')
)
with check (
  public.has_role(auth.uid(), 'super_user')
  and not public.has_role(id, 'admin')
);


-- -----------------------------------------------------------------------------
-- evaluations
-- -----------------------------------------------------------------------------
alter table public.evaluations enable row level security;

create policy "evaluations_select_own_or_privileged" on public.evaluations
for select to authenticated
using (
  evaluator_id = auth.uid()
  or evaluatee_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
  or public.has_role(auth.uid(), 'audit')
);

-- Insert: only admin/super_user create evaluation requests
create policy "evaluations_insert_admin_or_super_user" on public.evaluations
for insert to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

-- Update: evaluator can update only their pending evaluations; privileged can update any
create policy "evaluations_update_evaluator_pending" on public.evaluations
for update to authenticated
using (
  evaluator_id = auth.uid()
  and status = 'pending'
)
with check (
  evaluator_id = auth.uid()
);

create policy "evaluations_update_admin_or_super_user" on public.evaluations
for update to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
)
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

-- Delete: deny by default (no policy)
