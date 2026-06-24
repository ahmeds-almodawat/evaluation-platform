-- Security hardening + audit triggers
-- Safe to run on a fresh project; on existing, review before applying.

-- 1) Audit logs: allow system actions (service role / dashboard) to write logs
-- NOTE: audit_logs table may not exist yet in a fresh DB; guard all policy/table operations.
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    -- allow system actions to write logs even when actor_user_id is null
    alter table public.audit_logs alter column actor_user_id drop not null;

    -- replace insert policy safely
    execute 'drop policy if exists "audit_logs_insert_own" on public.audit_logs';
    execute 'drop policy if exists "audit_logs_insert" on public.audit_logs';

    execute $pol$
      create policy "audit_logs_insert" on public.audit_logs
      for insert to authenticated
      with check (
        actor_user_id = auth.uid()
        OR exists (
          select 1 from public.user_roles ur
          where ur.user_id = auth.uid()
            and ur.role in ('admin','super_user','audit')
        )
      )
    $pol$;
  end if;
end $$;

-- 2) Helper function to write audit logs (bypasses RLS)
create or replace function public.write_audit_log(
  _action text,
  _entity_type text,
  _entity_id uuid,
  _metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(actor_user_id, actor_email, action, entity_type, entity_id, metadata)
  values (
    auth.uid(),
    (select email from public.profiles where id = auth.uid()),
    _action,
    _entity_type,
    _entity_id,
    coalesce(_metadata, '{}'::jsonb)
  );
exception
  when others then
    -- never fail the main transaction because audit logging failed
    null;
end;
$$;

-- 3) Generic audit trigger function
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  _id := coalesce((case when tg_op = 'DELETE' then old.id else new.id end), null);

  perform public.write_audit_log(
    tg_op || ':' || tg_table_name,
    tg_table_name,
    _id,
    jsonb_build_object(
      'table', tg_table_name,
      'op', tg_op,
      'at', now()
    )
  );
  return coalesce(new, old);
end;
$$;

-- 4) Attach audit triggers to key tables
do $$
begin
  -- departments
  if not exists (select 1 from pg_trigger where tgname = 'audit_departments') then
    create trigger audit_departments
    after insert or update or delete on public.departments
    for each row execute function public.audit_trigger();
  end if;

  -- profiles
  if not exists (select 1 from pg_trigger where tgname = 'audit_profiles') then
    create trigger audit_profiles
    after insert or update or delete on public.profiles
    for each row execute function public.audit_trigger();
  end if;

  -- user_roles
  if not exists (select 1 from pg_trigger where tgname = 'audit_user_roles') then
    create trigger audit_user_roles
    after insert or update or delete on public.user_roles
    for each row execute function public.audit_trigger();
  end if;

  -- evaluations
  if not exists (select 1 from pg_trigger where tgname = 'audit_evaluations') then
    create trigger audit_evaluations
    after insert or update or delete on public.evaluations
    for each row execute function public.audit_trigger();
  end if;
end $$;

-- 5) RLS hardening: limit profile visibility to self/same-department unless privileged
drop policy if exists "Users can view all profiles" on public.profiles;
create policy "Users can view own or same-department profiles" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  OR has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'super_user')
  OR has_role(auth.uid(), 'audit')
  OR department_id = (select p.department_id from public.profiles p where p.id = auth.uid())
);

-- 6) RLS hardening: enforce evaluation permissions
-- Drop permissive insert policy (if present) and re-create a stricter one
drop policy if exists "Admin and super_user can create evaluations for anyone" on public.evaluations;
create policy "Create evaluations with department rules" on public.evaluations
for insert to authenticated
with check (
  -- Admin / super_user can create for anyone
  has_role(auth.uid(), 'admin')
  OR has_role(auth.uid(), 'super_user')
  OR (
    evaluator_id = auth.uid()
    AND (
      -- Same department evaluations
      (
        coalesce(evaluation_type, 'same') = 'same'
        AND (select p1.department_id from public.profiles p1 where p1.id = auth.uid())
            = (select p2.department_id from public.profiles p2 where p2.id = evaluatee_id)
      )
      OR
      -- Cross department (Managers-only) when departments are linked
      (
        coalesce(evaluation_type, '') like 'cross%'
        AND (select p1.position from public.profiles p1 where p1.id = auth.uid()) = 'Manager'
        AND (select p2.position from public.profiles p2 where p2.id = evaluatee_id) = 'Manager'
        AND public.departments_are_linked(
          (select p1.department_id from public.profiles p1 where p1.id = auth.uid()),
          (select p2.department_id from public.profiles p2 where p2.id = evaluatee_id)
        )
      )
    )
  )
);
