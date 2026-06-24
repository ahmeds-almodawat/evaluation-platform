-- Performance pack: safe indexes for common dashboard/query patterns

-- Profiles
create index if not exists idx_profiles_department_id on public.profiles (department_id);
create index if not exists idx_profiles_is_active on public.profiles (is_active);

-- User roles
create index if not exists idx_user_roles_user_id on public.user_roles (user_id);

-- Evaluations
create index if not exists idx_evaluations_created_at on public.evaluations (created_at);
create index if not exists idx_evaluations_evaluatee_id on public.evaluations (evaluatee_id);
create index if not exists idx_evaluations_evaluator_id on public.evaluations (evaluator_id);
create index if not exists idx_evaluations_status on public.evaluations (status);
create index if not exists idx_evaluations_type on public.evaluations (evaluation_type);

-- Answers
create index if not exists idx_eval_answers_evaluation_id on public.evaluation_answers (evaluation_id);

-- Tickets
create index if not exists idx_action_tickets_status on public.action_tickets (status);
create index if not exists idx_action_tickets_due_date on public.action_tickets (due_date);
do $$
begin
  if to_regclass('public.action_tickets') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema='public'
         and table_name='action_tickets'
         and column_name='assigned_to'
     ) then
    execute 'create index if not exists idx_action_tickets_assigned_to on public.action_tickets (assigned_to)';
  else
    raise notice 'Skipping idx_action_tickets_assigned_to: action_tickets.assigned_to not found';
  end if;
end $$;

-- Audit logs
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at);
create index if not exists idx_audit_logs_actor_user_id on public.audit_logs (actor_user_id);
