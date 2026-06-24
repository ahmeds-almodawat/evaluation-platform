-- Finalize RLS policies for core tables: profiles, departments, evaluations
--
-- Goals (aligned with SECURITY_MATRIX.md):
-- - admin: full access
-- - super_user: operational admin (manage users/departments/evaluations) but NOT create/assign admin users
-- - audit: read-only access to dashboards/reports/exports
-- - user: can view their own data and complete assigned evaluations
--
-- Key fixes:
-- 1) profiles: allow users to see profiles needed to complete evaluations (cross-department evaluatees)
-- 2) profiles: prevent self-service department changes (department_id is privileged)
-- 3) evaluations: only admin/super_user can CREATE evaluation requests
-- 4) evaluations: evaluators can UPDATE only their pending evaluations; admin/super_user can update any
-- 5) departments: all authenticated can read; only admin/super_user can write

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

-- Drop ALL existing policies on departments (idempotent)
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'departments'
  loop
    execute format('drop policy if exists %I on public.departments;', p.policyname);
  end loop;
end $$;

-- Read: all authenticated users
create policy "departments_select_authenticated"
on public.departments
for select
to authenticated
using (true);

-- Write: admin/super_user only
create policy "departments_insert_admin_or_super_user"
on public.departments
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

create policy "departments_update_admin_or_super_user"
on public.departments
for update
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
)
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

create policy "departments_delete_admin_or_super_user"
on public.departments
for delete
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);


-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Drop ALL existing policies on profiles (idempotent)
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles;', p.policyname);
  end loop;
end $$;

-- Read:
-- - self
-- - same-department colleagues
-- - profiles required for completing evaluations (evaluator/evaluatee relationship)
-- - privileged roles: admin/super_user/audit
create policy "profiles_select_self_dept_related_or_privileged"
on public.profiles
for select
to authenticated
using (
  -- Self
  id = auth.uid()
  -- Privileged roles (employees page / reports)
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
  or public.has_role(auth.uid(), 'audit')
  -- Same department
  or department_id = public.get_user_department_id(auth.uid())
  -- Evaluator can see evaluatee profile (needed for cross-department evaluations)
  or exists (
    select 1
    from public.evaluations e
    where e.evaluator_id = auth.uid()
      and e.evaluatee_id = profiles.id
  )
  -- Evaluatee can see evaluator profile (optional but helpful for transparency)
  or exists (
    select 1
    from public.evaluations e
    where e.evaluatee_id = auth.uid()
      and e.evaluator_id = profiles.id
  )
);

-- Insert:
-- normally handled by handle_new_user() trigger, but allow admin/super_user for backfills
create policy "profiles_insert_admin_or_super_user"
on public.profiles
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

-- Update (self): allow users to update their own profile BUT do not allow changing department_id
create policy "profiles_update_self_no_department_change"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and department_id = public.get_user_department_id(auth.uid())
);

-- Update (admin): any profile
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

-- Update (super_user): any NON-admin profile
create policy "profiles_update_super_user_non_admin_target"
on public.profiles
for update
to authenticated
using (
  public.has_role(auth.uid(), 'super_user')
  and not public.has_role(id, 'admin')
)
with check (
  public.has_role(auth.uid(), 'super_user')
  and not public.has_role(id, 'admin')
);

-- Delete: deny by default (no policy). User deletion is handled via Edge Function + auth admin.


-- -----------------------------------------------------------------------------
-- evaluations
-- -----------------------------------------------------------------------------
alter table public.evaluations enable row level security;

-- Drop ALL existing policies on evaluations (idempotent)
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'evaluations'
  loop
    execute format('drop policy if exists %I on public.evaluations;', p.policyname);
  end loop;
end $$;

-- Read:
-- - evaluator or evaluatee can read
-- - admin/super_user/audit can read all (reports/dashboards)
create policy "evaluations_select_own_or_privileged"
on public.evaluations
for select
to authenticated
using (
  evaluator_id = auth.uid()
  or evaluatee_id = auth.uid()
  or public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
  or public.has_role(auth.uid(), 'audit')
);

-- Insert:
-- Only admin/super_user may CREATE evaluation requests.
-- (End-users should only complete evaluations assigned to them via UPDATE.)
create policy "evaluations_insert_admin_or_super_user"
on public.evaluations
for insert
to authenticated
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

-- Update: evaluator can update their own pending evaluation; admin/super_user can update any
create policy "evaluations_update_evaluator_pending"
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

create policy "evaluations_update_admin_or_super_user"
on public.evaluations
for update
to authenticated
using (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
)
with check (
  public.has_role(auth.uid(), 'admin')
  or public.has_role(auth.uid(), 'super_user')
);

-- Delete: deny by default (no policy). Keep evaluation history for auditability.
