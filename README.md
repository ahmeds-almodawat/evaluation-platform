# Evaluation Platform

Bilingual Arabic/English employee evaluation platform built with Vite, React, TypeScript, Supabase, and Edge Functions.

## Current stabilization status

This package includes a conservative stabilization patch focused on deployability and safety:

- TypeScript app validation passes with `npm run typecheck`.
- Production bundle generation completes with `npm run build`.
- ESLint has no blocking errors with `npm run lint`; remaining hook/refresh items are warnings for a later refactor.
- Vitest is configured as a non-watch command through `npm run test` for CI compatibility.
- Custom role RLS has been hardened by `supabase/migrations/20260512090000_harden_custom_roles_rls.sql`.
- Required frontend environment variables are documented in `.env.example`.

## Local setup

```bash
npm ci
cp .env.example .env.local
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run typecheck
npm run lint
npm run build
npm run test
npm run dev
```

## Supabase deployment

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
npm run sb:fn:deploy
```

The function deployment script deploys `api-v1`, `create-user`, `delete-user`, `export-users`, `restore-user`, and `scheduled-jobs`.

Before enabling `scheduled-jobs` in Supabase schedules, set the Edge Function secret used to authorize cron calls:

```bash
supabase secrets set CRON_SECRET="your-long-random-secret"
```

Do not use a real secret in documentation, commits, screenshots, or support tickets.

## Important production notes

Before a 500-user rollout, complete a real RBAC/RLS test suite covering Admin, Audit, Super User, and User roles. Also clean up the remaining hook dependency warnings, split the large frontend bundle with route-level lazy loading, and validate all Edge Function authorization paths against real Supabase users.

For internal hospital production use, keep the repository private and never commit `.env` files, service role keys, Supabase secrets, backups, or exported user data.
