# Master Station Import Patch — 2026-06-15

## Purpose
Adds a department-level master station assignment import so an Admin can assign existing users to many stations from one XLS/CSV file instead of opening each station one by one.

## Files changed
- `src/pages/departments/DepartmentDetailsPage.tsx`

## Added workflow
From a department page such as `Departments → Nursing`:

1. Click **Assignment template** to download a sample file.
2. Click **Import all stations** and upload XLS/CSV.
3. Review the preview summary by station.
4. Confirm assignment.

## Safety rules
- Does **not** create users.
- Does **not** create stations.
- Matches existing employees by `staff_id` first, then `email`.
- Matches active stations in the selected department by `unit_code`, then `unit_name_en`, then `unit_name_ar`.
- Duplicate employees in the uploaded file are skipped in preview.
- Invalid/missing users or stations are skipped in preview.
- Confirmation updates only `profiles.department_id` and `profiles.unit_id`.

## Recommended upload columns
- `staff_id`
- `email`
- `department_name_en`
- `unit_code`
- `unit_name_en`
- `note`
