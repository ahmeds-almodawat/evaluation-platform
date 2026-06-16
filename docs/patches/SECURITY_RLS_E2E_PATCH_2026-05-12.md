# Security, RLS & E2E Validation Patch — 2026-05-12

This is a replacement-files-only patch intended to be copied over the latest `evaluation-platform-main-big-data-stability-2026-05-12` version.

## Included files

- `supabase/migrations/20260512160000_security_rls_e2e_validation.sql`
- `scripts/security/rls-baseline-check.mjs`
- `tests/e2e/helpers/auth.ts`
- `tests/e2e/security-rbac.spec.ts`
- `.env.example`
- `package.json`
- `docs/patches/SECURITY_RLS_E2E_PATCH_2026-05-12.md`

## What it does

- Protects `profiles.unit_id` and `profiles.direct_manager_id` from self-editing.
- Tightens read access for `manager_unit_assignments` while keeping department visibility required by the app.
- Adds `security_rls_baseline_report()` to report dangerous RLS/security findings.
- Adds `assert_security_rls_baseline()` for admin/manual CI checks.
- Adds `npm run security:check`.
- Adds optional Playwright RBAC tests for Admin, Audit, and normal Employee credentials.

## After copying files

```powershell
npm install
supabase db push
npm run typecheck
npm run build
npm run test
npm run lint
```

## Security check

For local/staging Supabase:

```powershell
$env:VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run security:check
```

## E2E checks

```powershell
$env:E2E_ADMIN_IDENTIFIER="admin-login"
$env:E2E_ADMIN_PASSWORD="admin-password"
$env:E2E_EMPLOYEE_IDENTIFIER="employee-login"
$env:E2E_EMPLOYEE_PASSWORD="employee-password"
$env:E2E_AUDIT_IDENTIFIER="audit-login"
$env:E2E_AUDIT_PASSWORD="audit-password"
npm run test:e2e:security
```

The E2E test file skips credential-dependent checks when credentials are missing.
