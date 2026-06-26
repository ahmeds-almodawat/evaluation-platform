// Supabase Edge Function: create-user (Clean Model RBAC - FIXED)
//
// Fixes:
// - CORS: echoes the request origin if allowed (supports localhost:8080)
// - custom_role_key: "_" / "" / null => treated as null (no custom role)
// - custom_role_key validation: case-insensitive match against custom_roles.role_key
// - If valid => upsert user_custom_roles(user_id, role_key)
// - If explicitly cleared => delete user_custom_roles row and set legacy role fallback
// - Backwards compatible: still accepts legacy role tier in `role` (admin/super_user/audit/user), used ONLY when no custom role is provided
// - Uses ONLY secret: cors_origins (comma-separated)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { auditLog } from '../_shared/audit.ts'
import { getRequestId } from '../_shared/observability.ts'

const FALLBACK_ALLOWED = [
  'http://localhost:8080',
  'http://192.168.100.6:8080',
  'https://almodawat-employee-portal.vercel.app',
  'https://almodawat-evaluation.vercel.app',
]

function parseAllowedOrigins(): string[] {
  const raw = (Deno.env.get('cors_origins') ?? '').trim()
  const list =
    raw.length > 0
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []

  return Array.from(new Set([...list, ...FALLBACK_ALLOWED]))
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false
  const allowed = parseAllowedOrigins()
  return allowed.includes(origin)
}

function corsHeaders(origin: string | null) {
  // Echo back request origin ONLY if allowed
  if (origin && isOriginAllowed(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
  }

  return {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

function sanitizeLegacyRole(input: unknown): 'admin' | 'super_user' | 'audit' | 'user' {
  const k = String(input ?? '').trim().toLowerCase()
  return k === 'admin' || k === 'super_user' || k === 'audit' || k === 'user' ? (k as any) : 'user'
}

function sanitizeCustomRoleKey(input: unknown): string | null {
  if (input === undefined) return null
  const v = String(input ?? '').trim()
  if (!v) return null
  if (v === '_') return null
  return v
}

const ROLE_PRIORITY: Record<'admin' | 'super_user' | 'audit' | 'user', number> = {
  user: 0,
  audit: 1,
  super_user: 2,
  admin: 3,
}

function highestLegacyRole(rows: Array<{ role?: unknown }> | null | undefined) {
  let best: 'admin' | 'super_user' | 'audit' | 'user' = 'user'
  for (const row of rows || []) {
    const role = sanitizeLegacyRole(row?.role)
    if (ROLE_PRIORITY[role] > ROLE_PRIORITY[best]) best = role
  }
  return best
}

function jsonOk(headers: Record<string, string>, requestId: string, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'x-request-id': requestId },
  })
}

function jsonErr(
  headers: Record<string, string>,
  requestId: string,
  error: string,
  status = 400,
  extra: Record<string, unknown> = {},
) {
  return new Response(JSON.stringify({ error, request_id: requestId, ...extra }), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'x-request-id': requestId },
  })
}

