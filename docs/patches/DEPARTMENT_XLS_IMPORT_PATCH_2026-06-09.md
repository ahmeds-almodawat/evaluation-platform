# Department XLS Import Patch — 2026-06-09

## Purpose
Adds XLS/CSV department creation by upload from the Department Management page.

## Replacement file
- `src/pages/DepartmentManagementPage.tsx`

## What changed
- Added `Dept Template` download button.
- Added `Import Departments XLS` upload button.
- Upload supports `.xlsx`, `.xls`, and `.csv`.
- Import preview shows rows that will be created, existing rows that will be skipped, and invalid/duplicate rows needing review.
- Import creates only new departments and skips existing departments by matching English or Arabic names.
- Required upload columns:
  - `department_name_en`
  - `department_name_ar`
- Optional upload columns:
  - `department_code` / `code` / `dept_code` / `dep_code` for reference only.

## Safety behavior
- Existing department names are skipped.
- Duplicate rows in the same file are skipped.
- Rows missing English or Arabic name are skipped.
- Insert runs in chunks to avoid large upload issues.

## Validation
Validated with:
- `npm run typecheck`
- `npm run test -- --run`
- `npm run lint` — 0 errors, existing warnings only
- `npm run build` — passed, existing large chunk warning only
