-- Compatibility fix for RBAC helper used by Edge Functions.
-- Keeps the signature expected by Edge Functions:
--   has_permission(p_permission text, p_user_id uuid DEFAULT auth.uid())
-- and avoids referencing non-existent columns (rp.is_granted, rp.role_id, etc.)

-- Drop ALL known signatures (some projects had older arg orders/names)
DROP FUNCTION IF EXISTS public.has_permission(text, uuid);
DROP FUNCTION IF EXISTS public.has_permission(uuid, text);
DROP FUNCTION IF EXISTS public.has_permission(text);

CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_has_user_permissions boolean;
  v_has_user_permissions_is_granted boolean;
  v_has_user_permissions_updated_at boolean;
  v_has_user_roles_role boolean;
  v_has_user_roles_role_id boolean;
  v_has_role_permissions_role boolean;
  v_has_role_permissions_role_id boolean;
  v_has_role_permissions_permission boolean;
  v_has_role_permissions_permission_code boolean;
  v_granted boolean;
BEGIN
  IF v_user_id IS NULL OR p_permission IS NULL OR btrim(p_permission) = '' THEN
    RETURN FALSE;
  END IF;

  -- ---- User-level overrides (allow/deny) -------------------------------
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_permissions'
  ) INTO v_has_user_permissions;

  IF v_has_user_permissions THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_permissions' AND column_name='is_granted'
    ) INTO v_has_user_permissions_is_granted;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_permissions' AND column_name='updated_at'
    ) INTO v_has_user_permissions_updated_at;

    IF v_has_user_permissions_is_granted THEN
      -- pick the newest row (some schemas have updated_at, some don't)
      IF v_has_user_permissions_updated_at THEN
        SELECT up.is_granted
          INTO v_granted
        FROM public.user_permissions up
        WHERE up.user_id = v_user_id AND up.permission = p_permission
        ORDER BY up.updated_at DESC NULLS LAST, up.created_at DESC
        LIMIT 1;
      ELSE
        SELECT up.is_granted
          INTO v_granted
        FROM public.user_permissions up
        WHERE up.user_id = v_user_id AND up.permission = p_permission
        ORDER BY up.created_at DESC
        LIMIT 1;
      END IF;

      IF v_granted IS NOT NULL THEN
        RETURN v_granted;
      END IF;
    ELSE
      -- legacy: existence means granted
      IF EXISTS (
        SELECT 1 FROM public.user_permissions up
        WHERE up.user_id = v_user_id AND up.permission = p_permission
      ) THEN
        RETURN TRUE;
      END IF;
    END IF;
  END IF;

  -- ---- Role-based grants ------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_roles'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_roles' AND column_name='role'
  ) INTO v_has_user_roles_role;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_roles'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='user_roles' AND column_name='role_id'
  ) INTO v_has_user_roles_role_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='role_permissions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='role_permissions' AND column_name='role'
  ) INTO v_has_role_permissions_role;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='role_permissions'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='role_permissions' AND column_name='role_id'
  ) INTO v_has_role_permissions_role_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='role_permissions' AND column_name='permission'
  ) INTO v_has_role_permissions_permission;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='role_permissions' AND column_name='permission_code'
  ) INTO v_has_role_permissions_permission_code;

  -- 1) common schema: user_roles.role (text) + role_permissions.role (text) + role_permissions.permission (text)
  IF v_has_user_roles_role AND v_has_role_permissions_role AND v_has_role_permissions_permission THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.role_permissions rp
        ON rp.role = ur.role
      WHERE ur.user_id = v_user_id
        AND rp.permission = p_permission
    );
  END IF;

  -- 2) alternative schema: user_roles.role_id (uuid) + role_permissions.role_id (uuid)
  IF v_has_user_roles_role_id AND v_has_role_permissions_role_id THEN
    IF v_has_role_permissions_permission_code THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp
          ON rp.role_id = ur.role_id
        WHERE ur.user_id = v_user_id
          AND rp.permission_code = p_permission
      );
    ELSIF v_has_role_permissions_permission THEN
      RETURN EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp
          ON rp.role_id = ur.role_id
        WHERE ur.user_id = v_user_id
          AND rp.permission = p_permission
      );
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- Make it callable from Edge Function service role (and others if needed)
GRANT EXECUTE ON FUNCTION public.has_permission(text, uuid) TO anon, authenticated, service_role;
