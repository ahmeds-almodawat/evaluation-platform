-- Fix RBAC + auth helpers

-- Remove overloads that cause PostgREST ambiguity
DROP FUNCTION IF EXISTS public.has_permission(text);
DROP FUNCTION IF EXISTS public.has_permission(text, uuid);

-- Canonical function signature used by RLS + Edge Functions
CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- explicit deny wins
  IF EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
      AND up.permission = p_permission
      AND up.is_granted = false
  ) THEN
    RETURN false;
  END IF;

  -- explicit grant
  IF EXISTS (
    SELECT 1
    FROM public.user_permissions up
    WHERE up.user_id = p_user_id
      AND up.permission = p_permission
      AND up.is_granted = true
  ) THEN
    RETURN true;
  END IF;

  -- role-based permission
  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.role_permissions rp
      ON rp.role = ur.role
    WHERE ur.user_id = p_user_id
      AND rp.permission = p_permission
  );
END;
$$;

-- Helper: lookup auth user id by email (used by create-user Edge Function)
CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_email(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_email(text) TO authenticated, service_role;
