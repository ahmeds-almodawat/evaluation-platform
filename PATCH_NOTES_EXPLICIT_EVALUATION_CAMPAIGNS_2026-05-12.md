# Patch Notes — Explicit Evaluation Campaign Types (2026-05-12)

## Goal
Replace the old creation flow that mixed department peers and managers into one "Self Department Evaluation" with explicit creation flows that respect stations/units and manager assignments.

## Safety rules followed
- Old evaluations are not deleted.
- Old completed and pending records are not converted.
- Legacy `evaluation_type = 'same'` remains visible in history as legacy self-department data.
- The legacy self-department creation button is hidden from the Evaluations page.
- Changes are additive and shipped through a new migration.

## New creation flows
1. Self Station / Unit Evaluation
   - Peers evaluate peers inside the same unit/station.
   - If a department has no units, it falls back to department-level peer evaluation.
   - Active assigned managers are excluded from peer evaluation so manager feedback stays separate.

2. Cross Station Evaluation
   - A selected source unit/station evaluates a selected target unit/station inside the same department.

3. Cross Department Evaluation
   - Members of the selected department evaluate members in linked departments.
   - Existing department links are reused.

4. Manager → Team
   - Managers evaluate employees under their active department/unit manager assignments.

5. Team → Manager
   - Employees under an active manager assignment evaluate that manager.
   - Stored separately from peer evaluation.

## Database change
Added migration:

```sql
supabase/migrations/20260512130000_new_explicit_evaluation_campaign_types.sql
```

It expands allowed `evaluation_scope` values to support:
- `cross_unit`
- `team_to_manager_department`
- `team_to_manager_unit`

## Operational setup
For Nursing or any large department:
1. Create units/stations under the department.
2. Assign employees to units/stations.
3. Create manager assignments.
4. Create explicit evaluation campaigns from the Evaluations page.

For small departments:
- No units are required.
- Self Station / Unit Evaluation automatically falls back to department-level peer evaluation.
