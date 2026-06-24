-- Auto-admin bootstrap for LOCAL/dev:
-- - If email is in allowlist -> make admin
-- - Or if no admin exists yet -> first signup becomes admin

create table if not exists public.admin_allowlist (
  email text primary key
);

create or replace function public.make_admin_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if exists (
      select 1 from public.admin_allowlist a
      where lower(a.email) = lower(new.email)
    )
    or not exists (
      select 1 from public.user_roles ur
      where ur.role = 'admin'
    )
  then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id) do update set role = 'admin';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_make_admin_on_signup on auth.users;

create trigger trg_make_admin_on_signup
after insert on auth.users
for each row
execute function public.make_admin_on_auth_user_created();