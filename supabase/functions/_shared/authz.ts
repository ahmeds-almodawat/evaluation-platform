import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { AppRole, highestRole } from './roles.ts';

/**
 * NOTE:
 * - When using a service-role Supabase client, RLS is bypassed.
 * - Authorization must be enforced here in the Edge Function.
 */

export async function getRequesterUser(adminClient: ReturnType<typeof createClient>, bearerToken: string) {
  const token = bearerToken.replace('Bearer ', '');
  const { data: { user }, error } = await adminClient.auth.getUser(token);
  if (error || !user) return { user: null, error: error || new Error('Unauthorized') };
  return { user, error: null };
}

export async function getRequesterRole(adminClient: ReturnType<typeof createClient>, requesterId: string) {
  const { data, error } = await adminClient
    .from('user_roles')
    .select('role')
    .eq('user_id', requesterId);

  if (error) return { role: null as AppRole | null, error };
  const role = highestRole((data || []).map((r: any) => r.role as AppRole));
  return { role, error: null };
}

export function assertAdminOnlyAdminAssignment(requesterRole: AppRole, requestedRole: AppRole) {
  if (requestedRole === 'admin' && requesterRole !== 'admin') {
    return { ok: false, code: 'FORBIDDEN', message: 'Only admins can create or assign admin users' };
  }
  return { ok: true as const };
}
