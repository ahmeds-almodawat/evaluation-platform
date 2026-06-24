# Almodawat Employee Portal — Security Matrix

This document defines **who can access what** in the portal.

> **Rule:** UI guards improve UX, but **Supabase RLS is the real security boundary**.

## Roles

- **admin**: Full access
- **super_user**: Operational admin (create/manage surveys, users/departments)
  - **Important:** cannot create/assign **admin** users (admin-only)
- **audit**: Read-only access to dashboards/reports and exports
- **user**: Can view their own dashboard and complete assigned evaluations

## Pages and access

| Area | Route | admin | super_user | audit | user |
|---|---|:---:|:---:|:---:|:---:|
| Login | `/auth` | ✅ | ✅ | ✅ | ✅ |
| Employee dashboard | `/dashboard/employee` | ✅ | ✅ | ✅ | ✅ |
| Department dashboard | `/dashboard/department` | ✅ | ✅ | ❌ | ❌ |
| Company dashboard | `/dashboard/company` | ✅ | ✅ | ✅ | ❌ |
| Reports | `/reports/*` | ✅ | ✅ | ✅ | ❌ |
| Evaluations (create/manage) | `/evaluations` | ✅ | ✅ | ❌ | ❌ |
| Evaluation survey (fill) | `/evaluations/:id` | ✅ | ✅ | ✅ | ✅ *(only assigned)* |
| My evaluations | `/my-evaluations` | ✅ | ✅ | ✅ | ✅ |
| Custom evaluation | `/custom-evaluation` | ✅ | ✅ | ❌ | ❌ |
| Employees list | `/employees` | ✅ | ✅ | ✅ | ❌ |
| User management | `/users` | ✅ | ✅ | ❌ | ❌ |
| Department management | `/departments` | ✅ | ✅ | ❌ | ❌ |
| Settings | `/settings` | ✅ | ✅ | ✅ | ✅ |
| Branding designer | `/settings/branding` | ✅ | ✅ | ❌ | ❌ |

## Enforcement layers

1) **React route guards** (implemented)
- `RequireAuth` blocks unauthenticated access
- `RequireRole` blocks pages by role

2) **Supabase RLS** (you must apply)
- Restrict reads/writes to rows by `auth.uid()`
- Restrict admin operations to `admin/super_user`

3) **Audit logging** (recommended)
- Log exports and admin actions to `audit_logs`
