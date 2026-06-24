# Integration Readiness (Portal as a Platform)

This repository is being treated as a **long‑lived product** that will receive ongoing updates and later be integrated into
a **new external system** (e.g., HIS/ERP). The goal is to keep the portal secure **today** while making integrations safe
and predictable **later**.

## Non‑negotiable boundaries

1. **External systems must not write directly to Postgres tables.**
   - Supabase `service_role` bypasses RLS by design.
   - Any privileged write must go through **Edge Functions (API boundary)** so we can enforce authorization, validation,
     idempotency, and auditing in one place.

2. **Role invariants must always hold**
   - `admin` can create/assign `admin`
   - `super_user` can never create/assign `admin`
   - Audit/report roles remain **read‑only**

3. **Deny‑by‑default RLS for all new tables**
   - Enable RLS early
   - Add the minimal `SELECT/INSERT/UPDATE/DELETE` policies required

## Integration strategy (recommended)

**API‑first** via Supabase Edge Functions:

- `/functions/v1/api-v1/...` (versioned)
- Every write endpoint:
  - validates payload
  - enforces role rules (no reliance on RLS when using service role)
  - writes an audit log entry
  - supports idempotency (recommended for integrations)

> See: `supabase/functions/api-v1/index.ts` for the skeleton.

## External identity mapping

To avoid painful migrations later, use a dedicated mapping table:

- `public.external_mappings` maps `(system, entity_type, entity_id)` ⇄ `external_id`

This lets you keep UUIDs internally while mapping to ERP/HIS identifiers safely.

## Idempotency (recommended)

Integrations often retry. Use:

- `Idempotency-Key` header
- `public.api_idempotency` to store request hash + response for a short TTL

This makes create/update operations safe to retry.

## Auditing

All privileged operations should log:
- actor (requesting user)
- action
- target entity
- metadata (JSON)
- success/denied reason (optional)

Table: `public.audit_logs`

## Change management rules

- Prefer **additive** DB changes first (nullable columns, new tables)
- Avoid renames/removals without API version bump
- Keep docs updated in:
  - `docs/CHANGELOG.md`
  - `docs/API_GUIDELINES.md`
