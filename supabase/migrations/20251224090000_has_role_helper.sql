-- Helper: supports both custom roles and legacy roles (and won't crash if tables differ)
create or replace function public.has_role(p_role text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v boolean := false;
begin
  if auth.uid() is null then
    return false;
  end if;

  -- 1) Custom roles (recommended)
  if to_regclass('public.user_custom_roles') is not null
     and to_regclass('public.custom_roles') is not null then
    select true into v
    from public.user_custom_roles ucr
    join public.custom_roles cr on cr.id = ucr.custom_role_id
    where ucr.user_id = auth.uid()
      and cr.role_key = p_role
    limit 1;

    if v then return true; end if;
  end if;

  -- 2) Legacy roles table
  if to_regclass('public.user_roles') is not null then
    select true into v
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role::text = p_role
    limit 1;

    if v then return true; end if;
  end if;

  -- 3) Optional: profiles.role column (if exists)
  if to_regclass('public.profiles') is not null
     and exists (
       select 1 from information_schema.columns
       where table_schema='public' and table_name='profiles' and column_name='role'
     ) then
    execute format(
      'select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role::text = %L)',
      p_role
    ) into v;

    if v then return true; end if;
  end if;

  return false;
end $$;
