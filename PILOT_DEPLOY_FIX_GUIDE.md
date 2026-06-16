# Pilot deploy (Vercel + Supabase Cloud) — quick commands

## 1) Supabase Cloud (database + edge functions)
> Do this **once** for your cloud project.

```bash
# login (opens browser)
supabase login

# link this repo to your Supabase cloud project
supabase link --project-ref YOUR_PROJECT_REF

# push DB migrations to cloud
npm run sb:push

# deploy edge functions to cloud
npm run sb:fn:deploy
```

### Cloud Function secrets (if needed)
Make sure your Supabase project has these (Functions → Secrets):
- `PROJECT_URL` = your Supabase Project URL (https://xxxx.supabase.co)
- `SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`) = service role key

## 2) Vercel (frontend)
In Vercel → Project → Settings → Environment Variables (Production + Preview):
- `VITE_SUPABASE_URL` = Supabase cloud URL
- `VITE_SUPABASE_ANON_KEY` = Supabase cloud **anon/publishable** key

Then redeploy.

## 3) Local dev (no typing)
```bash
npm run sb:start
npm run sb:status
npm run sb:reset
npm run sb:fn:serve
```

## Notes
- If the app works on your PC but **not for your friends**, it usually means the frontend is still pointing to `http://127.0.0.1:54321` (local Supabase). Fix by setting Vercel env vars to the **cloud** Supabase URL/anon key and redeploy.
