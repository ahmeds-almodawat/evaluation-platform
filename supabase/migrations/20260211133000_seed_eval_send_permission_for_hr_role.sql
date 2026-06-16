begin;

insert into public.custom_role_permissions(role_key, permission)
values ('test', 'evaluations.send')
on conflict do nothing;

commit;
