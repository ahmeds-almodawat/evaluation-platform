-- Ultra security hardening (DB-level)
--
-- Focus areas:
-- 1) FORCE RLS on core tables (defense in depth)
-- 2) Deterministic effective role (handles accidental multi-row roles safely)
-- 3) Prevent evaluator-side UPDATE from changing immutable evaluation fields
-- 4) Prevent self-edit of sensitive profile fields (email/department)
-- 5) Prevent deleting/demoting the last remaining admin
-- 6) Auto-maintain updated_at timestamps (data integrity)

-- -----------------------------------------------------------------------------
-- 1) FORCE RLS (defense in depth)
-- -----------------------------------------------------------------------------
alter table public.user_roles   force row level security;
alter table public.profiles     force row level security;
alter table public.departments  force row level security;
alter table public.evaluations  force row level security;

-- audit_logs may not exist in some environments; guard it.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'audit_logs'
  ) then
    execute 'alter table public.audit_logs force row level security;';
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 2) Deterministic effective role
--    If multiple role rows exist accidentally, return the highest privilege.
-- -----------------------------------------------------------------------------
create or replace function public.get_user_role(_user_id uuid)
returns public.app_role
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (
      select ur.role
      from public.user_roles ur
      where ur.user_id = _user_id
      order by case ur.role
        when 'admin' then 3
        when 'super_user' then 2
        when 'audit' then 1
        else 0
      end desc
      limit 1
    ),
    'user'::public.app_role
  );
$$;


-- -----------------------------------------------------------------------------
-- 3) Prevent evaluator-side UPDATE from changing immutable fields
--    Without this, an evaluator could "create" evaluations by editing an
--    existing pending row (changing evaluatee_id/period/type etc.).
-- -----------------------------------------------------------------------------
create or replace function public.enforce_evaluation_immutable_fields()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- Service role bypasses RLS, but we still want triggers to allow server-side operations.
  if auth.role() = 'service_role' then
    new.updated_at := now();
    return new;
  end if;

  -- Privileged roles may update any fields.
  if public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_user') then
    new.updated_at := now();
    return new;
  end if;

  -- Non-privileged evaluator may ONLY update score/comment/status fields.
  if new.evaluator_id is distinct from old.evaluator_id then
    raise exception 'Not allowed to change evaluator_id';
  end if;
  if new.evaluatee_id is distinct from old.evaluatee_id then
    raise exception 'Not allowed to change evaluatee_id';
  end if;
  if new.period is distinct from old.period then
    raise exception 'Not allowed to change period';
  end if;
  if new.evaluation_type is distinct from old.evaluation_type then
    raise exception 'Not allowed to change evaluation_type';
  end if;

  -- Status transitions: only pending -> completed allowed for non-privileged.
  -- (Matches frontend usage: pending/completed)
  if old.status = 'pending' and new.status = 'completed' then
    -- ok
  elsif new.status is distinct from old.status then
    raise exception 'Invalid status transition';
  end if;

  -- Allow scores/comment to change; maintain updated_at.
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'enforce_eval_immutable') then
    create trigger enforce_eval_immutable
    before update on public.evaluations
    for each row
    execute function public.enforce_evaluation_immutable_fields();
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 4) Prevent self-edit of sensitive profile fields (email/department)
-- -----------------------------------------------------------------------------
create or replace function public.enforce_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- Allow server-side/service role operations (e.g., Edge Functions using service key).
  if auth.role() = 'service_role' then
    new.updated_at := now();
    return new;
  end if;

  -- Admin may update anything.
  if public.has_role(auth.uid(), 'admin') then
    new.updated_at := now();
    return new;
  end if;

  -- Super user: may update any NON-admin profile.
  if public.has_role(auth.uid(), 'super_user') and not public.has_role(old.id, 'admin') then
    new.updated_at := now();
    return new;
  end if;

  -- Regular user may only update their own profile AND must not change sensitive fields.
  if auth.uid() = old.id then
    if new.email is distinct from old.email then
      raise exception 'Not allowed to change email';
    end if;
    if new.department_id is distinct from old.department_id then
      raise exception 'Not allowed to change department_id';
    end if;
    new.updated_at := now();
    return new;
  end if;

  raise exception 'Insufficient permissions to update this profile';
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'enforce_profile_sensitive') then
    create trigger enforce_profile_sensitive
    before update on public.profiles
    for each row
    execute function public.enforce_profile_sensitive_fields();
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 5) Prevent deleting/demoting the last remaining admin
-- -----------------------------------------------------------------------------
create or replace function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  admin_count int;
begin
  -- Only relevant if the row being removed/demoted is an admin role.
  if (tg_op = 'DELETE' and old.role = 'admin') or (tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin') then
    select count(*) into admin_count
    from public.user_roles
    where role = 'admin';

    if admin_count <= 1 then
      raise exception 'Cannot remove or demote the last remaining admin';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'prevent_last_admin') then
    create trigger prevent_last_admin
    before update or delete on public.user_roles
    for each row
    execute function public.prevent_last_admin_removal();
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 6) Ensure updated_at is always maintained for departments (integrity)
--    profiles/evaluations updated_at handled above via triggers.
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'touch_departments_updated_at') then
    create trigger touch_departments_updated_at
    before update on public.departments
    for each row
    execute function public.touch_updated_at();
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- Minimal explicit grants (optional hardening)
-- NOTE: Supabase often manages grants implicitly; these are safe defaults.
-- -----------------------------------------------------------------------------
revoke all on table public.user_roles from anon;
revoke all on table public.profiles from anon;
revoke all on table public.departments from anon;
revoke all on table public.evaluations from anon;

grant select on table public.departments to authenticated;
grant select, insert, update, delete on table public.user_roles to authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.evaluations to authenticated;
