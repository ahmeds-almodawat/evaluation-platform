# Platform Roadmap (P0 / P1 / P2)

Goal: keep backend/auth stable while raising quality, governance, and UX to “enterprise-ready”.

## P0 — Reliability & Safety (do first)

### Testing (RBAC + regression)
- [ ] Add Playwright E2E:
  - [ ] Login
  - [ ] Create user (Edge Function) with Authorization header
  - [ ] Delete user (Edge Function)
  - [ ] Role matrix: admin / super_user / audit / user restrictions
- [ ] Add Vitest for:
  - [ ] API client helpers (auth header + error shape)
  - [ ] Utility functions used across pages

### Observability
- [ ] Add Sentry (frontend + Edge Functions)
- [ ] Add request_id correlation:
  - [ ] UI includes request_id in toast on failures
  - [ ] Edge Functions log request_id + actor id + action + latency
- [ ] Add alerts for spikes in:
  - [ ] 401/403
  - [ ] function errors/timeouts

### Governance basics
- [ ] Ensure privileged actions are always audited server-side:
  - create-user / delete-user
  - exports (when implemented)
  - role changes
  - failed/denied attempts

### Repo hygiene
- [ ] Do not ship `node_modules/` in archives
- [ ] Add `.env.example` (no secrets)
- [ ] One “Run locally” section in README

---

## P1 — Scale & Enterprise UX

### Server-side exports with governance
- [ ] Export endpoints in Edge Functions (not client-side)
- [ ] RBAC checked server-side
- [ ] Audit log every export (include reason + parameters)
- [ ] Watermark exports + include trace/request id
- [ ] Rate limit exports

### Performance polish
- [ ] Server-side pagination for large lists (employees, audit logs, reports)
- [ ] Add DB indexes:
  - employees: staff_id, phone, email, department_id, created_at
  - audit_logs: created_at, action, actor_user_id, entity_id
- [ ] React Query caching strategy (staleTime/keepPreviousData)

### UX consistency
- [ ] Standardize: PageHeader / Toolbar / Table / Dialog / EmptyState
- [ ] Consistent loading skeletons for tables
- [ ] Consistent error component with retry

### i18n + RTL/LTR
- [ ] AppShell is the only place that handles sidebar placement
- [ ] Make spacing RTL-safe (avoid hard-coded left/right margins)

---

## P2 — Product depth

### Data lifecycle rules
- [ ] Define retention for:
  - audit logs
  - evaluations
  - exports
- [ ] Decide soft-delete vs hard-delete
- [ ] “Inactive user” behavior (access, visibility)

### Bulk operations
- [ ] Bulk import users/employees
- [ ] Bulk deactivate / department reassignment

### Advanced governance
- [ ] End-to-end RBAC tests across all modules
- [ ] Admin actions require “reason” (stored in audit logs)
- [ ] Optional approval flows for sensitive changes

---

## UI Redesign plan (safe sequence)

1. AppShell (RTL/LTR + responsive) ✅ implemented
2. Shared system primitives (PageShell/PageHeader/Toolbar/etc.) ✅ implemented
3. Refactor most sensitive page first (User Management) ✅ container/view split implemented
4. Roll out the same pattern to Employees → Audit Logs → Reports → Settings

