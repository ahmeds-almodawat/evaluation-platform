begin;

-- 1) Function that runs when a new auth user is created
create or replace function public.handle_new_auth_user_create_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name_en text;
  v_name_ar text;
begin
  -- Derive names safely
  v_name_en := coalesce(
    new.raw_user_meta_data->>'name_en',
    split_part(new.email, '@', 1),
    new.email
  );

  v_name_ar := coalesce(
    new.raw_user_meta_data->>'name_ar',
    'مستخدم'
  );

  -- Create profile (name_ar is NOT NULL in your schema)
  insert into public.profiles (
    id, email, name_en, name_ar, is_active, created_at, updated_at
  )
  values (
    new.id, new.email, v_name_en, v_name_ar, true, now(), now()
  )
  on conflict (id) do nothing;

  -- Optional: assign a default custom role (recommended)
  -- This ensures RBAC never returns false just because a role row is missing.
  -- Requires that custom role_key 'user' exists in custom_roles (you already enforce that).
  insert into public.user_custom_roles (user_id, role_key)
  values (new.id, 'user')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- 2) Trigger on auth.users
drop trigger if exists on_auth_user_created_create_profile on auth.users;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_auth_user_create_profile();

commit;
