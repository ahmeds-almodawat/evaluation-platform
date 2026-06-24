# Station Management Performance Patch — 2026-06-09

## Goal
Reduce lag on large department pages, especially Nursing, by moving station employee assignment into a dedicated station page.

## Included changes
- Department Details page now loads as a lighter overview.
- Full department employee table is hidden by default and loads only when requested.
- Unit/station table shows employee count and manager count.
- Each station has an Open button.
- New Station Details page: `/departments/:departmentId/units/:unitId`.
- Station Details page supports:
  - Assigned employees table.
  - Available employees table.
  - Search by name, staff ID, or email.
  - Filters for same department/no station, same department/other station, and no department.
  - Bulk add selected people to the station.
  - Bulk remove selected people from the station.
  - XLS/CSV import to assign existing users to a station.
  - Import preview before updating records.
  - Station assignment template download.

## Safety rules
- Station import does not create users.
- Station import only assigns existing profiles by staff_id or email.
- Unmatched rows are skipped and shown in preview.
- Assigning people from the station page sets both `department_id` and `unit_id`.
- Removing people from station clears only `unit_id`, not department membership.

## Validation
- `npm run typecheck` passed.
- `npm run test -- --run` passed.
- `npm run lint` passed with 0 errors and existing warnings only.
- `npm run build` passed with existing large exportTools warning only.
