-- Seed admin allowlist (local/dev)
insert into public.admin_allowlist(email)
values ('ahmed.s@alyahyas.com')
on conflict (email) do nothing;