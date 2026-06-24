# Performance & Input Responsiveness Patch — 2026-06-09

## Purpose
Reduce typing delay and clean up large-page rendering without changing business logic or database structure.

## Changes
- Added `DebouncedInput` so search fields do not re-render large pages on every keystroke.
- Updated Users, Employees, and Evaluations search inputs to debounce parent filtering.
- Added deferred filtering/memoization to large list pages.
- Added client-side pagination to the Employees page so only a limited set of rows renders at one time.
- Lazy-loaded route pages in `App.tsx` to reduce the initial JavaScript chunk and avoid loading heavy screens before they are opened.

## No data changes
- No migration included.
- No RLS or table changes.
- No evaluation scoring changes.
- No import/export business-rule changes.

## Validation
- `npm run typecheck` passed.
- `npm run test -- --run` passed.
- `npm run lint` passed with 0 errors and existing warnings only.
- `npm run build` passed.
