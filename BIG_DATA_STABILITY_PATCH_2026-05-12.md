# Big Data Stability & Campaign Safety Patch — 2026-05-12

This patch is additive. It does not change old completed evaluations or old score history.

## What changed

1. Added campaign preview before generation.
   - Admin must preview expected assignment volume before creating rows.
   - Preview shows evaluator count, evaluatee count, total forms, and maximum load for one evaluator.

2. Added capped assignment logic for high-volume flows.
   - Self Station / Unit: default max 5 evaluatees per evaluator.
   - Cross Station: default max 5 evaluatees per evaluator.
   - Cross Department: default max 5 evaluatees per evaluator.
   - Manager → Team: all assigned employees remain included.
   - Team → Manager: all assigned employees remain included.

3. Added campaign tracking table.
   - `evaluation_campaigns` records type, period, scope, limit, expected rows, created rows, status, and creator.

4. Added batch insertion.
   - Evaluation rows are inserted in batches of 500 instead of one huge insert.

5. Added duplicate protection for campaign-generated rows.
   - Unique index on `campaign_id + evaluation_type + evaluator_id + evaluatee_id`.

6. Added dashboard/performance indexes.
   - Evaluations by campaign, period/status, type/period, evaluator/status, evaluatee/period.
   - Profiles by department/unit.

7. Added optional monthly summary tables.
   - `monthly_employee_scores`
   - `monthly_department_scores`
   - `monthly_unit_scores`
   - `refresh_monthly_score_summaries(period)` helper.

8. Added stress estimator script.

```powershell
npm run stress:estimate -- --stations=10 --employees-per-station=20 --cap=5
```

## Required command after deploying this patch

```powershell
supabase db push
```

## Safe use recommendation

For 200 nurses / 10 stations, use default capped peer/cross flows first. Increase the cap only after checking participation burden and dashboard speed.
