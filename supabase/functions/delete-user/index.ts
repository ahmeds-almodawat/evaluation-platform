import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface DeleteUserRequest {
  user_id: string
}

type AppRole = 'admin' | 'audit' | 'super_user' | 'user'

const VALID_ROLES: AppRole[] = ['admin', 'audit', 'super_user', 'user']

const ROLE_PRIORITY: Record<AppRole, number> = {
  user: 0,
  audit: 1,
  super_user: 2,
  admin: 3,
}

function isValidRole(role: unknown): role is AppRole {
  return typeof role === 'string' && (VALID_ROLES as string[]).includes(role)
}

function highestRole(roles: unknown[]): AppRole {
  let best: AppRole = 'user'
  for (const r of roles) {
    if (!isValidRole(r)) continue
    if (ROLE_PRIORITY[r] > ROLE_PRIORITY[best]) best = r
  }
  return best
}

async function writeAuditLog(
  adminClient: ReturnType<typeof createClient>,
  actor: { id: string; email?: string | null },
  action: string,
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, unknown> = {}
) {
  try {
    await adminClient.from('audit_logs').insert({
      actor_user_id: actor.id,
      actor_email: actor.email ?? null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata,
    })
  } catch {
    // Best-effort only
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }


  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey =
      Deno.env.get('SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
      Deno.env.get('SUPABASE_SERVICE_ROLE_JWT') ??
      Deno.env.get('SERVICE_ROLE_JWT') ??
      ''

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'SERVER_MISCONFIG: Missing SERVICE_ROLE_KEY or SUPABASE_URL' }), {
        status: 500,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get the authorization header from the request
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Extract the token from the Authorization header
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the token and get the user
    const { data: { user: currentUser }, error: userError } = await adminClient.auth.getUser(token)
    if (userError || !currentUser) {
      console.error('Auth error:', userError)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Authenticated user:', currentUser.id)

    // Permission check: supports both legacy roles and custom roles via has_permission()
    const { data: canManageUsers, error: permErr } = await adminClient.rpc('has_permission', {
      p_user_id: currentUser.id,
      p_permission: 'users.manage',
    })

    if (permErr) {
      console.error('Permission check failed:', permErr)
      return new Response(JSON.stringify({ error: 'Permission check failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!canManageUsers) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Legacy role lookup is still used for strict rules around legacy admin users.
    const { data: requesterRoleRows, error: requesterRoleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)

    if (requesterRoleError) {
      console.error('Role lookup failed:', requesterRoleError)
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const requesterRole = highestRole((requesterRoleRows || []).map((r) => r.role))
    const isRequesterAdmin = requesterRole === 'admin'

    // Parse request body
    const body: DeleteUserRequest = await req.json()
    if (!body?.user_id) {
      return new Response(JSON.stringify({ error: 'Missing user_id' }), {
        status: 400,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('Archiving user (soft delete):', body.user_id)

    await writeAuditLog(
      adminClient,
      { id: currentUser.id, email: currentUser.email },
      'USER_ARCHIVE_ATTEMPT',
      'profiles',
      body.user_id,
      {
        requesterEffectiveRole: requesterRole,
      }
    )

    // Prevent deleting yourself
    if (body.user_id === currentUser.id) {
      return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), {
        status: 400,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HARD RULE: only admins may delete admin users
    const { data: targetRoleRows, error: targetRoleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', body.user_id)

    if (targetRoleError) {
      console.error('Target role lookup failed:', targetRoleError)
      return new Response(JSON.stringify({ error: 'Failed to read target user role' }), {
        status: 400,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const targetEffectiveRole = highestRole((targetRoleRows || []).map((r) => r.role))
    if (!isRequesterAdmin && targetEffectiveRole === 'admin') {
      return new Response(JSON.stringify({ error: 'Only admins can delete admin users' }), {
        status: 403,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Soft delete: mark profile as deleted and deactivate the account.
    // We intentionally keep auth.users record to preserve evaluation history and allow restore.
    const nowIso = new Date().toISOString()
    const { error: archiveErr } = await adminClient
      .from('profiles')
      .update({ deleted_at: nowIso, is_active: false })
      .eq('id', body.user_id)

    if (archiveErr) {
      console.error('Error archiving user:', archiveErr)
      return new Response(JSON.stringify({ error: archiveErr.message }), {
        status: 400,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('User archived successfully:', body.user_id)

    await writeAuditLog(
      adminClient,
      { id: currentUser.id, email: currentUser.email },
      'USER_ARCHIVE',
      'profiles',
      body.user_id,
      {
        requesterEffectiveRole: requesterRole,
        targetEffectiveRole,
        deleted_at: nowIso,
      }
    )

    return new Response(
      JSON.stringify({
        success: true,
        message: 'User archived successfully',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, ...corsHeaders, ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
