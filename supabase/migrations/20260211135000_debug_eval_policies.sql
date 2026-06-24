-- Debug only (no changes)
select
  polname,
  polcmd,
  pg_get_expr(polwithcheck, polrelid) as check_expr
from pg_policy
where polrelid = 'public.evaluations'::regclass
order by polcmd, polname;
