# v7.3 Enterprise Hardening Patch - 2026-06-24

## Scope

Focused hardening only. This patch does not add product features, rewrite evaluation workflows, alter notification logic, or run destructive database migrations.

## Changed files

- `supabase/functions/scheduled-jobs/index.ts`
- `supabase/functions/create-user/index.ts`
- `supabase/config.toml`
- `src/pages/users/UserManagementPage.tsx`
- `docs/patches/V7_3_ENTERPRISE_HARDENING_2026-06-24.md`

## Security behavior

### Scheduled jobs

`scheduled-jobs` now requires an explicit `CRON_SECRET` before it can call service-role RPCs.
Supabase JWT verification is disabled for this function in `supabase/config.toml` so cron callers authenticate with `CRON_SECRET` instead of a user JWT.

Accepted caller credentials:

- `Authorization: Bearer <CRON_SECRET>`
- `x-cron-secret: <CRON_SECRET>`

Missing or invalid credentials return `401` with `request_id` in the response body and `x-request-id` header. The expected secret is never returned in errors.

### Create/update user

`create-user` keeps the existing permission model:

- Admin can assign Admin, Super User, Audit, and User.
- Super User can assign only Super User, Audit, and User.
- Super User cannot create, assign, or edit Admin users.

The function now adds server-side audit records for:

- `USER_CREATE`
- `USER_PROFILE_UPDATE`
- `USER_ROLE_ASSIGN`
- `USER_PASSWORD_RESET`

Audit metadata includes actor id/email, target user id/email/staff id when available, role context when relevant, and `request_id`.

### CSV export governance

User CSV export no longer falls back to browser-side export. CSV export must succeed through the audited `export-users` Edge Function. If the function fails, the UI shows the error and includes `request_id` when the server provides one.

## Environment requirements

Required Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Existing frontend requirements remain:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Deployment commands

```bash
supabase secrets set CRON_SECRET="use-a-long-random-secret"
supabase functions deploy scheduled-jobs
supabase functions deploy create-user
supabase functions deploy export-users
npm run build
```

If deploying all existing user-management functions together:

```bash
supabase functions deploy create-user
supabase functions deploy delete-user
supabase functions deploy export-users
supabase functions deploy restore-user
supabase functions deploy scheduled-jobs
```

## Test checklist

- Call `scheduled-jobs?mode=refresh` without a secret and confirm `401` plus `request_id`.
- Call `scheduled-jobs?mode=refresh` with `Authorization: Bearer <CRON_SECRET>` and confirm success.
- Call `scheduled-jobs?mode=reminders` with `x-cron-secret: <CRON_SECRET>` and confirm success.
- Create a user as Admin and confirm `USER_CREATE`, `USER_PROFILE_UPDATE`, and `USER_ROLE_ASSIGN` audit rows.
- Update a user password and confirm `USER_PASSWORD_RESET` audit row.
- Confirm Super User still cannot create or assign Admin.
- Force `export-users` to fail and confirm the UI does not download CSV locally.
- Confirm CSV export success still downloads through the Edge Function.
- Run `npm run typecheck`.
- Run `npm run test -- --run`.
- Run `npm run lint`.
- Run `npm run build`.
