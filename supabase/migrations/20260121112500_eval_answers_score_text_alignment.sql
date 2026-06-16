-- Align evaluation_answers schema for template/text questions.
-- This migration is intentionally placed BEFORE eval_identity_drilldown_rpcs to avoid compilation errors.
-- Canonical column for numeric answers is `score` (nullable). Text answers use `text_value`.

do $$
begin
  -- If legacy column `value` exists and `score` does not, rename it.
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='evaluation_answers' and column_name='value'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='evaluation_answers' and column_name='score'
  ) then
    alter table public.evaluation_answers rename column value to score;
  end if;

  -- If neither exists (very old/partial installs), add score.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='evaluation_answers' and column_name='score'
  ) then
    alter table public.evaluation_answers add column score int;
  end if;

  -- Allow NULL scores (text questions store score = null)
  begin
    alter table public.evaluation_answers alter column score drop not null;
  exception when others then
    -- ignore if already nullable
    null;
  end;

  -- Drop any legacy check constraint that may block nulls or different ranges.
  alter table public.evaluation_answers drop constraint if exists evaluation_answers_value_check;
  alter table public.evaluation_answers drop constraint if exists evaluation_answers_score_check;

  -- Re-add a safe check: score is null (text) OR between 0 and 5 (supports scale 1..5, and drafts may use 0).
  alter table public.evaluation_answers
    add constraint evaluation_answers_score_check
    check (score is null or (score >= 0 and score <= 5));

  -- Ensure text_value column exists for text questions.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='evaluation_answers' and column_name='text_value'
  ) then
    alter table public.evaluation_answers add column text_value text;
  end if;

  -- Ensure updated_at exists (some older DBs may miss it)
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='evaluation_answers' and column_name='updated_at'
  ) then
    alter table public.evaluation_answers add column updated_at timestamptz not null default now();
  end if;

  -- Ensure created_at exists
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='evaluation_answers' and column_name='created_at'
  ) then
    alter table public.evaluation_answers add column created_at timestamptz not null default now();
  end if;
end $$;

-- Helpful index (idempotent)
create index if not exists idx_eval_answers_evaluation on public.evaluation_answers(evaluation_id);
