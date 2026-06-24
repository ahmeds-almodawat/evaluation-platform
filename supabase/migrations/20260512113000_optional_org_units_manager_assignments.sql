-- Optional Organizational Units / Stations + Manager Assignments
-- Purpose:
-- - Keep departments as the official reporting structure.
-- - Add optional units/stations/sections for large departments such as Nursing.
-- - Allow managers to supervise one unit, many units, or an entire department.
-- - Preserve existing departments and users; no employee is forced into a unit.

begin;

-- 1) Organizational units are optional children of departments.
create table if not exists public.org_units (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references public.departments(id) on delete cascade,
  parent_unit_id uuid null references public.org_units(id) on delete set null,
  name_en text not null,
  name_ar text not null,
  code text null,
  description text null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint org_units_name_en_not_blank check (btrim(name_en) <> ''),
  constraint org_units_name_ar_not_blank check (btrim(name_ar) <> '')
);

create unique index if not exists org_units_department_name_en_idx
  on public.org_units (department_id, lower(name_en));

create unique index if not exists org_units_department_name_ar_idx
  on public.org_units (department_id, lower(name_ar));

create index if not exists idx_org_units_department_active
  on public.org_units (department_id, is_active, sort_order, name_en);

-- 2) Profile unit/direct-manager fields are optional.
alter table public.profiles
  add column if not exists unit_id uuid null references public.org_units(id) on delete set null;

alter table public.profiles
  add column if not exists direct_manager_id uuid null references public.profiles(id) on delete set null;

create index if not exists idx_profiles_unit_id on public.profiles(unit_id);
create index if not exists idx_profiles_direct_manager_id on public.profiles(direct_manager_id);

-- 3) Manager assignments: unit scope or whole-department scope.
create table if not exists public.manager_unit_assignments (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  unit_id uuid null references public.org_units(id) on delete cascade,
  assignment_scope text not null default 'unit',
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint manager_assignment_scope_check check (assignment_scope in ('department', 'unit')),
  constraint manager_assignment_unit_required_check check (
    (assignment_scope = 'department' and unit_id is null)
    or (assignment_scope = 'unit' and unit_id is not null)
  )
);

create unique index if not exists manager_assignment_unit_unique_idx
  on public.manager_unit_assignments(manager_id, department_id, unit_id)
  where unit_id is not null;

create unique index if not exists manager_assignment_department_unique_idx
  on public.manager_unit_assignments(manager_id, department_id)
  where unit_id is null;

create index if not exists idx_manager_assignments_department
  on public.manager_unit_assignments(department_id, is_active);

create index if not exists idx_manager_assignments_unit
  on public.manager_unit_assignments(unit_id, is_active);

create index if not exists idx_manager_assignments_manager
  on public.manager_unit_assignments(manager_id, is_active);

-- 4) Evaluation metadata is optional and backward-compatible.
alter table public.evaluations
  add column if not exists evaluator_unit_id uuid null references public.org_units(id) on delete set null;

alter table public.evaluations
  add column if not exists evaluatee_unit_id uuid null references public.org_units(id) on delete set null;

alter table public.evaluations
  add column if not exists evaluation_scope text null;

alter table public.evaluations
  add column if not exists manager_assignment_id uuid null references public.manager_unit_assignments(id) on delete set null;

alter table public.evaluations
  drop constraint if exists evaluations_scope_check;

alter table public.evaluations
  add constraint evaluations_scope_check check (
    evaluation_scope is null
    or evaluation_scope in (
      'department_peer',
      'unit_peer',
      'manager_department',
      'manager_unit',
      'cross_department'
    )
  );

create index if not exists idx_evaluations_evaluatee_unit on public.evaluations(evaluatee_unit_id);
create index if not exists idx_evaluations_evaluator_unit on public.evaluations(evaluator_unit_id);
create index if not exists idx_evaluations_scope on public.evaluations(evaluation_scope);

-- 5) Updated-at triggers reuse the existing update_updated_at_column helper when available.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'update_updated_at_column') then
    if not exists (select 1 from pg_trigger where tgname = 'update_org_units_updated_at') then
      create trigger update_org_units_updated_at
      before update on public.org_units
      for each row execute function public.update_updated_at_column();
    end if;

    if not exists (select 1 from pg_trigger where tgname = 'update_manager_unit_assignments_updated_at') then
      create trigger update_manager_unit_assignments_updated_at
      before update on public.manager_unit_assignments
      for each row execute function public.update_updated_at_column();
    end if;
  end if;
end $$;

-- 6) Central helper for organization-structure management.
create or replace function public.can_manage_org_structure(p_user_id uuid default auth.uid())
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
begin
  if v_user_id is null then
    return false;
  end if;

  return public.is_admin_user(v_user_id)
    or public.has_permission('departments.manage', v_user_id)
    or public.has_permission('departments.manage_members', v_user_id);
end;
$$;

grant execute on function public.can_manage_org_structure(uuid) to authenticated, service_role;

-- 7) RLS for new structure tables.
alter table public.org_units enable row level security;
alter table public.manager_unit_assignments enable row level security;

drop policy if exists org_units_select_authenticated on public.org_units;
drop policy if exists org_units_insert_manager on public.org_units;
drop policy if exists org_units_update_manager on public.org_units;
drop policy if exists org_units_delete_manager on public.org_units;

create policy org_units_select_authenticated
on public.org_units
for select
to authenticated
using (true);

create policy org_units_insert_manager
on public.org_units
for insert
to authenticated
with check (public.can_manage_org_structure(auth.uid()));

create policy org_units_update_manager
on public.org_units
for update
to authenticated
using (public.can_manage_org_structure(auth.uid()))
with check (public.can_manage_org_structure(auth.uid()));

create policy org_units_delete_manager
on public.org_units
for delete
to authenticated
using (public.can_manage_org_structure(auth.uid()));

drop policy if exists manager_unit_assignments_select_authenticated on public.manager_unit_assignments;
drop policy if exists manager_unit_assignments_insert_manager on public.manager_unit_assignments;
drop policy if exists manager_unit_assignments_update_manager on public.manager_unit_assignments;
drop policy if exists manager_unit_assignments_delete_manager on public.manager_unit_assignments;

create policy manager_unit_assignments_select_authenticated
on public.manager_unit_assignments
for select
to authenticated
using (true);

create policy manager_unit_assignments_insert_manager
on public.manager_unit_assignments
for insert
to authenticated
with check (public.can_manage_org_structure(auth.uid()));

create policy manager_unit_assignments_update_manager
on public.manager_unit_assignments
for update
to authenticated
using (public.can_manage_org_structure(auth.uid()))
with check (public.can_manage_org_structure(auth.uid()));

create policy manager_unit_assignments_delete_manager
on public.manager_unit_assignments
for delete
to authenticated
using (public.can_manage_org_structure(auth.uid()));

commit;
