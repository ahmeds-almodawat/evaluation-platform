-- rbac has_permission cleanup:
-- 1) Remove the ambiguous overload (text, uuid) if it exists
-- 2) Define the canonical function as (uuid, text) with argnames: p_user_id, p_permission
-- 3) Keep a 1-arg convenience wrapper (text) for legacy calls

begin;

-- 1) Drop ONLY the problematic overload that causes ambiguity
drop function if exists public.has_permission(text, uuid);

-- 2) Canonical function: (uuid, text)
-- IMPORTANT: keep parameter names p_user_id, p_permission to avoid "cannot change name of input parameter"
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

  -- role permissions (role_permissions has columns: role, permission)
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

-- 3) Legacy wrapper: has_permission(text) -> uses auth.uid()
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

commit;
