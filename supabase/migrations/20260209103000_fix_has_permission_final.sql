-- Final fix for RBAC helper used by Edge Functions.
-- Aligns function parameter name with Edge Function payload: p_permission.
-- Removes references to non-existent columns like rp.is_granted or rp.role_id.

-- Drop any prior signatures to avoid "cannot change name of input parameter".
DROP FUNCTION IF EXISTS public.has_permission(text, uuid);
DROP FUNCTION IF EXISTS public.has_permission(text);

CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      EXISTS (
        -- Role-based permissions
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp
          ON rp.role = ur.role
        WHERE ur.user_id = p_user_id
          AND rp.permission = p_permission
      )
      OR
      EXISTS (
        -- Per-user overrides
        SELECT 1
        FROM public.user_permissions up
        WHERE up.user_id = p_user_id
          AND up.permission = p_permission
          AND COALESCE(up.is_granted, true) = true
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO anon, authenticated, service_role;
