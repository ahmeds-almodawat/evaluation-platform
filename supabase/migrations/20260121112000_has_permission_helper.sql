-- RBAC helper used by RLS policies and edge functions.
--
-- IMPORTANT:
-- 1) Keep this signature + parameter names stable because RLS policies can depend
--    on the exact function signature.
-- 2) We provide a convenience 1-arg overload for callers that only pass a
--    permission string.
-- 3) We intentionally do NOT reference columns/tables that may not exist in some
--    variants of the project (e.g., user_custom_roles, rp.is_granted, etc.).

create or replace function public.has_permission(
  p_user_id uuid,
  p_permission text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Explicit deny wins
  if exists (
    select 1
    from public.user_permissions up
    where up.user_id = p_user_id
      and up.permission = p_permission
      and up.is_granted = false
  ) then
    return false;
  end if;

  -- 2) Explicit grant
  if exists (
    select 1
    from public.user_permissions up
    where up.user_id = p_user_id
      and up.permission = p_permission
      and up.is_granted = true
  ) then
    return true;
  end if;

  -- 3) Role-based permissions (role name string)
  return exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp
      on rp.role = ur.role
    where ur.user_id = p_user_id
      and rp.permission = p_permission
  );
end;
$$;

-- Convenience overload: use current auth user
create or replace function public.has_permission(
  p_permission text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_permission);
$$;
