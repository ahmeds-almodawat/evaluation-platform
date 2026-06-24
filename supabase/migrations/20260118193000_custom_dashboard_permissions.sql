-- Add permissions for Custom Dashboards (enterprise feature)

-- Best-effort: only runs if permissions table exists.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'permissions') then
    insert into public.permissions (code, name) values
      ('dashboards.custom.view', 'View Custom Dashboards'),
      ('dashboards.custom.create', 'Create Custom Dashboards'),
      ('dashboards.custom.edit', 'Edit Custom Dashboards'),
      ('dashboards.custom.share', 'Share Custom Dashboards'),
      ('dashboards.custom.export', 'Export Custom Dashboards')
    on conflict (code) do nothing;
  end if;
end $$;

-- Grant defaults (admin/super_user)
do $$
declare
  admin_role_id uuid;
  su_role_id uuid;
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='role_permissions')
     and exists (select 1 from information_schema.tables where table_schema='public' and table_name='roles')
     and exists (select 1 from information_schema.tables where table_schema='public' and table_name='permissions') then

    select id into admin_role_id from public.roles where code = 'admin' limit 1;
    select id into su_role_id from public.roles where code = 'super_user' limit 1;

    insert into public.role_permissions (role_id, permission_code)
      select admin_role_id, p.code from public.permissions p
      where p.code like 'dashboards.custom.%'
    on conflict do nothing;

    insert into public.role_permissions (role_id, permission_code)
      select su_role_id, p.code from public.permissions p
      where p.code like 'dashboards.custom.%'
    on conflict do nothing;
  end if;
end $$;
