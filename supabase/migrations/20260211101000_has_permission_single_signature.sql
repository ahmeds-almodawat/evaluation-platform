-- Enforce ONE canonical has_permission signature:
--   public.has_permission(p_permission text, p_user_id uuid DEFAULT auth.uid())
-- Safely migrates dependent RLS policies away from old overload (uuid,text).

begin;

-- -----------------------------
-- 0) Helper: make sure canonical function exists FIRST (so policies can switch safely)
-- -----------------------------
create or replace function public.has_permission(
  p_permission text,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := coalesce(p_user_id, auth.uid());
  v_perm text := btrim(coalesce(p_permission,''));
begin
  if v_user_id is null or v_perm = '' then
    return false;
  end if;

  -- User-level overrides (deny wins, then allow)
  if to_regclass('public.user_permissions') is not null then
    if exists (
      select 1
      from public.user_permissions up
      where up.user_id = v_user_id
        and up.permission = v_perm
        and coalesce(up.is_granted, true) = false
    ) then
      return false;
    end if;

    if exists (
      select 1
      from public.user_permissions up
      where up.user_id = v_user_id
        and up.permission = v_perm
        and coalesce(up.is_granted, true) = true
    ) then
      return true;
    end if;
  end if;

  -- Legacy role_permissions
  if to_regclass('public.user_roles') is not null and to_regclass('public.role_permissions') is not null then
    if exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role = ur.role
      where ur.user_id = v_user_id
        and rp.permission = v_perm
    ) then
      return true;
    end if;
  end if;

  -- Custom roles permissions
  if to_regclass('public.user_custom_roles') is not null and to_regclass('public.custom_role_permissions') is not null then
    if exists (
      select 1
      from public.user_custom_roles ucr
      join public.custom_role_permissions crp on crp.role_key = ucr.role_key
      where ucr.user_id = v_user_id
        and crp.permission = v_perm
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$$;

grant execute on function public.has_permission(text, uuid) to anon, authenticated, service_role;

-- -----------------------------
-- 1) Update dependent policies to call the canonical signature (permission first)
-- -----------------------------

-- 1A) audit_events_read on public.audit_events
-- We drop/recreate explicitly so it no longer depends on has_permission(uuid,text)
drop policy if exists audit_events_read on public.audit_events;

create policy audit_events_read
on public.audit_events
for select
to authenticated
using (public.has_permission('audit.read', auth.uid()));

-- 1B) Branding policies on storage.objects (these were created with old overload)
-- Important: storage.objects lives in "storage" schema, but policy expressions can reference public.has_permission.
-- We recreate them using canonical signature.

drop policy if exists branding_admin_insert on storage.objects;
create policy branding_admin_insert
on storage.objects
for insert
to authenticated
with check (
  public.has_permission('branding.manage', auth.uid())
);

-- Some of your policy names include suffixes (1ym05q3_0 / 1ym05q3_1). Recreate both if they exist.
drop policy if exists "branding_admin_update 1ym05q3_0" on storage.objects;
create policy "branding_admin_update 1ym05q3_0"
on storage.objects
for update
to authenticated
using (public.has_permission('branding.manage', auth.uid()))
with check (public.has_permission('branding.manage', auth.uid()));

drop policy if exists "branding_admin_update 1ym05q3_1" on storage.objects;
create policy "branding_admin_update 1ym05q3_1"
on storage.objects
for update
to authenticated
using (public.has_permission('branding.manage', auth.uid()))
with check (public.has_permission('branding.manage', auth.uid()));

drop policy if exists "branding_admin_delete 1ym05q3_0" on storage.objects;
create policy "branding_admin_delete 1ym05q3_0"
on storage.objects
for delete
to authenticated
using (public.has_permission('branding.manage', auth.uid()));

drop policy if exists "branding_admin_delete 1ym05q3_1" on storage.objects;
create policy "branding_admin_delete 1ym05q3_1"
on storage.objects
for delete
to authenticated
using (public.has_permission('branding.manage', auth.uid()));

-- -----------------------------
-- 2) Now it’s safe to drop old overloads
-- -----------------------------
drop function if exists public.has_permission(uuid, text);

-- If you had a text-only overload, remove it too
drop function if exists public.has_permission(text);

-- -----------------------------
-- 3) Optional: fix/refresh RPCs that used old signature order (safe CREATE OR REPLACE)
-- (If these functions don't exist, they won't be created unless you already had them.)
-- -----------------------------

-- Example: ensure your drilldown functions use canonical signature.
-- Keep these only if you already rely on them; if not, it's still safe to leave them here.

create or replace function public.get_period_score_breakdown(
  p_evaluatee uuid,
  p_period text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('evaluations.score_breakdown.view', auth.uid()) then
    raise exception 'not_authorized';
  end if;

  return (
    with eval_avg as (
      select
        e.id as evaluation_id,
        avg(ea.score::numeric) as eval_score
      from public.evaluations e
      join public.evaluation_answers ea on ea.evaluation_id = e.id
      where e.evaluatee_id = p_evaluatee
        and e.period = p_period
      group by e.id
    )
    select jsonb_build_object(
      'period', p_period,
      'evaluations_count', count(*),
      'average', avg(eval_score),
      'min', min(eval_score),
      'max', max(eval_score)
    )
    from eval_avg
  );
end;
$$;

commit;
