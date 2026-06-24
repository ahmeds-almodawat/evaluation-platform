-- -----------------------------------------------------------------------------
-- Evaluation Templates + Snapshot-based Question Answers
--
-- Goals
-- 1) Allow admin/super_user to manage evaluation templates (draft/published)
-- 2) Snapshot template into each evaluation at assignment time
-- 3) Store per-question answers in evaluation_answers
-- 4) Make pending evaluations neutral (score 0)
-- 5) Keep completed evaluations valid (scores 1..4)
-- -----------------------------------------------------------------------------

-- 1) Templates
create table if not exists public.evaluation_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  scale_max int not null default 4 check (scale_max in (3,4)),
  labels jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.evaluation_template_questions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.evaluation_templates(id) on delete cascade,
  sort_order int not null default 0,
  text_en text not null,
  text_ar text not null,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_eval_templates_status on public.evaluation_templates(status);
create index if not exists idx_eval_template_questions_template on public.evaluation_template_questions(template_id, sort_order);

-- 2) Snapshot columns on evaluations
alter table public.evaluations
  add column if not exists template_id uuid references public.evaluation_templates(id) on delete set null;

alter table public.evaluations
  add column if not exists template_snapshot jsonb;

alter table public.evaluations
  add column if not exists scale_max int not null default 3;

alter table public.evaluations
  add column if not exists labels_snapshot jsonb;

-- 3) Per-question answers
create table if not exists public.evaluation_answers (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.evaluations(id) on delete cascade,
  question_id uuid not null,
  value int not null check (value >= 1 and value <= 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evaluation_id, question_id)
);

create index if not exists idx_eval_answers_evaluation on public.evaluation_answers(evaluation_id);

-- 4) Make scores allow 0..4, but completed must be 1..4
-- Drop old auto constraints (names differ by environment, but these are the default names).
alter table public.evaluations drop constraint if exists evaluations_performance_score_check;
alter table public.evaluations drop constraint if exists evaluations_teamwork_score_check;
alter table public.evaluations drop constraint if exists evaluations_workload_score_check;

-- Allow neutral 0 for pending/unsubmitted evaluations
alter table public.evaluations
  alter column performance_score set default 0,
  alter column teamwork_score set default 0;

alter table public.evaluations
  add constraint evaluations_performance_score_range check (performance_score >= 0 and performance_score <= 4),
  add constraint evaluations_teamwork_score_range check (teamwork_score >= 0 and teamwork_score <= 4),
  add constraint evaluations_workload_score_range check (workload_score is null or (workload_score >= 0 and workload_score <= 4)),
  add constraint evaluations_completed_score_min check (
    status <> 'completed'
    or (performance_score >= 1 and teamwork_score >= 1)
  );

-- Neutralize existing pending rows (if any)
update public.evaluations
set performance_score = 0,
    teamwork_score = 0,
    workload_score = case when workload_score is null then null else 0 end
where status = 'pending'
  and (performance_score = 1 or teamwork_score = 1 or workload_score = 1);

-- 5) updated_at triggers for new tables
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'update_evaluation_templates_updated_at') then
    create trigger update_evaluation_templates_updated_at
      before update on public.evaluation_templates
      for each row execute function public.update_updated_at_column();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'update_evaluation_template_questions_updated_at') then
    create trigger update_evaluation_template_questions_updated_at
      before update on public.evaluation_template_questions
      for each row execute function public.update_updated_at_column();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'update_evaluation_answers_updated_at') then
    create trigger update_evaluation_answers_updated_at
      before update on public.evaluation_answers
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- 6) RLS
alter table public.evaluation_templates enable row level security;
alter table public.evaluation_template_questions enable row level security;
alter table public.evaluation_answers enable row level security;

-- Templates
drop policy if exists "templates_select_published_or_admin" on public.evaluation_templates;
create policy "templates_select_published_or_admin"
  on public.evaluation_templates
  for select
  to authenticated
  using (
    status = 'published'
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_user')
  );

drop policy if exists "templates_write_admin_or_super" on public.evaluation_templates;
create policy "templates_write_admin_or_super"
  on public.evaluation_templates
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_user'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_user'));

-- Template questions
drop policy if exists "template_questions_select_published_or_admin" on public.evaluation_template_questions;
create policy "template_questions_select_published_or_admin"
  on public.evaluation_template_questions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.evaluation_templates t
      where t.id = template_id
        and (
          t.status = 'published'
          or public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'super_user')
        )
    )
  );

drop policy if exists "template_questions_write_admin_or_super" on public.evaluation_template_questions;
create policy "template_questions_write_admin_or_super"
  on public.evaluation_template_questions
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_user'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_user'));

-- Answers
drop policy if exists "evaluation_answers_select_scoped" on public.evaluation_answers;
create policy "evaluation_answers_select_scoped"
  on public.evaluation_answers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.evaluations e
      where e.id = evaluation_id
        and (
          e.evaluator_id = auth.uid()
          or e.evaluatee_id = auth.uid()
          or public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'audit')
          or public.has_role(auth.uid(), 'super_user')
        )
    )
  );

drop policy if exists "evaluation_answers_write_evaluator_pending" on public.evaluation_answers;
create policy "evaluation_answers_write_evaluator_pending"
  on public.evaluation_answers
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.evaluations e
      where e.id = evaluation_id
        and (
          e.evaluator_id = auth.uid()
          or public.has_role(auth.uid(), 'admin')
        )
        and e.status = 'pending'
    )
  )
  with check (
    exists (
      select 1
      from public.evaluations e
      where e.id = evaluation_id
        and (
          e.evaluator_id = auth.uid()
          or public.has_role(auth.uid(), 'admin')
        )
        and e.status = 'pending'
    )
  );

-- 7) Seed one default published template (if none exists)
insert into public.evaluation_templates (name, status, scale_max, labels, created_by)
select
  'Default Evaluation',
  'published',
  4,
  jsonb_build_object(
    '1', jsonb_build_object('en','Bad','ar','سيء'),
    '2', jsonb_build_object('en','Neutral','ar','محايد'),
    '3', jsonb_build_object('en','Good','ar','جيد'),
    '4', jsonb_build_object('en','Excellent','ar','ممتاز')
  ),
  null
where not exists (select 1 from public.evaluation_templates);

-- Seed default questions if template was inserted
insert into public.evaluation_template_questions (template_id, sort_order, text_en, text_ar, required)
select t.id, v.sort_order, v.text_en, v.text_ar, true
from public.evaluation_templates t
join (
  values
    (1, 'Quality of work', 'جودة العمل'),
    (2, 'Collaboration & communication', 'التعاون والتواصل'),
    (3, 'Commitment & reliability', 'الالتزام والموثوقية')
) as v(sort_order, text_en, text_ar)
on true
where t.name = 'Default Evaluation'
  and not exists (
    select 1 from public.evaluation_template_questions q
    where q.template_id = t.id
  );
