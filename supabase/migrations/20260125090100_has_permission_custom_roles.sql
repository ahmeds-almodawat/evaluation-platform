-- Patch: extend has_permission() to support custom RBAC roles (user_custom_roles/custom_role_permissions)
-- and profiles.role fallback. Keeps legacy behavior intact.

create or replace function public.has_permission(p_user_id uuid, p_permission text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  up_override boolean;
begin
  if p_user_id is null then
    return false;
  end if;

  -- 1) User-specific override (allow/deny)
  if to_regclass('public.user_permissions') is not null then
    select up.is_granted into up_override
    from public.user_permissions up
    where up.user_id = p_user_id
      and up.permission = p_permission
    limit 1;

    if up_override is not null then
      return up_override;
    end if;
  end if;

  -- 2) Legacy roles via user_roles + role_permissions
  if to_regclass('public.user_roles') is not null and to_regclass('public.role_permissions') is not null then
    if exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role = ur.role
      where ur.user_id = p_user_id
        and rp.permission = p_permission
        and rp.is_granted = true
    ) then
      return true;
    end if;
  end if;

  -- 3) Custom roles via user_custom_roles + custom_role_permissions
  if to_regclass('public.user_custom_roles') is not null and to_regclass('public.custom_role_permissions') is not null then
    if exists (
      select 1
      from public.user_custom_roles ucr
      join public.custom_role_permissions crp on crp.role_key = ucr.role_key
      where ucr.user_id = p_user_id
        and crp.permission = p_permission
        and crp.is_granted = true
    ) then
      return true;
    end if;
  end if;

  -- 4) Fallback: profiles.role (if present) can act as either legacy role name or custom role_key
  if to_regclass('public.profiles') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'profiles'
         and column_name = 'role'
     )
  then
    if to_regclass('public.role_permissions') is not null then
      if exists (
        select 1
        from public.profiles p
        join public.role_permissions rp on rp.role = p.role::text
        where p.id = p_user_id
          and rp.permission = p_permission
          and rp.is_granted = true
      ) then
        return true;
      end if;
    end if;

    if to_regclass('public.custom_role_permissions') is not null then
      if exists (
        select 1
        from public.profiles p
        join public.custom_role_permissions crp on crp.role_key = p.role::text
        where p.id = p_user_id
          and crp.permission = p_permission
          and crp.is_granted = true
      ) then
        return true;
      end if;
    end if;
  end if;

  return false;
end;
$$;
