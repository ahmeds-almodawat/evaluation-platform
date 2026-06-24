-- Hotfix: avoid "digest(text, unknown) does not exist" during fully anonymous submissions.
-- Recreate the anonymous submission functions with explicit convert_to(..., 'utf8').

begin;

create or replace function public.anonymous_submit_answer(
  p_evaluation_id uuid,
  p_answer_text text
)
returns void
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
    select current_setting('app.anonymous_salt', true) into v_salt;
    if v_salt is null or length(v_salt) = 0 then
      v_salt := 'default_salt_change_me';
    end if;
    v_hash := encode(digest(convert_to(v_user::text || v_salt, 'utf8'), 'sha256'), 'hex');
    insert into public.anonymous_evaluation_responses(evaluation_id, responder_id, responder_hash, answer_text)
    values (p_evaluation_id, null, v_hash, p_answer_text);
  end if;
end;
$$;

create or replace function public.anonymous_upsert_submission(
  p_evaluation_id uuid,
  p_answer_text text
)
returns void
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

  select reveal_identity into v_reveal
  from public.anonymous_evaluations
  where id = p_evaluation_id;

  if v_reveal is null then
    raise exception 'Evaluation not found';
  end if;

  if v_reveal then
    insert into public.anonymous_evaluation_responses(evaluation_id, responder_id, responder_hash, answer_text)
    values (p_evaluation_id, v_user, null, p_answer_text)
    on conflict (evaluation_id, responder_id)
    do update set answer_text = excluded.answer_text, updated_at = now();
  else
    select current_setting('app.anonymous_salt', true) into v_salt;
    if v_salt is null or length(v_salt) = 0 then
      v_salt := 'default_salt_change_me';
    end if;
    v_hash := encode(digest(convert_to(v_user::text || v_salt, 'utf8'), 'sha256'), 'hex');
    insert into public.anonymous_evaluation_responses(evaluation_id, responder_id, responder_hash, answer_text)
    values (p_evaluation_id, null, v_hash, p_answer_text)
    on conflict (evaluation_id, responder_hash)
    do update set answer_text = excluded.answer_text, updated_at = now();
  end if;
end;
$$;

grant execute on function public.anonymous_submit_answer(uuid,text) to authenticated;
grant execute on function public.anonymous_upsert_submission(uuid,text) to authenticated;

commit;
