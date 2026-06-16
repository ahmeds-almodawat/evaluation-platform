begin;

-- Replace this UUID with the real user id (auth.uid of the logged-in user)
-- You can get it from rbac_debug_me() output.
insert into public.user_custom_roles (user_id, role_key)
values ('7f2b19e0-f6d7-4326-bafd-3e1769c3f6cf', 'test')
on conflict (user_id) do update
set role_key = excluded.role_key;

commit;
