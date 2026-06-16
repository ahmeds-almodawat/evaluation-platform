# Patch Notes — Optional Organizational Units / Stations + Manager Assignments

## Purpose
This patch fixes the Nursing/station problem without creating fake departments.

Departments remain the official reporting roll-up. Units/stations/sections are now optional under a department, so simple departments can stay as manager + employees with no units.

## Added

### Database migration
`supabase/migrations/20260512113000_optional_org_units_manager_assignments.sql`

Adds:
- `org_units`
- `manager_unit_assignments`
- `profiles.unit_id`
- `profiles.direct_manager_id`
- optional evaluation metadata:
  - `evaluations.evaluator_unit_id`
  - `evaluations.evaluatee_unit_id`
  - `evaluations.evaluation_scope`
  - `evaluations.manager_assignment_id`
- RLS policies for unit/manager assignment management

### Department details UI
`src/pages/departments/DepartmentDetailsPage.tsx`

Adds:
- Units / Stations management card
- Manager Assignments management card
- Employee unit/station assignment per employee
- Bulk unit assignment
- Transfer/remove employee logic now clears unit/direct manager safely

### Evaluation generation logic
`src/components/evaluations/InitiateEvaluationDialog.tsx`

Same-department evaluation now works as:

1. If the department has active units/stations:
   - peer evaluations are generated inside the same unit/station only.
2. If the department has no active units/stations:
   - peer evaluations fall back to the whole department.
3. Manager assignments are generated first:
   - manager can evaluate one unit/station or the full department.
   - duplicate evaluator/evaluatee pairs are prevented.
4. Employees do not automatically evaluate assigned managers when manager assignments exist.

### Build optimization
`vite.config.ts`

Adds conservative manual chunks to reduce the original single huge frontend bundle risk.

## Validation run

- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run test` ✅
- `npm run lint` ✅ 0 errors / existing warnings only

## Important deployment step
After deploying this code, run:

```bash
supabase db push
```

Then in the platform:

1. Go to Departments.
2. Open a department such as Nursing.
3. Add units/stations.
4. Assign nurses to units/stations.
5. Add manager assignments for one unit or the whole department.
6. Create same-department evaluation.

## Design note
Do not create fake departments like Nursing 1, Nursing 2, Nursing 3. Use one Nursing department, then units/stations under it.
