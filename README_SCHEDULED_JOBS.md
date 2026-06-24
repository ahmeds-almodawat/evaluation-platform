# Scheduled jobs (cron) - Reporting cache + reminders

This patch adds an Edge Function `scheduled-jobs` that calls two Postgres RPCs:

- `system_refresh_reporting_cache()`
- `system_send_cycle_reminders()`

## 1) Run SQL

Open **Supabase SQL Editor** and run `SQL_SCHEDULED_JOBS.sql`.

## 2) Add secrets (once)

In Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 3) Deploy the Edge Function

From your project root:

```bash
supabase functions deploy scheduled-jobs
```

## 4) Create schedules

Dashboard -> Edge Functions -> `scheduled-jobs` -> **Schedules**

Recommended (Asia/Riyadh UTC+3):

1. **Daily cache refresh** at 03:30 Riyadh (00:30 UTC)
   - Cron: `30 0 * * *`
   - URL path (optional): `?mode=refresh`

2. **Daily reminders** at 09:00 Riyadh (06:00 UTC)
   - Cron: `0 6 * * *`
   - URL path (optional): `?mode=reminders`

3. Or run both in one daily job at 03:30 Riyadh:
   - Cron: `30 0 * * *`
   - (no query params)

## Manual run

You can also call the function manually from the dashboard:
- `scheduled-jobs?mode=all`
- `scheduled-jobs?mode=refresh`
- `scheduled-jobs?mode=reminders`
