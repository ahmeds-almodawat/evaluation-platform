-- Fix has_permission() overload ambiguity and remove references to non-existing columns.
--
-- Symptoms this resolves:
-- 1) PostgREST ambiguity: "Could not choose the best candidate function"
--    when both (uuid,text) and (text,uuid) variants exist.
-- 2) Edge Function failures that surfaced as "rp.is_granted does not exist" or
--    similar schema mismatches.
--
-- Strategy:
-- - Keep the canonical policy signature: has_permission(p_user_id uuid, p_permission text)
-- - Provide a safe convenience overload: has_permission(p_permission text)
-- - Drop the problematic swapped-arg overload: has_permission(p_permission text, p_user_id uuid)

-- 1) Remove swapped-argument overload (this is the one that causes ambiguity)
drop function if exists public.has_permission(text, uuid);

-- 2) Canonical RBAC helper (policy-safe signature)
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
  -- explicit deny wins
  if exists (
    select 1
    from public.user_permissions up
    where up.user_id = p_user_id
      and up.permission = p_permission
      and up.is_granted = false
  ) then
    return false;
  end if;

  -- explicit grant
  if exists (
    select 1
    from public.user_permissions up
    where up.user_id = p_user_id
      and up.permission = p_permission
      and up.is_granted = true
  ) then
    return true;
  end if;

  -- role permissions
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

-- 3) Convenience overload for common usage in policies/calls
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
