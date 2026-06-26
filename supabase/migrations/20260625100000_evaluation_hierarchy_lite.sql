-- Supervisor/Manager Evaluation Hierarchy Lite
--
-- Purpose:
--   Separate "evaluation hierarchy" (employee / supervisor / manager) from the
--   platform access role (admin / super_user / audit / user). A supervisor or
--   manager in the evaluation sense can still hold system role = "user".
--
-- Design notes:
--   * `profiles.evaluation_level` is a CLASSIFICATION FIELD ONLY.
--     It does NOT grant any permission and does NOT drive RLS. System access
--     continues to come entirely from `user_roles.role` / custom RBAC.
--   * The structural manager/supervisor data already lives in
--     `manager_unit_assignments` (assignment_scope = 'unit' = station supervisor,
--     'department' = department manager). This migration only adds the label
--     column on profiles + one new campaign type for "Manager -> Supervisors".
--   * Fully additive and idempotent. No destructive changes. All existing rows
--     are preserved; existing users are backfilled to 'employee'.
--
-- Safety:
--   * No RLS policy changes. `profiles` already has RLS + the
--     `enforce_profile_sensitive_fields` trigger; evaluation_level is a
--     non-sensitive classification field governed by that existing path.
--   * No new triggers that derive access from evaluation_level.
--   * Production wipe / cleanup SQL is not touched.

begin;

-- -----------------------------------------------------------------------------
-- 1) profiles.evaluation_level (classification field, independent of access role)
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists evaluation_level text;

-- Backfill existing rows to 'employee' (only NULLs are touched; safe to re-run).
update public.profiles
   set evaluation_level = 'employee'
 where evaluation_level is null;

-- CHECK constraint (add only if not already present).
do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'profiles_evaluation_level_check'
       and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_evaluation_level_check
      check (evaluation_level is null or evaluation_level in ('employee','supervisor','manager'));
  end if;
end $$;

comment on column public.profiles.evaluation_level is
  'Evaluation hierarchy classification (employee/supervisor/manager). INDEPENDENT of the system access role (user_roles.role). Classification only — does NOT grant permissions and does NOT affect RLS. A supervisor/manager here may still hold system role = user.';

-- -----------------------------------------------------------------------------
-- 2) evaluation_campaigns.campaign_type — add 'manager_to_supervisors'
--    (department manager evaluates the unit/station supervisors in their dept)
--    Pattern: drop + recreate the CHECK with the expanded value list.
--    Existing rows remain valid (we only ADD a value).
-- -----------------------------------------------------------------------------
alter table public.evaluation_campaigns
  drop constraint if exists evaluation_campaigns_type_check;

alter table public.evaluation_campaigns
  add constraint evaluation_campaigns_type_check
  check (campaign_type in (
    'self_station',
    'cross_station',
    'cross_department',
    'manager_to_team',
    'team_to_manager',
    'manager_to_supervisors',
    'legacy_same',
    'legacy_cross'
  ));

-- -----------------------------------------------------------------------------
-- 3) evaluations.evaluation_scope — add manager_to_supervisor_* scopes
--    Mirrors manager_department / manager_unit. Same drop+recreate pattern used
--    by 20260512130000_new_explicit_evaluation_campaign_types.sql.
-- -----------------------------------------------------------------------------
alter table public.evaluations
  drop constraint if exists evaluations_scope_check;

alter table public.evaluations
  add constraint evaluations_scope_check
  check (evaluation_scope in (
    'department_peer',
    'unit_peer',
    'manager_department',
    'manager_unit',
    'manager_to_supervisor_dept',
    'manager_to_supervisor_unit',
    'cross_department',
    'cross_unit',
    'team_to_manager_department',
    'team_to_manager_unit'
  ));

comment on column public.evaluations.evaluation_scope is
  'Targeting scope of the evaluation. manager_to_supervisor_* = department manager evaluates unit/station supervisors in their department (new in hierarchy-lite patch).';

commit;
