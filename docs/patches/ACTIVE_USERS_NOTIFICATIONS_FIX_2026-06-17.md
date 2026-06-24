# Active Users + Notifications Fix — 2026-06-17

## Fixed

- Archived/deactivated users are excluded from newly generated evaluation campaigns.
- Cross-department, self-station, cross-station, Manager → Team, and Team → Manager generation now only loads active profiles where `is_active = true` and `deleted_at is null`.
- When a profile is archived/deactivated, pending evaluation requests involving that user are removed.
- Evaluation notification reminders for archived users are removed.
- The notification bell is visible again for logged-in users, not admin only.
- New evaluation requests now generate an in-app notification for the assigned evaluator.

## Safety

- Completed evaluations are not touched.
- Historical completed scores remain preserved.
- Notification inserts remain server-side via database trigger.
- Users can only read/update/delete their own notifications through RLS.

## Files

- `src/components/evaluations/InitiateEvaluationDialog.tsx`
- `src/components/layout/Header.tsx`
- `src/components/notifications/NotificationDropdown.tsx`
- `supabase/migrations/20260617173000_active_users_notifications_fix.sql`
- `docs/patches/ACTIVE_USERS_NOTIFICATIONS_FIX_2026-06-17.md`
