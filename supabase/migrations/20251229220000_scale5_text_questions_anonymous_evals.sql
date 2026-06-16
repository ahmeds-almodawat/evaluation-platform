-- -----------------------------------------------------------------------------
-- Add 5-point scales, text questions (200 chars), and Anonymous Evaluations
-- -----------------------------------------------------------------------------

-- Ensure pgcrypto available for digest()
create extension if not exists pgcrypto;

-- 1) Allow templates scale_max = 3,4,5
alter table public.evaluation_templates
  drop constraint if exists evaluation_templates_scale_max_check;

alter table public.evaluation_templates
  add constraint evaluation_templates_scale_max_check check (scale_max in (3,4,5));

-- 2) Add question_type + max_chars to template questions
alter table public.evaluation_template_questions
  add column if not exists question_type text not null default 'scale' check (question_type in ('scale','text'));

alter table public.evaluation_template_questions
  add column if not exists max_chars int;

-- 3) Support text answers + 5-point values
alter table public.evaluation_answers
  add column if not exists text_value text;

alter table public.evaluation_answers
  alter column score drop not null;

alter table public.evaluation_answers
  drop constraint if exists evaluation_answers_value_check;

alter table public.evaluation_answers
  add constraint evaluation_answers_value_check
  check (
    ((score is not null and score >= 1 and score <= 5 and text_value is null)
    or
    (score is null and text_value is not null)) and (text_value is null or char_length(text_value) <= 200)
  );

-- 4) Update evaluation score ranges to allow up to 5
alter table public.evaluations drop constraint if exists evaluations_performance_score_range;
alter table public.evaluations drop constraint if exists evaluations_teamwork_score_range;
alter table public.evaluations drop constraint if exists evaluations_workload_score_range;

alter table public.evaluations
  add constraint evaluations_performance_score_range check (performance_score >= 0 and performance_score <= 5),
  add constraint evaluations_teamwork_score_range check (teamwork_score >= 0 and teamwork_score <= 5),
  add constraint evaluations_workload_score_range check (workload_score is null or (workload_score >= 0 and workload_score <= 5));

-- 5) Anonymous Evaluations (admin-only visibility)
create table if not exists public.anonymous_evaluations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  question_en text not null,
  question_ar text not null,
  reveal_identity boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anonymous_evaluation_recipients (
  evaluation_id uuid not null references public.anonymous_evaluations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (evaluation_id, user_id)
);

-- secrets table (no selects) so we can hash user ids without exposing salt
create table if not exists public.anonymous_evaluation_secrets (
  evaluation_id uuid primary key references public.anonymous_evaluations(id) on delete cascade,
  salt text not null default gen_random_uuid()::text,
  created_at timestamptz not null default now()
);

create table if not exists public.anonymous_evaluation_responses (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.anonymous_evaluations(id) on delete cascade,
  responder_id uuid references auth.users(id) on delete set null,
  responder_hash text,
  answer_text text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_anon_resp_identified
  on public.anonymous_evaluation_responses(evaluation_id, responder_id)
  where responder_id is not null;

create unique index if not exists uniq_anon_resp_hashed
  on public.anonymous_evaluation_responses(evaluation_id, responder_hash)
  where responder_hash is not null;

-- updated_at trigger
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'update_anonymous_evaluations_updated_at') then
    create trigger update_anonymous_evaluations_updated_at
      before update on public.anonymous_evaluations
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- RLS
alter table public.anonymous_evaluations enable row level security;
alter table public.anonymous_evaluation_recipients enable row level security;
alter table public.anonymous_evaluation_responses enable row level security;
alter table public.anonymous_evaluation_secrets enable row level security;

-- Only admin can manage and view anonymous evaluations
drop policy if exists "anon_evals_admin_all" on public.anonymous_evaluations;
create policy "anon_evals_admin_all"
  on public.anonymous_evaluations
  for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "anon_recipients_admin_all" on public.anonymous_evaluation_recipients;
create policy "anon_recipients_admin_all"
  on public.anonymous_evaluation_recipients
  for all
  using (public.has_role(auth.uid(), 'admin'::public.app_role))
  with check (public.has_role(auth.uid(), 'admin'::public.app_role));

