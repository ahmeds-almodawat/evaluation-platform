begin;

create or replace function public.rbac_debug_me()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object(
      'uid', null,
      'error', 'auth.uid() is null (not running as authenticated user)'
    );
  end if;

  return jsonb_build_object(
    'uid', v_uid,
    'custom_role_key', (
      select ucr.role_key
      from public.user_custom_roles ucr
      where ucr.user_id = v_uid
      limit 1
    ),
    'legacy_role', (
      select ur.role::text
      from public.user_roles ur
      where ur.user_id = v_uid
      limit 1
    ),
    'permissions', coalesce((
      select jsonb_agg(crp.permission order by crp.permission)
      from public.user_custom_roles ucr
      join public.custom_role_permissions crp on crp.role_key = ucr.role_key
      where ucr.user_id = v_uid
    ), '[]'::jsonb),
    'can_send', public.has_permission('evaluations.send', v_uid),
    'can_manage', public.has_permission('evaluations.manage', v_uid)
  );
end;
$$;

grant execute on function public.rbac_debug_me() to authenticated;

commit;
