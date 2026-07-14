# Troubleshooting

## Migration Timeouts on `supabase db push`
**Error**: `failed to connect to postgres: dial error (timeout)`
**Cause**: The Supabase CLI defaults to connecting to the database pooler which may use an IPv4 address or standard port that is heavily throttled or blocked in some network environments.
**Fix**: 
Run `supabase db push` with a direct connection string or use the provided DB password:
```bash
supabase db push --db-url "postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"
```
Or just reset and try again.

## Auth user triggers not firing
**Error**: The `users` table is empty even after signing up.
**Cause**: The Postgres trigger `on_auth_user_created` might have failed silently or RLS policies prevent the trigger's operations.
**Fix**:
Ensure `handle_new_user` has `security definer` set so it bypasses RLS and can insert rows into `public.users`. Verify by checking the Supabase Postgres logs in the Dashboard.

## Edge Function Webhook not triggering
**Error**: A `research_run` stays in `Queued` state forever.
**Cause**: The webhook is either not configured, or the Edge Function URL is incorrect.
**Fix**:
1. Check the **Webhooks** section in the Dashboard. Look for failing delivery logs.
2. Ensure you have deployed the Edge Function and the secrets are set correctly.
3. Check the Edge Function logs in the Supabase Dashboard for runtime errors.
