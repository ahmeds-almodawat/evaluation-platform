-- Big Data Stability & Campaign Safety Patch
-- Safe/additive intent:
-- - Add explicit campaign records so large monthly runs can be tracked, summarized, and audited.
-- - Add duplicate protection for campaign-generated evaluator/evaluatee pairs.
-- - Add indexes used by dashboards, pending-evaluation pages, and manager/unit reporting.
-- - Add summary tables for fast dashboard reads without changing raw historical evaluations.

begin;

-- 1) Campaign lifecycle table. Existing evaluations remain valid with campaign_id = null.
create table if not exists public.evaluation_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_type text not null,
  campaign_scope text null,
  department_id uuid null references public.departments(id) on delete set null,
  source_unit_id uuid null references public.org_units(id) on delete set null,
  target_unit_id uuid null references public.org_units(id) on delete set null,
  template_id uuid null references public.evaluation_templates(id) on delete set null,
  period text not null,
  status text not null default 'draft',
  assignment_strategy text not null default 'capped_per_evaluator',
  max_evaluatees_per_evaluator integer null,
  expected_evaluations integer not null default 0,
  created_evaluations integer not null default 0,
  created_by uuid null references auth.users(id) on delete set null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  generated_at timestamptz null,
  closed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint evaluation_campaigns_status_check check (status in ('draft','previewed','generating','sent','closed','archived','failed')),
  constraint evaluation_campaigns_type_check check (campaign_type in ('self_station','cross_station','cross_department','manager_to_team','team_to_manager','legacy_same','legacy_cross')),
  constraint evaluation_campaigns_limit_check check (max_evaluatees_per_evaluator is null or (max_evaluatees_per_evaluator >= 1 and max_evaluatees_per_evaluator <= 1000))
);

alter table public.evaluation_campaigns enable row level security;

alter table public.evaluations
  add column if not exists campaign_id uuid null references public.evaluation_campaigns(id) on delete set null;

alter table public.evaluations
  add column if not exists assignment_strategy text null;

-- 2) Duplicate protection for newly generated campaigns. Legacy rows with null campaign_id are untouched.
create unique index if not exists evaluations_campaign_pair_unique_idx
  on public.evaluations(campaign_id, evaluation_type, evaluator_id, evaluatee_id)
  where campaign_id is not null and evaluator_id is not null;

-- 3) High-impact indexes for scale and dashboard speed.
create index if not exists idx_evaluation_campaigns_period_type
  on public.evaluation_campaigns(period, campaign_type, status);

create index if not exists idx_evaluation_campaigns_department
  on public.evaluation_campaigns(department_id, period desc);

create index if not exists idx_evaluation_campaigns_created_by
  on public.evaluation_campaigns(created_by, created_at desc);

create index if not exists idx_evaluations_campaign
  on public.evaluations(campaign_id);

create index if not exists idx_evaluations_period_status
  on public.evaluations(period, status);

create index if not exists idx_evaluations_type_period
  on public.evaluations(evaluation_type, period);

create index if not exists idx_evaluations_evaluator_status_period
  on public.evaluations(evaluator_id, status, period);

create index if not exists idx_evaluations_evaluatee_period
  on public.evaluations(evaluatee_id, period);

create index if not exists idx_profiles_department_unit
  on public.profiles(department_id, unit_id);

create index if not exists idx_profiles_unit
  on public.profiles(unit_id)
  where unit_id is not null;

-- 4) Dashboard summary tables. They are additive and can be populated by a later scheduled job/RPC.
create table if not exists public.monthly_employee_scores (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  employee_id uuid not null references auth.users(id) on delete cascade,
  department_id uuid null references public.departments(id) on delete set null,
  unit_id uuid null references public.org_units(id) on delete set null,
  evaluation_type text not null,
  evaluation_count integer not null default 0,
  average_score numeric(10,4) null,
  performance_score numeric(10,4) null,
  teamwork_score numeric(10,4) null,
  calculated_at timestamptz not null default now(),
  unique (period, employee_id, evaluation_type)
);

