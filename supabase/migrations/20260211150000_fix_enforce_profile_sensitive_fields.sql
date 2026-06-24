begin;

-- Replace function with a safer, RBAC-aware version
create or replace function public.enforce_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_jwt_role text := coalesce(auth.jwt() ->> 'role', '');
  v_is_service boolean := (v_jwt_role = 'service_role');
  v_is_admin boolean := false;
begin
  -- 1) Service role bypass (Edge Functions / admin jobs)
  if v_is_service then
    return new;
  end if;

  -- 2) Admin/HR bypass via permission (Clean RBAC)
  -- If auth.uid() is null (SQL editor), allow as maintenance.
  if v_uid is null then
    return new;
  end if;

  v_is_admin := public.has_permission('users.manage', v_uid);

  if v_is_admin then
    return new;
  end if;

  -- 3) Non-admin: must be editing own profile only
  if new.id <> v_uid then
    raise exception 'Insufficient permissions to update this profile';
  end if;

  -- 4) Non-admin: block sensitive fields from being changed
  -- Adjust this list to match your schema.
  if (
    coalesce(new.email, '') <> coalesce(old.email, '')
    or coalesce(new.staff_id, '') <> coalesce(old.staff_id, '')
    or coalesce(new.department_id::text, '') <> coalesce(old.department_id::text, '')
    or coalesce(new.is_active::text, '') <> coalesce(old.is_active::text, '')
  ) then
    raise exception 'Insufficient permissions to update this profile';
  end if;

  -- Allow normal users to change safe fields (example)
  -- name_en/name_ar/phone/position can be updated by the user themself.
  return new;
end;
$$;

commit;
