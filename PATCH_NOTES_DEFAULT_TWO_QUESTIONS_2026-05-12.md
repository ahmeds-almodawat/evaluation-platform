# Default Evaluation Two-Question Patch — 2026-05-12

## Requested change
Default Evaluation should have exactly two score questions only.

## Changed
- Removed Workload from the legacy/default evaluation form fallback.
- Removed the general optional comment box from the default/fallback evaluation form.
- Added a Supabase migration to remove all Default Evaluation questions after the first two.
- The migration also removes legacy default workload/comment rows and patches non-completed Default Evaluation snapshots.
- Template-based custom text questions still work for non-default/custom templates.

## Validation commands
Run:

```bash
npm run typecheck
npm run build
npm run test
supabase db push
```
