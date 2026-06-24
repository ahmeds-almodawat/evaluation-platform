# Super User Role Assignment Fix — 2026-06-16

## Problem
When logged in as Super User, the Users popup role dropdown could show only `Super User` because hardened RLS allowed the user to read only their assigned custom role. This blocked creating or editing users as `User` or `Audit` from the UI.

## Expected behavior
Super User can create/edit users with these roles only:

- `user`
- `audit`
- `super_user`

Super User cannot create, assign, edit, or escalate anyone to `admin`.

## Files changed

- `src/pages/users/UserManagementPage.tsx`
- `src/pages/users/UserManagementView.tsx`
- `supabase/functions/create-user/index.ts`
- `supabase/migrations/20260616133000_super_user_core_role_assignment.sql`

## What changed

- The user role dropdown always includes the four core roles locally, even if RLS only returns one role.
- Non-admin users still do not see/select Admin in the create/edit dropdown.
- Excel user import now maps core roles consistently to `custom_role_key`.
- The `create-user` edge function now enforces backend safety:
  - Admin can assign all roles.
  - Super User can assign only non-admin roles.
  - Super User cannot edit Admin users.
- RLS now allows users with `users.manage` to read role metadata and user custom-role assignments needed by Users Management.
- RLS allows `users.manage` to directly manage only non-admin custom-role assignments.

## After replacing files

Run:

```powershell
npm run typecheck
npm run test -- --run
npm run lint
npm run build
```

Then apply the new migration to your Supabase database and deploy the edge function:

```powershell
supabase db push
supabase functions deploy create-user
```

For local testing only:

```powershell
supabase db reset --local
supabase functions serve create-user
```

