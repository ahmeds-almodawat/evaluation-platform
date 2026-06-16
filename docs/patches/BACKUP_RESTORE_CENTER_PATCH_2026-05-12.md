# Backup / Restore Center Patch - 2026-05-12

## Purpose

This patch upgrades the previous Export Center / Restore Center into a safer Backup + Import/Restore workflow for heavy testing.

It lets Admin export JSON restore files, run tests, then import the JSON file again without manually rebuilding departments, stations, managers, roles and templates.

## What was added

### Export & Backup Center

New backup options:

1. **Setup Baseline Backup**
   - departments
   - units / stations
   - profiles
   - user roles
   - role permissions
   - custom roles
   - manager assignments
   - department links
   - evaluation templates/questions
   - branding/settings
   - saved filters / custom dashboards

2. **Operational Backup**
   - everything in Setup Baseline
   - evaluation campaigns
   - evaluations
   - evaluation answers
   - anonymous evaluations
   - monthly score summaries
   - messages
   - notifications
   - action tickets

3. **Full Public Data Backup**
   - all supported public application tables
   - includes sensitive public tables such as audit, anonymous secrets, allowlists and integration tables

Excel exports remain available for reporting/archive, but JSON is the restore format.

### Import & Restore Center

New restore features:

- Load JSON backup bundle.
- Preview backup type, version, row counts, supported/unsupported tables.
- Warn when data depends on Supabase Auth users.
- Safe mode: upsert only.
- Replace mode: delete included tables first, then restore.
- Per-table progress, skipped rows and warnings.
- Supports legacy v1 restore bundles and new v2 backup bundles.

## Security / limits

This browser-based backup does **not** include:

- Supabase Auth passwords
- auth.users
- Storage bucket files
- low-level database roles/extensions

For real disaster recovery, keep CLI/database backups too.

If you run `supabase db reset --local`, Auth users may disappear. Restoring profiles/user roles from the browser requires matching Auth user IDs to already exist. For full local database recovery including Auth schema, use Supabase CLI/database dump outside the browser.

## Recommended testing workflow

1. Create your clean baseline in the platform:
   - departments
   - stations
   - managers
   - employees/profiles
   - manager assignments
   - roles/permissions
   - templates

2. Go to:

```text
Settings -> Export & Backup Center
```

3. Export:

```text
Setup Baseline Backup (JSON)
```

4. Save the file safely.

5. Run your heavy tests.

6. To restore inside the app:

```text
Settings -> Import & Restore Center
Upload JSON
Choose Safe Upsert or Replace
Type RESTORE NOW
Start Restore
```

## Files changed

- `src/utils/backupRegistry.ts`
- `src/pages/settings/ExportCenterPage.tsx`
- `src/pages/settings/RestoreCenterPage.tsx`
- `src/App.tsx`
- `src/components/layout/Sidebar.tsx`
- `src/pages/SettingsPage.tsx`
