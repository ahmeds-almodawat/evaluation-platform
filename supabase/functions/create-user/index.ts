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

serve(async (req) => {
  const origin = req.headers.get('Origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    if (!isOriginAllowed(origin)) {
      return new Response('CORS origin not allowed', { status: 403, headers })
    }
    return new Response('ok', { status: 200, headers })
  }

  if (!isOriginAllowed(origin)) {
    return new Response(JSON.stringify({ error: 'CORS origin not allowed', origin }), {
      status: 403,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing Supabase environment variables' }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')

    const {
      data: { user: currentUser },
      error: userError,
    } = await adminClient.auth.getUser(token)

    if (userError || !currentUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    // Permission check (canonical signature)
    const { data: canManageUsers, error: permErr } = await adminClient.rpc('has_permission', {
      p_permission: 'users.manage',
      p_user_id: currentUser.id,
    })

    if (permErr) {
      return new Response(JSON.stringify({ error: 'Permission check failed', details: permErr }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    if (!canManageUsers) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    // Parse body safely
    let body: any = null
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '').trim()
    const updateExisting = Boolean(body.updateExisting ?? body.update_existing)

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    if (!updateExisting && !password) {
      return new Response(JSON.stringify({ error: 'Password is required' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const nameEn = String(body.nameEn ?? body.name_en ?? '').trim()
    const nameAr = String(body.nameAr ?? body.name_ar ?? '').trim()
    const departmentId =
      (body.departmentId ?? body.department_id) ? String(body.departmentId ?? body.department_id).trim() : null
    const staffId = (body.staffId ?? body.staff_id) ? String(body.staffId ?? body.staff_id).trim() : null
    const phone = (body.phone ?? body.phone_number) ? String(body.phone ?? body.phone_number).trim() : null
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : undefined
    const position = body.position !== undefined && body.position !== null ? String(body.position).trim() : undefined

    if (!nameEn) {
      return new Response(JSON.stringify({ error: 'Missing required field: name_en' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const legacyRole = sanitizeLegacyRole(body.role ?? body.userRole ?? 'user')

    const hasCustomRoleKeyField = Object.prototype.hasOwnProperty.call(body, 'custom_role_key')
    const rawCustomRoleKey = hasCustomRoleKeyField ? body.custom_role_key : undefined
    const customRoleKey = hasCustomRoleKeyField ? sanitizeCustomRoleKey(rawCustomRoleKey) : null

    // Lookup existing user id by email (your project already has this RPC)
    const { data: existingUserId, error: lookupErr } = await adminClient.rpc('get_auth_user_id_by_email', {
      p_email: email,
    })

    if (lookupErr) {
      return new Response(JSON.stringify({ error: 'Email lookup failed', details: lookupErr }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    let userId: string | null = existingUserId
    let updated = false

    if (userId) {
      if (!updateExisting) {
        return new Response(JSON.stringify({ error: 'User already exists' }), {
          status: 409,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }

      if (password) {
        const { error: updErr } = await adminClient.auth.admin.updateUserById(userId, { password })
        if (updErr) {
          return new Response(JSON.stringify({ error: 'Failed to update user password', details: updErr }), {
            status: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
          })
        }
      }

      updated = true
    } else {
      const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (createErr || !created?.user?.id) {
        return new Response(JSON.stringify({ error: 'Failed to create user', details: createErr }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }

      userId = created.user.id
      updated = false
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

    const { error: profileErr } = await adminClient.from('profiles').upsert(profilePayload, { onConflict: 'id' })
    if (profileErr) {
      return new Response(JSON.stringify({ error: 'Failed to upsert profile', details: profileErr }), {
        status: 500,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    // ---- Custom role resolution (case-insensitive) ----
    let assignedCustomRoleKey: string | null = null

    if (hasCustomRoleKeyField && customRoleKey) {
      // Fetch only role_key list and resolve case-insensitive
      const { data: roles, error: rolesErr } = await adminClient.from('custom_roles').select('role_key')
      if (rolesErr) {
        return new Response(JSON.stringify({ error: 'Role lookup failed', details: rolesErr }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }

      const wanted = String(customRoleKey).trim().toLowerCase()
      const matched = (roles || []).find(
        (r: any) => String(r.role_key).trim().toLowerCase() === wanted,
      )

      if (!matched?.role_key) {
        return new Response(JSON.stringify({ error: `Invalid custom_role_key: ${customRoleKey}` }), {
          status: 400,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }

      assignedCustomRoleKey = String(matched.role_key).trim()

      const { error: ucrErr } = await adminClient
        .from('user_custom_roles')
        .upsert({ user_id: userId, role_key: assignedCustomRoleKey }, { onConflict: 'user_id' })

      if (ucrErr) {
        return new Response(JSON.stringify({ error: 'Failed to assign custom role', details: ucrErr }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }

      // Trigger will sync legacy role automatically.
    } else if (hasCustomRoleKeyField && !customRoleKey) {
      // Explicit clear
      const { error: delErr } = await adminClient.from('user_custom_roles').delete().eq('user_id', userId)
      if (delErr) {
        return new Response(JSON.stringify({ error: 'Failed to clear custom role', details: delErr }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }

      // Apply legacy fallback (compat)
      const { error: legacyErr } = await adminClient
        .from('user_roles')
        .upsert({ user_id: userId, role: legacyRole }, { onConflict: 'user_id' })

      if (legacyErr) {
        return new Response(JSON.stringify({ error: 'Failed to upsert legacy role', details: legacyErr }), {
          status: 500,
          headers: { ...headers, 'Content-Type': 'application/json' },
        })
      }
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
          return new Response(JSON.stringify({ error: 'Failed to upsert legacy role', details: legacyErr }), {
            status: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, userId, updated, assigned_custom_role_key: assignedCustomRoleKey }),
      {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error?.message ?? 'Unknown error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