serve(async (req) => {
  const origin = req.headers.get('Origin')
  const headers = corsHeaders(origin)
  const requestId = getRequestId(req)

  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(origin)) {
      return jsonErr(headers, requestId, 'CORS origin not allowed', 403)
    }
    return new Response('ok', { status: 200, headers: { ...headers, 'x-request-id': requestId } })
  }

  if (!isOriginAllowed(origin)) {
    return jsonErr(headers, requestId, 'CORS origin not allowed', 403, { origin })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonErr(headers, requestId, 'Missing Supabase environment variables', 500)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonErr(headers, requestId, 'Missing authorization header', 401)
    }

    const token = authHeader.replace('Bearer ', '')

    const {
      data: { user: currentUser },
      error: userError,
    } = await adminClient.auth.getUser(token)

    if (userError || !currentUser) {
      return jsonErr(headers, requestId, 'Unauthorized', 401)
    }

    // Permission check (canonical signature)
    const { data: canManageUsers, error: permErr } = await adminClient.rpc('has_permission', {
      p_permission: 'users.manage',
      p_user_id: currentUser.id,
    })

    if (permErr) {
      return jsonErr(headers, requestId, 'Permission check failed', 500, { details: permErr })
    }

    if (!canManageUsers) {
      return jsonErr(headers, requestId, 'Insufficient permissions', 403)
    }

    // Backend role guard:
    // Admin can assign every role. Super User can create/edit only non-admin roles
    // (super_user, audit, user). This is intentionally enforced in the edge function
    // so a browser-side change cannot escalate a Super User to Admin.
    const { data: currentRoleRow, error: currentRoleErr } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .maybeSingle()

    if (currentRoleErr) {
      return jsonErr(headers, requestId, 'Current role lookup failed', 500, { details: currentRoleErr })
    }

    const currentUserLegacyRole = sanitizeLegacyRole((currentRoleRow as any)?.role)
    const currentUserIsAdmin = currentUserLegacyRole === 'admin'

    // Parse body safely
    let body: any = null
    try {
      body = await req.json()
    } catch {
      return jsonErr(headers, requestId, 'Invalid JSON body', 400)
    }

    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '').trim()
    const updateExisting = Boolean(body.updateExisting ?? body.update_existing)

    if (!email) {
      return jsonErr(headers, requestId, 'Email is required', 400)
    }

    if (!updateExisting && !password) {
      return jsonErr(headers, requestId, 'Password is required', 400)
    }

    const nameEn = String(body.nameEn ?? body.name_en ?? '').trim()
    const nameAr = String(body.nameAr ?? body.name_ar ?? '').trim()
    const departmentId =
      (body.departmentId ?? body.department_id) ? String(body.departmentId ?? body.department_id).trim() : null
    const staffId = (body.staffId ?? body.staff_id) ? String(body.staffId ?? body.staff_id).trim() : null
    const phone = (body.phone ?? body.phone_number) ? String(body.phone ?? body.phone_number).trim() : null
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : undefined
    const position = body.position !== undefined && body.position !== null ? String(body.position).trim() : undefined
    const rawEvalLevel = (body.evaluationLevel ?? body.evaluation_level) != null ? String(body.evaluationLevel ?? body.evaluation_level).trim() : undefined
    const VALID_EVAL_LEVELS = new Set(['employee', 'supervisor', 'manager'])
    const evaluationLevel = rawEvalLevel && VALID_EVAL_LEVELS.has(rawEvalLevel) ? rawEvalLevel : undefined

    if (!nameEn) {
      return jsonErr(headers, requestId, 'Missing required field: name_en', 400)
    }

    const legacyRole = sanitizeLegacyRole(body.role ?? body.userRole ?? 'user')

    const hasCustomRoleKeyField = Object.prototype.hasOwnProperty.call(body, 'custom_role_key')
    const rawCustomRoleKey = hasCustomRoleKeyField ? body.custom_role_key : undefined
    const customRoleKey = hasCustomRoleKeyField ? sanitizeCustomRoleKey(rawCustomRoleKey) : null

    let requestedCustomRole: { role_key: string; legacy_role: 'admin' | 'super_user' | 'audit' | 'user' } | null = null

    if (hasCustomRoleKeyField && customRoleKey) {
      const { data: roles, error: rolesErr } = await adminClient
        .from('custom_roles')
        .select('role_key,legacy_role')

      if (rolesErr) {
        return jsonErr(headers, requestId, 'Role lookup failed', 500, { details: rolesErr })
      }

      const wanted = String(customRoleKey).trim().toLowerCase()
      const matched = (roles || []).find(
        (r: any) => String(r.role_key).trim().toLowerCase() === wanted,
      )

      if (!matched?.role_key) {
        return jsonErr(headers, requestId, `Invalid custom_role_key: ${customRoleKey}`, 400)
      }

      requestedCustomRole = {
        role_key: String(matched.role_key).trim(),
        legacy_role: sanitizeLegacyRole((matched as any).legacy_role),
      }
    }

    const requestedLegacyTier = requestedCustomRole?.legacy_role ?? legacyRole
    if (!currentUserIsAdmin && requestedLegacyTier === 'admin') {
      return jsonErr(headers, requestId, 'Only admins can create or assign the admin role', 403)
    }

    // Lookup existing user id by email (your project already has this RPC)
    const { data: existingUserId, error: lookupErr } = await adminClient.rpc('get_auth_user_id_by_email', {
      p_email: email,
    })

    if (lookupErr) {
      return jsonErr(headers, requestId, 'Email lookup failed', 500, { details: lookupErr })
    }

    let userId: string | null = existingUserId
    let updated = false
    let previousProfile: { email?: string | null; staff_id?: string | null } | null = null
    let previousLegacyRole: 'admin' | 'super_user' | 'audit' | 'user' | null = null
    let previousCustomRoleKey: string | null = null

    if (userId) {
      try {
        const [
          { data: profileBefore },
          { data: roleRows },
          { data: customRoleBefore },
        ] = await Promise.all([
          adminClient.from('profiles').select('email,staff_id').eq('id', userId).maybeSingle(),
          adminClient.from('user_roles').select('role').eq('user_id', userId),
          adminClient.from('user_custom_roles').select('role_key').eq('user_id', userId).maybeSingle(),
        ])

        previousProfile = profileBefore as any
        previousLegacyRole = highestLegacyRole(roleRows as any)
        previousCustomRoleKey = (customRoleBefore as any)?.role_key ?? null
      } catch {
        // Audit context only; do not block user management.
      }
    }

    if (userId && updateExisting && !currentUserIsAdmin) {
      const { data: targetRoleRow, error: targetRoleErr } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle()

      if (targetRoleErr) {
        return jsonErr(headers, requestId, 'Target role lookup failed', 500, { details: targetRoleErr })
      }

      if (sanitizeLegacyRole((targetRoleRow as any)?.role) === 'admin') {
        return jsonErr(headers, requestId, 'Only admins can edit admin users', 403)
      }
    }

    if (userId) {
      if (!updateExisting) {
        return jsonErr(headers, requestId, 'User already exists', 409)
      }

      if (password) {
        const { error: updErr } = await adminClient.auth.admin.updateUserById(userId, { password })
        if (updErr) {
          return jsonErr(headers, requestId, 'Failed to update user password', 500, { details: updErr })
        }

        await auditLog(adminClient, {
          actor_user_id: currentUser.id,
          actor_email: currentUser.email ?? null,
          action: 'USER_PASSWORD_RESET',
          success: true,
          entity_type: 'profiles',
          entity_id: userId,
          request_id: requestId,
          metadata: {
            target_user_id: userId,
            target_email: email || previousProfile?.email || null,
            target_staff_id: staffId || previousProfile?.staff_id || null,
            updated_existing: true,
          },
        })
      }

      updated = true
    } else {
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (createErr || !created?.user?.id) {
        return jsonErr(headers, requestId, 'Failed to create user', 500, { details: createErr })
      }

      userId = created.user.id
      updated = false

      await auditLog(adminClient, {
        actor_user_id: currentUser.id,
        actor_email: currentUser.email ?? null,
        action: 'USER_CREATE',
        success: true,
        entity_type: 'profiles',
        entity_id: userId,
        request_id: requestId,
        metadata: {
          target_user_id: userId,
          target_email: email,
          target_staff_id: staffId,
          requested_legacy_role: requestedLegacyTier,
          requested_custom_role_key: requestedCustomRole?.role_key ?? null,
        },
      })
    }

    // Upsert profile
    const profilePayload: Record<string, any> = {
      id: userId,
      email,
      name_en: nameEn || null,
      name_ar: nameAr || null,
      department_id: departmentId,
      staff_id: staffId,
      phone,
      updated_at: new Date().toISOString(),
    }
    if (isActive !== undefined) profilePayload.is_active = isActive
    if (position !== undefined) profilePayload.position = position
    if (evaluationLevel !== undefined) profilePayload.evaluation_level = evaluationLevel

    const { error: profileErr } = await adminClient.from('profiles').upsert(profilePayload, { onConflict: 'id' })
    if (profileErr) {
      return jsonErr(headers, requestId, 'Failed to upsert profile', 500, { details: profileErr })
    }

    await auditLog(adminClient, {
      actor_user_id: currentUser.id,
      actor_email: currentUser.email ?? null,
      action: 'USER_PROFILE_UPDATE',
      success: true,
      entity_type: 'profiles',
      entity_id: userId,
      request_id: requestId,
      metadata: {
        target_user_id: userId,
        target_email: email || previousProfile?.email || null,
        target_staff_id: staffId || previousProfile?.staff_id || null,
        updated_existing: updated,
        fields: {
          name_en: Boolean(nameEn),
          name_ar: Boolean(nameAr),
          department_id: departmentId,
          staff_id: staffId,
          phone: Boolean(phone),
          is_active_changed: isActive !== undefined,
          position_changed: position !== undefined,
        },
      },
    })

    // ---- Custom role resolution (case-insensitive) ----
    let assignedCustomRoleKey: string | null = null

    if (hasCustomRoleKeyField && customRoleKey) {
      assignedCustomRoleKey = String(requestedCustomRole?.role_key || customRoleKey).trim()

      const { error: ucrErr } = await adminClient
        .from('user_custom_roles')
        .upsert({ user_id: userId, role_key: assignedCustomRoleKey }, { onConflict: 'user_id' })

      if (ucrErr) {
        return jsonErr(headers, requestId, 'Failed to assign custom role', 500, { details: ucrErr })
      }

      await auditLog(adminClient, {
        actor_user_id: currentUser.id,
        actor_email: currentUser.email ?? null,
        action: 'USER_ROLE_ASSIGN',
        success: true,
        entity_type: 'profiles',
        entity_id: userId,
        request_id: requestId,
        metadata: {
          target_user_id: userId,
          target_email: email || previousProfile?.email || null,
          target_staff_id: staffId || previousProfile?.staff_id || null,
          previous_legacy_role: previousLegacyRole,
          previous_custom_role_key: previousCustomRoleKey,
          assigned_custom_role_key: assignedCustomRoleKey,
          assigned_legacy_role: requestedLegacyTier,
        },
      })

      // Trigger will sync legacy role automatically.
    } else if (hasCustomRoleKeyField && !customRoleKey) {
      // Explicit clear
      const { error: delErr } = await adminClient.from('user_custom_roles').delete().eq('user_id', userId)
      if (delErr) {
        return jsonErr(headers, requestId, 'Failed to clear custom role', 500, { details: delErr })
      }

      // Apply legacy fallback (compat)
      const { error: legacyErr } = await adminClient
        .from('user_roles')
        .upsert({ user_id: userId, role: legacyRole }, { onConflict: 'user_id' })

      if (legacyErr) {
        return jsonErr(headers, requestId, 'Failed to upsert legacy role', 500, { details: legacyErr })
      }

      await auditLog(adminClient, {
        actor_user_id: currentUser.id,
        actor_email: currentUser.email ?? null,
        action: 'USER_ROLE_ASSIGN',
        success: true,
        entity_type: 'profiles',
        entity_id: userId,
        request_id: requestId,
        metadata: {
          target_user_id: userId,
          target_email: email || previousProfile?.email || null,
          target_staff_id: staffId || previousProfile?.staff_id || null,
          previous_legacy_role: previousLegacyRole,
          previous_custom_role_key: previousCustomRoleKey,
          assigned_custom_role_key: null,
          assigned_legacy_role: legacyRole,
        },
      })
    } else {
      // No custom_role_key field provided => only ensure legacy exists for creates or explicit legacy updates
      const hasLegacyRoleField =
        Object.prototype.hasOwnProperty.call(body, 'role') ||
        Object.prototype.hasOwnProperty.call(body, 'userRole')

      if (!updated || hasLegacyRoleField) {
        const { error: legacyErr } = await adminClient
          .from('user_roles')
          .upsert({ user_id: userId, role: legacyRole }, { onConflict: 'user_id' })
        if (legacyErr) {
          return jsonErr(headers, requestId, 'Failed to upsert legacy role', 500, { details: legacyErr })
        }

        await auditLog(adminClient, {
          actor_user_id: currentUser.id,
          actor_email: currentUser.email ?? null,
          action: 'USER_ROLE_ASSIGN',
          success: true,
          entity_type: 'profiles',
          entity_id: userId,
          request_id: requestId,
          metadata: {
            target_user_id: userId,
            target_email: email || previousProfile?.email || null,
            target_staff_id: staffId || previousProfile?.staff_id || null,
            previous_legacy_role: previousLegacyRole,
            previous_custom_role_key: previousCustomRoleKey,
            assigned_custom_role_key: null,
            assigned_legacy_role: legacyRole,
          },
        })
      }
    }

    return jsonOk(headers, requestId, { success: true, userId, updated, assigned_custom_role_key: assignedCustomRoleKey })
  } catch (error: any) {
    return jsonErr(headers, requestId, error?.message ?? 'Unknown error', 500)
  }
})
