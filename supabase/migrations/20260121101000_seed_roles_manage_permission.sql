-- Seed roles.manage permission for admin (idempotent)

begin;

insert into public.role_permissions(role, permission)
values ('admin'::public.app_role, 'roles.manage')
on conflict do nothing;

commit;
