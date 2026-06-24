-- Cleanup demo / test data older than last week
--
-- ⚠️ SAFE USE:
-- - Run this only if you are 100% sure old records are demo/test.
-- - This does NOT run automatically. You run it manually in Supabase SQL editor.
--
-- What it does:
-- - Removes evaluations created more than 7 days ago
-- - Removes notifications that point to those deleted evaluations
--
-- 1) DRY RUN: see what will be deleted
select count(*) as evaluations_to_delete
from public.evaluations
where created_at < now() - interval '7 days';

select count(*) as notifications_to_delete
from public.notifications n
where n.related_evaluation_id in (
  select id
  from public.evaluations
  where created_at < now() - interval '7 days'
);

-- 2) DELETE (uncomment when ready)
-- delete from public.notifications n
-- where n.related_evaluation_id in (
--   select id
--   from public.evaluations
--   where created_at < now() - interval '7 days'
-- );
--
-- delete from public.evaluations
-- where created_at < now() - interval '7 days';

-- 3) Optional: verify
-- select min(created_at) as oldest_evaluation_remaining from public.evaluations;
