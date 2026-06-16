# API Guidelines (Edge Functions)

This doc defines the standards for **all** Edge Functions that act as the portal's API boundary.

## Versioning

- Use path versioning: `/api/v1/...`
- If a breaking change is needed, add `/api/v2/...` and keep v1 for a deprecation window.

## Authentication

- Require `Authorization: Bearer <jwt>` for user-scoped endpoints.
- For machine-to-machine integrations later:
  - prefer separate **integration credentials** (do not reuse admin users)
  - scope access using explicit `scopes`.

## Authorization

- When using `service_role` clients, **do not rely on RLS**.
- Always enforce authorization in the function:
  - fetch requester role
  - apply invariants (e.g., admin-only admin assignment)

## Idempotency

- For create/update endpoints used by integrations:
  - accept `Idempotency-Key`
  - store request hash + response in `public.api_idempotency`
  - return stored response on retry

## Auditing

Every privileged operation must log:
- `actor_user_id`
- `action`
- `metadata` (target IDs, diffs, reasons)
- `success`

Use helper: `supabase/functions/_shared/audit.ts`

## Error format

Return consistent JSON:

```json
{ "error": { "code": "FORBIDDEN", "message": "..." } }
```

## CORS

- Allow only the expected origins in production.
- During development, `*` is acceptable.
