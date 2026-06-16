import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

/**
 * Best-effort audit logger (Edge Functions).
 *
 * Why "best-effort"?
 * - We never want observability/audit to break the request path.
 * - Older DB installs may not have the expanded columns; we gracefully fall back.
 */
export async function auditLog(
  adminClient: ReturnType<typeof createClient>,
  params: {
    actor_user_id?: string | null;
    actor_email?: string | null;
    action: string;
    success?: boolean;
    entity_type?: string | null;
    entity_id?: string | null;
    request_id?: string | null;
    ip?: string | null;
    user_agent?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const minimal = {
    actor_user_id: params.actor_user_id ?? null,
    action: params.action,
    success: params.success ?? true,
    metadata: params.metadata ?? {},
  };

  const full = {
    ...minimal,
    actor_email: params.actor_email ?? null,
    entity_type: params.entity_type ?? null,
    entity_id: params.entity_id ?? null,
    request_id: params.request_id ?? null,
    ip: params.ip ?? null,
    user_agent: params.user_agent ?? null,
  };

  try {
    // Prefer full payload (new schema)
    const { error } = await adminClient.from('audit_logs').insert(full as any);
    if (!error) return;

    // Fallback to minimal payload (old schema)
    await adminClient.from('audit_logs').insert(minimal as any);
  } catch (_e) {
    // swallow
  }
}
