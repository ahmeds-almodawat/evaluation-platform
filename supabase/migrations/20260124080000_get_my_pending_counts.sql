-- Single-RPC pending count for sidebar badge (regular + anonymous).
-- Supabase installs pgcrypto into the "extensions" schema, so digest() is extensions.digest().

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create or replace function public.get_my_pending_counts()
returns table (
  pending_regular int,
  pending_anonymous int,
  pending_total int
)
language sql
security definer
set search_path = public, extensions
as $fn$
  with regular as (
    select count(*)::int as c
    from public.evaluations
    where evaluator_id = auth.uid()
      and status = 'pending'
  ),
  anon_rec as (
    select
      r.evaluation_id,
      a.reveal_identity,
      s.salt
    from public.anonymous_evaluation_recipients r
    join public.anonymous_evaluations a on a.id = r.evaluation_id
    left join public.anonymous_evaluation_secrets s on s.evaluation_id = r.evaluation_id
    where r.user_id = auth.uid()
  ),
  anon_state as (
    select
      ar.evaluation_id,
      case
        when ar.reveal_identity then exists (
          select 1 from public.anonymous_evaluation_responses resp
          where resp.evaluation_id = ar.evaluation_id
            and resp.responder_id = auth.uid()
        )
        else exists (
          select 1 from public.anonymous_evaluation_responses resp
          where resp.evaluation_id = ar.evaluation_id
            and resp.responder_hash = encode(
              extensions.digest(
                convert_to(auth.uid()::text || coalesce(ar.salt,''), 'utf8'),
                'sha256'
              ),
              'hex'
            )
        )
      end as has_submitted
    from anon_rec ar
  ),
  anon as (
    select count(*)::int as c
    from anon_state
    where has_submitted = false
  )
  select
    (select c from regular) as pending_regular,
    (select c from anon) as pending_anonymous,
    ((select c from regular) + (select c from anon)) as pending_total;
$fn$;