-- Recipients can SELECT the evaluation metadata (question) for evaluations assigned to them
drop policy if exists "anon_evals_recipients_select" on public.anonymous_evaluations;
create policy "anon_evals_recipients_select"
  on public.anonymous_evaluations
  for select
  using (
    exists (
      select 1 from public.anonymous_evaluation_recipients r
      where r.evaluation_id = id and r.user_id = auth.uid()
    )
  );

-- Users can see only their own recipient rows (so they can list pending anon evals)
drop policy if exists "anon_recipients_select_own" on public.anonymous_evaluation_recipients;
create policy "anon_recipients_select_own"
  on public.anonymous_evaluation_recipients
  for select
  using (user_id = auth.uid());

-- Responses: admin can select all; users can select their own identified responses
drop policy if exists "anon_responses_admin_select" on public.anonymous_evaluation_responses;
create policy "anon_responses_admin_select"
  on public.anonymous_evaluation_responses
  for select
  using (public.has_role(auth.uid(), 'admin'::public.app_role));

drop policy if exists "anon_responses_user_select_own" on public.anonymous_evaluation_responses;
create policy "anon_responses_user_select_own"
  on public.anonymous_evaluation_responses
  for select
  using (responder_id = auth.uid());

-- Secrets: no select/modify policies (only used by SECURITY DEFINER functions)
-- (RLS enabled, and no policies => nobody can read rows)

-- Submit response via SECURITY DEFINER so we can use secrets.salt without exposing it.
create or replace function public.submit_anonymous_evaluation_response(
  p_evaluation_id uuid,
  p_answer_text text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_reveal boolean;
  v_salt text;
  v_hash text;
begin
  v_user := auth.uid();
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  -- Must be an assigned recipient
  if not exists (
    select 1 from public.anonymous_evaluation_recipients r
    where r.evaluation_id = p_evaluation_id and r.user_id = v_user
  ) then
    raise exception 'Not assigned';
  end if;

  select reveal_identity into v_reveal
  from public.anonymous_evaluations
  where id = p_evaluation_id;

  if v_reveal is null then
    raise exception 'Evaluation not found';
  end if;

  if v_reveal then
    insert into public.anonymous_evaluation_responses(evaluation_id, responder_id, responder_hash, answer_text)
    values (p_evaluation_id, v_user, null, p_answer_text);
  else
    select salt into v_salt from public.anonymous_evaluation_secrets where evaluation_id = p_evaluation_id;
    if v_salt is null then
      -- create a salt row if missing (should not happen, but safe)
      insert into public.anonymous_evaluation_secrets(evaluation_id) values (p_evaluation_id)
      returning salt into v_salt;
    end if;

    -- pgcrypto.digest expects bytea input. Convert our concatenated text to bytea explicitly
    -- to avoid "digest(text, unknown)" runtime errors.
    v_hash := encode(digest(convert_to(v_user::text || v_salt, 'utf8'), 'sha256'), 'hex');

    insert into public.anonymous_evaluation_responses(evaluation_id, responder_id, responder_hash, answer_text)
    values (p_evaluation_id, null, v_hash, p_answer_text);
  end if;
end;
$$;

grant execute on function public.submit_anonymous_evaluation_response(uuid, text) to authenticated;

create or replace function public.anonymous_evaluation_has_submitted(
  p_evaluation_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_reveal boolean;
  v_salt text;
  v_hash text;
begin
  v_user := auth.uid();
  if v_user is null then
    return false;
  end if;

  select reveal_identity into v_reveal
  from public.anonymous_evaluations
  where id = p_evaluation_id;

  if v_reveal is null then
    return false;
  end if;

  if v_reveal then
    return exists (
      select 1 from public.anonymous_evaluation_responses
      where evaluation_id = p_evaluation_id and responder_id = v_user
    );
  end if;

  select salt into v_salt from public.anonymous_evaluation_secrets where evaluation_id = p_evaluation_id;
  if v_salt is null then
    return false;
  end if;

  v_hash := encode(digest(convert_to(v_user::text || v_salt, 'utf8'), 'sha256'), 'hex');

  return exists (
    select 1 from public.anonymous_evaluation_responses
    where evaluation_id = p_evaluation_id and responder_hash = v_hash
  );
end;
$$;

grant execute on function public.anonymous_evaluation_has_submitted(uuid) to authenticated;
