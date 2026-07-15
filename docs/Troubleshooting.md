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

## Edge Function dispatch fails
**Error**: A `research_run` stays in `Queued` state forever.
**Cause**: The direct POST from the Next.js server did not reach the function, or `WEBHOOK_SECRET` differs between the app and function.
**Fix**:
1. Inspect the `/api/research/start` or Server Action response.
2. Ensure the Edge Function is deployed and the same dedicated `WEBHOOK_SECRET` is configured on both sides.
3. Check the Edge Function logs and the run's `error_logs` rows.

## Stored export is not ready even though export rows exist
**Error**: An authenticated report export returns HTTP 409 while `report_exports` contains the latest version's artifact.
**Cause**: The export route assumed array cardinality for a nested PostgREST relation that can be returned as an object.
**Fix**: Normalize both object and array relation shapes in `app/api/research/[id]/export/route.ts`, then re-test Markdown, JSON, CSV, and PDF through the browser. Do not fall back to client-generated production files.

## Normalized opportunity output fails schema validation
**Error**: The run fails with missing `competitors`, `risks`, `pricing_model`, `mvp_plan`, or `launch_plan` fields.
**Cause**: Both the primary reasoning provider and fallback exhausted retries without returning the required structured shape.
**Fix**: Tighten the provider prompt/response-format contract and add a fixture covering incomplete compatible-provider JSON. A terminal `Failed` state is correct; substituting empty or mock records is not.
