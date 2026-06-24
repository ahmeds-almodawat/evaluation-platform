# UI Contract (Stable Backend / Flexible UI)

This document defines the **front-end contracts** we follow to redesign the UI **without breaking backend logic**.

## Non‑negotiable rules

1. **No page/component calls Supabase or Edge Functions directly.**
   - All network calls go through a small set of functions in `src/services/*` or `src/integrations/*` helpers.
2. **Pages are containers; Views are presentational.**
   - *Container*: data fetching, mutations, validation, navigation, role checks
   - *View*: renders UI from props only (no business logic)
3. **RTL/LTR is handled in the AppShell only.**
   - Pages never reposition navigation.
4. **One pattern for Loading / Empty / Error**
   - Tables show skeletons while loading
   - Empty states explain what to do next
   - Errors are human readable and actionable (retry)

## Layout contract

### `AppShell` (single source of truth)
File: `src/components/layout/AppShell.tsx`

Responsibilities:
- Desktop sidebar placement:
  - `direction === "rtl"` → sidebar right
  - `direction === "ltr"` → sidebar left
- Mobile drawer opens from the correct side
- Main content scroll container (`main`)

Pages must assume they render inside a scrollable main area.

## Design system primitives

Location: `src/components/system/*`

- `PageShell`: consistent max width + padding
- `PageHeader`: title / description / actions
- `Toolbar`: consistent filter + action bar layout
- `EmptyState`: consistent empty list UX
- `ConfirmDialog`: consistent destructive confirmation UX

These are **presentational only** and must not depend on backend logic.

## Page contract

Pages must follow this folder pattern:

```
src/pages/<area>/
  <Feature>Page.tsx       (container)
  <Feature>View.tsx       (presentational)
  <feature>.types.ts      (shared types)
```

Example: `src/pages/users/UserManagementPage.tsx` + `UserManagementView.tsx`

## Data/Mutation contract

- All privileged writes (create user / delete user / exports) must:
  - be role-checked server-side
  - be audited
  - return a consistent error shape (message + request_id)

UI shows friendly messages and can display the `request_id` for support when needed.