create table if not exists public.monthly_department_scores (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  department_id uuid not null references public.departments(id) on delete cascade,
  evaluation_type text not null,
  evaluation_count integer not null default 0,
  average_score numeric(10,4) null,
  performance_score numeric(10,4) null,
  teamwork_score numeric(10,4) null,
  calculated_at timestamptz not null default now(),
  unique (period, department_id, evaluation_type)
);

create table if not exists public.monthly_unit_scores (
  id uuid primary key default gen_random_uuid(),
  period text not null,
  department_id uuid not null references public.departments(id) on delete cascade,
  unit_id uuid not null references public.org_units(id) on delete cascade,
  evaluation_type text not null,
  evaluation_count integer not null default 0,
  average_score numeric(10,4) null,
  performance_score numeric(10,4) null,
  teamwork_score numeric(10,4) null,
  calculated_at timestamptz not null default now(),
  unique (period, unit_id, evaluation_type)
);

alter table public.monthly_employee_scores enable row level security;
alter table public.monthly_department_scores enable row level security;
alter table public.monthly_unit_scores enable row level security;

-- 5) Helper function to refresh monthly summary tables for one period.
create or replace function public.refresh_monthly_score_summaries(p_period text default to_char(now(), 'YYYY-MM'))
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_rows integer := 0;
  v_department_rows integer := 0;
  v_unit_rows integer := 0;
begin
  if not (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_permission('reports.view', auth.uid())
    or public.has_permission('evaluations.manage', auth.uid())
  ) then
    raise exception 'not authorized to refresh score summaries';
  end if;

  delete from public.monthly_employee_scores where period = p_period;
  delete from public.monthly_department_scores where period = p_period;
  delete from public.monthly_unit_scores where period = p_period;

  insert into public.monthly_employee_scores (
    period, employee_id, department_id, unit_id, evaluation_type,
    evaluation_count, average_score, performance_score, teamwork_score, calculated_at
  )
  select
    e.period,
    e.evaluatee_id,
    p.department_id,
    p.unit_id,
    coalesce(nullif(e.evaluation_type, ''), 'legacy_same') as evaluation_type,
    count(*)::integer as evaluation_count,
    avg((coalesce(nullif(e.performance_score, 0), null)::numeric + coalesce(nullif(e.teamwork_score, 0), null)::numeric) / 2.0) as average_score,
    avg(nullif(e.performance_score, 0)) as performance_score,
    avg(nullif(e.teamwork_score, 0)) as teamwork_score,
    now()
  from public.evaluations e
  left join public.profiles p on p.id = e.evaluatee_id
  where e.period = p_period
    and e.status = 'completed'
  group by e.period, e.evaluatee_id, p.department_id, p.unit_id, coalesce(nullif(e.evaluation_type, ''), 'legacy_same');
  get diagnostics v_employee_rows = row_count;

  insert into public.monthly_department_scores (
    period, department_id, evaluation_type,
    evaluation_count, average_score, performance_score, teamwork_score, calculated_at
  )
  select
    e.period,
    p.department_id,
    coalesce(nullif(e.evaluation_type, ''), 'legacy_same') as evaluation_type,
    count(*)::integer as evaluation_count,
    avg((coalesce(nullif(e.performance_score, 0), null)::numeric + coalesce(nullif(e.teamwork_score, 0), null)::numeric) / 2.0) as average_score,
    avg(nullif(e.performance_score, 0)) as performance_score,
    avg(nullif(e.teamwork_score, 0)) as teamwork_score,
    now()
  from public.evaluations e
  join public.profiles p on p.id = e.evaluatee_id
  where e.period = p_period
    and e.status = 'completed'
    and p.department_id is not null
  group by e.period, p.department_id, coalesce(nullif(e.evaluation_type, ''), 'legacy_same');
  get diagnostics v_department_rows = row_count;

  insert into public.monthly_unit_scores (
    period, department_id, unit_id, evaluation_type,
    evaluation_count, average_score, performance_score, teamwork_score, calculated_at
  )
  select
    e.period,
    p.department_id,
    p.unit_id,
    coalesce(nullif(e.evaluation_type, ''), 'legacy_same') as evaluation_type,
    count(*)::integer as evaluation_count,
    avg((coalesce(nullif(e.performance_score, 0), null)::numeric + coalesce(nullif(e.teamwork_score, 0), null)::numeric) / 2.0) as average_score,
    avg(nullif(e.performance_score, 0)) as performance_score,
    avg(nullif(e.teamwork_score, 0)) as teamwork_score,
    now()
  from public.evaluations e
  join public.profiles p on p.id = e.evaluatee_id
  where e.period = p_period
    and e.status = 'completed'
    and p.department_id is not null
    and p.unit_id is not null
  group by e.period, p.department_id, p.unit_id, coalesce(nullif(e.evaluation_type, ''), 'legacy_same');
  get diagnostics v_unit_rows = row_count;

  return jsonb_build_object(
    'period', p_period,
    'employee_rows', v_employee_rows,
    'department_rows', v_department_rows,
    'unit_rows', v_unit_rows,
    'refreshed_at', now()
  );
