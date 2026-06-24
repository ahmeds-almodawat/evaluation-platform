# Mega Patch — Evaluation Preview + Backup Safety + Station Code Protection

Date: 2026-06-09

## Purpose

This patch hardens the station/unit evaluation workflow and backup/restore workflow before heavy testing.

## Included changes

1. Duplicate station-code protection
   - UI validation prevents duplicate active codes inside the same department.
   - Database partial unique index protects active `org_units.department_id + normalized code`.
   - Inactive historical duplicate codes remain allowed.

2. Station breakdown preview
   - Campaign preview now shows breakdown rows by station/unit or manager scope, not only totals.

3. All stations / specific station option
   - Self Station / Unit Evaluation can run for all stations in the department or one specific station.

4. Missing station assignment warning
   - Preview warns when employees are in a unit-based department but have no unit/station assigned.
   - Station-based campaigns skip those employees.

5. Station manager assignment warning
   - Preview and Backup Health Check warn when stations have no manager assignment.

6. Cross Station source/target validation
   - Existing source and target validation remains enforced; source cannot equal target.

7. Manager → Team preview by manager
   - Preview groups manager-to-team assignments by manager/scope.

8. Team → Manager preview by manager
   - Preview groups upward feedback assignments by manager/scope.

9. High-volume campaign confirmation
   - 500+ forms: warning.
   - 2,000+ forms: requires typing `CREATE`.
   - 5,000+ forms: blocked until scope/cap is reduced.

10. Backup Health Check
   - Exported backups include health warnings.
   - Restore Center shows health check findings before restore.
   - Checks include duplicate unit codes, employees without stations, stations without managers, risky roles, old active workload/comment questions, Auth-dependent rows, and more.

11. Restore dry-run
   - Restore Center has a dry-run button that shows what would happen without changing data.

12. Testing Baseline Backup shortcut
   - Export Center has a direct Testing Baseline Backup button.
   - This uses the setup baseline backup for repeated test resets.

13. Clean old active fallback comment/workload question
   - Migration deactivates old active workload/comment fallback questions.
   - Default template remains two scale questions.

## New migration

```sql
supabase/migrations/20260609170000_mega_patch_evaluation_backup_safety.sql
```

Run:

```powershell
supabase db push
```

## Validation

Validated with:

```powershell
npm run typecheck
npm run test
npm run lint
npm run build
```

Result:

- Typecheck passed
- Tests passed
- Lint: 0 errors, existing 32 warnings
- Build passed, existing large chunk warning only
