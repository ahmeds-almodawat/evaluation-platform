import { supabase } from "@/integrations/supabase/client";

type AuditAction =
  | "EXPORT_PDF"
  | "EXPORT_EXCEL"
  | "EXPORT_USERS_CSV"
  | "EXPORT_USERS_CSV_FALLBACK"
  | "EXPORT_USERS_XLSX"
  | "BULK_ACTIVATE_USERS"
  | "BULK_DEACTIVATE_USERS"
  | "BULK_CHANGE_DEPARTMENT"
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DELETE"
  | "USER_PASSWORD_RESET"
  | "DEPARTMENT_CREATE"
  | "DEPARTMENT_UPDATE"
  | "EVALUATION_CREATE"
  | "LOGIN"
  | "SIMULATION_START"
  | "SIMULATION_STOP";

/**
 * Best-effort audit logger.
 * If the audit_logs table/RLS is not installed yet, this fails silently.
 */
export async function logAudit(
  action: AuditAction,
  opts?: {
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("audit_logs").insert({
      actor_user_id: user.id,
      actor_email: user.email ?? null,
      action,
      entity_type: opts?.entityType ?? null,
      entity_id: opts?.entityId ?? null,
      metadata: opts?.metadata ?? {},
    });
  } catch {
    // Intentionally ignore audit failures
  }
}
