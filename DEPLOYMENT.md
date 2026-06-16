# Deploying Almodawat Employee Portal (Supabase + Vite)

This app is a Vite/React single-page app (SPA) using Supabase.

## 1) Create a Supabase project

1) Create a Supabase project.
2) Enable **Email/Password** auth.
3) Create/import your tables (profiles, departments, user_roles, evaluations, ...).
4) (Recommended) Install audit logs:
   - run `supabase/sql/00_audit_logs.sql` in Supabase SQL Editor
5) (Recommended) Review and apply RLS:
   - use `supabase/sql/01_rls_template.sql` as a starting point

## 2) Environment variables

Set these in your deployment environment (Vercel/Netlify/etc):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Locally, put them in `.env`:

```bash
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="YOUR_ANON_KEY"
```

## 3) Build

```bash
npm install
npm run build
```

The output goes to `dist/`.

## 4) Host (Vercel recommended)

1) Import the repo
2) Set the env vars above
3) Ensure SPA routing:
   - Vercel: usually automatic
   - Netlify: add a `_redirects` file with:
     `/* /index.html 200`

## 5) Production checklist

- Turn on Supabase RLS on all tables that hold sensitive data
- Validate `user_roles` is locked down:
  - admin can manage roles
  - super_user can manage non-admin roles
  - **admin only** can create/assign the `admin` role
- Make sure the service role key is **never** used in the frontend
- Configure allowed redirect URLs in Supabase Auth settings
