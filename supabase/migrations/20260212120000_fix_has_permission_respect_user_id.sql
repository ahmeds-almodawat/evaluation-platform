begin;

-- Create/replace canonical function: has_permission(permission, user_id default auth.uid())
create or replace function public.has_permission(
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_custom_roles ucr
    join public.custom_role_permissions crp
      on crp.role_key = ucr.role_key
    where ucr.user_id = p_user_id
      and crp.permission = p_permission
  )
  -- legacy safety fallback (optional but helps while legacy is still “deep”)
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role in ('admin','super_user')
  );
$$;

commit;
