-- Security, RLS & E2E Validation Patch
-- Purpose:
-- - Add catalog-level security validation helpers.
-- - Harden profile sensitive-field trigger for new org-unit fields.
-- - Tighten manager assignment visibility without changing existing data.
-- - Keep this migration additive and safe for already-applied databases.

begin;

-- 1) Extend the existing profile sensitive-field guard to protect the new
--    organizational assignment fields from self-editing.
create or replace function public.enforce_profile_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  -- Allow server-side/service role operations, such as Edge Functions using the service key.
  if auth.role() = 'service_role' then
    new.updated_at := now();
    return new;
  end if;

  -- Admin may update anything.
  if public.has_role(auth.uid(), 'admin') then
    new.updated_at := now();
    return new;
  end if;

  -- Super user may update any non-admin profile.
  if public.has_role(auth.uid(), 'super_user') and not public.has_role(old.id, 'admin') then
    new.updated_at := now();
    return new;
  end if;

  -- Regular users may only update their own non-sensitive profile details.
  if auth.uid() = old.id then
    if new.email is distinct from old.email then
      raise exception 'Not allowed to change email';
    end if;
    if new.department_id is distinct from old.department_id then
      raise exception 'Not allowed to change department_id';
    end if;
    if new.unit_id is distinct from old.unit_id then
      raise exception 'Not allowed to change unit_id';
    end if;
    if new.direct_manager_id is distinct from old.direct_manager_id then
      raise exception 'Not allowed to change direct_manager_id';
    end if;

    new.updated_at := now();
    return new;
  end if;

  raise exception 'Insufficient permissions to update this profile';
end;
$$;

-- Ensure the trigger exists even if the earlier hardening migration was skipped in a dev database.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'enforce_profile_sensitive') then
    create trigger enforce_profile_sensitive
    before update on public.profiles
    for each row
    execute function public.enforce_profile_sensitive_fields();
  end if;
end $$;

-- 2) Tighten manager assignment read visibility.
--    Department managers / admins / report roles can read broadly; normal employees can read
--    active assignments in their own department so Team -> Manager campaigns and labels still work.
drop policy if exists manager_unit_assignments_select_authenticated on public.manager_unit_assignments;
drop policy if exists manager_unit_assignments_select_scoped on public.manager_unit_assignments;

create policy manager_unit_assignments_select_scoped
on public.manager_unit_assignments
for select
to authenticated
using (
  public.can_manage_org_structure(auth.uid())
  or public.has_role(auth.uid(), 'audit')
  or public.has_permission('reports.view', auth.uid())
  or manager_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.department_id = manager_unit_assignments.department_id
  )
);

-- 3) Security baseline report: returns findings without changing data.
create or replace function public.security_rls_baseline_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_missing_rls jsonb;
  v_public_write_policies jsonb;
  v_custom_role_write_policies jsonb;
  v_evaluations_duplicate_constraint boolean;
  v_profile_trigger boolean;
  v_campaign_unique boolean;
begin
  select coalesce(jsonb_agg(jsonb_build_object('table', c.relname)), '[]'::jsonb)
  into v_missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'profiles',
      'departments',
      'evaluations',
      'evaluation_answers',
      'evaluation_campaigns',
      'org_units',
      'manager_unit_assignments',
      'custom_roles',
      'custom_role_permissions',
      'user_custom_roles',
      'monthly_employee_scores',
      'monthly_department_scores',
      'monthly_unit_scores'
    )
    and c.relkind = 'r'
    and not c.relrowsecurity;

  select coalesce(jsonb_agg(jsonb_build_object(
    'table', tablename,
    'policy', policyname,
    'cmd', cmd,
    'qual', qual,
    'with_check', with_check
  )), '[]'::jsonb)
  into v_public_write_policies
  from pg_policies
  where schemaname = 'public'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and (
      coalesce(qual, '') ~* '\btrue\b'
      or coalesce(with_check, '') ~* '\btrue\b'
    )
    and tablename in (
      'profiles',
      'evaluations',
      'evaluation_answers',
      'evaluation_campaigns',
      'org_units',
      'manager_unit_assignments',
      'custom_roles',
      'custom_role_permissions',
      'user_custom_roles'
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'table', tablename,
    'policy', policyname,
    'cmd', cmd,
    'qual', qual,
    'with_check', with_check
  )), '[]'::jsonb)
  into v_custom_role_write_policies
  from pg_policies
  where schemaname = 'public'
    and tablename in ('custom_roles', 'custom_role_permissions', 'user_custom_roles')
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    and not (
      coalesce(qual, '') ilike '%is_admin_user%'
      or coalesce(with_check, '') ilike '%is_admin_user%'
    );

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'evaluations'
      and indexname = 'evaluations_campaign_pair_unique_idx'
  ) into v_evaluations_duplicate_constraint;

  select exists (
    select 1 from pg_trigger
    where tgname = 'enforce_profile_sensitive'
      and not tgisinternal
  ) into v_profile_trigger;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'evaluation_campaigns'
      and indexname = 'idx_evaluation_campaigns_period_type'
  ) into v_campaign_unique;

  return jsonb_build_object(
    'ok',
      jsonb_array_length(v_missing_rls) = 0
      and jsonb_array_length(v_public_write_policies) = 0
      and jsonb_array_length(v_custom_role_write_policies) = 0
      and v_evaluations_duplicate_constraint
      and v_profile_trigger
      and v_campaign_unique,
    'missing_rls', v_missing_rls,
    'public_write_policies', v_public_write_policies,
    'custom_role_write_policies', v_custom_role_write_policies,
    'checks', jsonb_build_object(
      'evaluations_campaign_pair_unique_idx', v_evaluations_duplicate_constraint,
      'enforce_profile_sensitive_trigger', v_profile_trigger,
      'campaign_period_type_index', v_campaign_unique
    ),
    'generated_at', now()
  );
end;
$$;

grant execute on function public.security_rls_baseline_report() to authenticated, service_role;

-- 4) Assertion helper for CI/manual validation. Admin/report operators can call it.
create or replace function public.assert_security_rls_baseline()
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_report jsonb;
begin
  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_role(auth.uid(), 'audit')
    or public.has_permission('reports.view', auth.uid())
  ) then
    raise exception 'not authorized to run security baseline';
  end if;

  v_report := public.security_rls_baseline_report();

  if coalesce((v_report->>'ok')::boolean, false) is not true then
    raise exception 'security baseline failed: %', v_report;
  end if;

  return v_report;
end;
$$;

grant execute on function public.assert_security_rls_baseline() to authenticated, service_role;

comment on function public.security_rls_baseline_report() is 'Returns RLS/security catalog findings for operational review. Does not mutate data.';
comment on function public.assert_security_rls_baseline() is 'Raises when the known RLS/security baseline is not satisfied. Intended for admin/manual CI validation.';

commit;