end;
$$;

-- 6) RLS policies. Read-only report roles can read summaries/campaigns; send/manage roles can create campaigns.
drop policy if exists evaluation_campaigns_read on public.evaluation_campaigns;
drop policy if exists evaluation_campaigns_insert on public.evaluation_campaigns;
drop policy if exists evaluation_campaigns_update on public.evaluation_campaigns;

create policy evaluation_campaigns_read
  on public.evaluation_campaigns for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_role(auth.uid(), 'audit')
    or public.has_permission('evaluations.view', auth.uid())
    or public.has_permission('reports.view', auth.uid())
  );

create policy evaluation_campaigns_insert
  on public.evaluation_campaigns for insert
  to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_permission('evaluations.manage', auth.uid())
    or public.has_permission('evaluations.custom.create', auth.uid())
  );

create policy evaluation_campaigns_update
  on public.evaluation_campaigns for update
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_permission('evaluations.manage', auth.uid())
    or public.has_permission('evaluations.custom.create', auth.uid())
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_permission('evaluations.manage', auth.uid())
    or public.has_permission('evaluations.custom.create', auth.uid())
  );

drop policy if exists monthly_employee_scores_read on public.monthly_employee_scores;
drop policy if exists monthly_department_scores_read on public.monthly_department_scores;
drop policy if exists monthly_unit_scores_read on public.monthly_unit_scores;

create policy monthly_employee_scores_read
  on public.monthly_employee_scores for select
  to authenticated
  using (
    employee_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_role(auth.uid(), 'audit')
    or public.has_permission('reports.view', auth.uid())
  );

create policy monthly_department_scores_read
  on public.monthly_department_scores for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_role(auth.uid(), 'audit')
    or public.has_permission('reports.view', auth.uid())
  );

create policy monthly_unit_scores_read
  on public.monthly_unit_scores for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
    or public.has_role(auth.uid(), 'audit')
    or public.has_permission('reports.view', auth.uid())
  );

-- 7) Grants.
grant select, insert, update on table public.evaluation_campaigns to authenticated;
grant select on table public.monthly_employee_scores to authenticated;
grant select on table public.monthly_department_scores to authenticated;
grant select on table public.monthly_unit_scores to authenticated;
grant execute on function public.refresh_monthly_score_summaries(text) to authenticated;

comment on table public.evaluation_campaigns is 'Tracks evaluation generation runs. New campaigns get preview, status, limits, and row counts without changing legacy evaluation records.';
comment on table public.monthly_employee_scores is 'Optional dashboard summary table by employee/month/type. Rebuilt by refresh_monthly_score_summaries.';
comment on table public.monthly_department_scores is 'Optional dashboard summary table by department/month/type. Rebuilt by refresh_monthly_score_summaries.';
comment on table public.monthly_unit_scores is 'Optional dashboard summary table by unit/month/type. Rebuilt by refresh_monthly_score_summaries.';

commit;
