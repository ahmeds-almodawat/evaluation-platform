-- Explicit evaluation campaign types after optional org units/stations.
-- Safe/additive intent:
-- - Preserve legacy evaluation_type='same' records for history.
-- - Allow new campaign types/scopes for unit/station, cross-station, manager-to-team, and team-to-manager flows.
-- - Do not mutate old completed or pending evaluations.

begin;

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
      'cross_department',
      'cross_unit',
      'team_to_manager_department',
      'team_to_manager_unit'
    )
  );

comment on column public.evaluations.evaluation_type is
  'Legacy values such as same/cross are preserved. New campaign values include self_station, cross_station, cross_department, manager_to_team, and team_to_manager.';

comment on column public.evaluations.evaluation_scope is
  'Optional assignment metadata: department_peer, unit_peer, manager_department, manager_unit, cross_department, cross_unit, team_to_manager_department, team_to_manager_unit.';

commit;
