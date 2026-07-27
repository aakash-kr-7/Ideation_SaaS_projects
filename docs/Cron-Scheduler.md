# Cron / Scheduler Configuration

The `research-scheduler` Edge Function must be invoked periodically to:

1. Recover stale job claims (jobs claimed but not completed past their timeout).
2. Recover orphaned research runs stuck in non-terminal states.
3. Poll for pending jobs and trigger the worker as a fallback.

## Recommended Interval

Invoke every **15–30 seconds** for responsive job processing and stale recovery.

## Invocation Methods

### Option A: Supabase pg_cron (Pro plan, minimum 1-minute interval)

```sql
-- Run in the Supabase SQL Editor or as a migration
select cron.schedule(
  'research-scheduler',
  '* * * * *',  -- every minute (pg_cron minimum)
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/research-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Set the required settings:

```sql
alter database postgres set app.settings.supabase_url = 'https://YOUR_PROJECT_REF.supabase.co';
alter database postgres set app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

### Option B: External scheduler (for sub-minute intervals)

Use a scheduler that can make an authenticated HTTP POST (for example, QStash or a small dedicated worker). Post directly to the Edge Function using the service-role bearer token shown in [Authentication](#authentication). Do not configure a cron route that does not exist in the Next.js application.

### Option C: Self-trigger loop (built-in)

The worker already attempts a best-effort self-trigger after completing each job. The scheduler is the polling fallback for when self-trigger fails. In low-traffic environments, a 1-minute cron interval combined with self-trigger provides adequate responsiveness.

## Authentication

The scheduler endpoint requires service-role authentication:

```
POST /functions/v1/research-scheduler
Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
Content-Type: application/json
```

The scheduler authenticates by comparing the Authorization header against `SUPABASE_SERVICE_ROLE_KEY`. Unauthenticated requests receive a 401 response.

## Monitoring

After configuring the scheduler, verify with:

```bash
npm run smoke:scheduler
npm run ops:health
```

The operational health endpoint reports:
- Queue depth (pending jobs)
- Recovered stale jobs
- Orphaned runs
- Open operational alerts
