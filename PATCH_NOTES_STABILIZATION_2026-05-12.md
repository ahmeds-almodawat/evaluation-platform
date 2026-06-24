# Stabilization Patch — 2026-05-12

## What was fixed

### Build and TypeScript
- Fixed all TypeScript errors reported by `npm run typecheck`.
- Added missing permission codes used by the UI:
  - `departments.manage_members`
  - `dashboards.custom.view`
  - `dashboards.custom.create`
  - `dashboards.custom.edit`
  - `dashboards.custom.share`
  - `dashboards.custom.export`
- Added `isAdmin` to the auth context to match existing page usage.
- Fixed `Header` usage on the user profile and branding pages.
- Fixed KPI card typing so existing dashboard cards can safely pass icons, percentages, numbers, and text subtitles.
- Made chart components tolerant of the existing report data shapes.
- Fixed report export typing and missing report scope audit metadata.
- Replaced outdated `replaceAll` usage with a wider-compatible regex replacement.

### Tests and linting
- Changed `npm run test` to `vitest run` so CI does not hang in watch mode.
- Excluded Playwright E2E specs from Vitest; they should be run through `npm run test:e2e`.
- ESLint now exits without blocking errors. Remaining warnings are mostly hook dependency and Fast Refresh warnings for a later refactor.

### Security / RBAC / RLS
- Added `supabase/migrations/20260512090000_harden_custom_roles_rls.sql`.
- The migration drops the old broad `using (true) / with check (true)` custom role policies.
- Custom role management is now DB-restricted to Admin users.
- Regular users may only read their own assigned custom role and permissions, which preserves frontend permission hydration.

### Arabic export text
- Fixed mojibake/corrupted Arabic strings in `supabase/functions/api-v1/index.ts` PDF/export labels.

### Documentation and deployment
- Added `.env.example`.
- Rebuilt `README.md` with setup, validation, and Supabase deployment commands.

## Validation performed

```bash
npm run typecheck   # passed
npm run lint        # passed with warnings only
npm run test        # passed: 2 files / 2 tests
npm run build       # production bundle generated; warning remains for large main JS chunk
```

## Remaining safe follow-ups

- Refactor hook dependency warnings instead of suppressing them.
- Add proper RBAC/RLS automated tests against a real Supabase test project.
- Split the large frontend bundle using route-level lazy loading.
- Clean historical migrations into a stable baseline before production rollout.
