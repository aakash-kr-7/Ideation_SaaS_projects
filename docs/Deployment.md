# Deployment

The repository has no paid checkout. Use this for staging and require current security, provider, tenancy, migration, and browser smoke evidence before production.

## Target layout

- Next.js on a Node-compatible host.
- One isolated Supabase project per environment for database, Auth, Realtime, Storage, and Edge Functions.
- One canonical HTTPS domain supplied through `NEXT_PUBLIC_SITE_URL`.

## Staging

1. Create separate staging Supabase and application-host projects.
2. Link and apply migrations:

   ```bash
   supabase link --project-ref STAGING_PROJECT_REF
   supabase migration list
   supabase db push --dry-run
   supabase db push
   ```

3. Set worker secrets and deploy:

   ```bash
   supabase secrets set --env-file supabase/functions/research-worker/.env
   supabase functions deploy research-worker --no-verify-jwt
   supabase functions deploy research-scheduler --no-verify-jwt
   ```

   `--no-verify-jwt` is intentional only because the worker validates `WEBHOOK_SECRET`. Never expose that secret to the browser.

4. Configure application variables from [Secrets.md](./Secrets.md) and auth from [Auth-Setup.md](./Auth-Setup.md).
5. Build/deploy Next.js and run the smoke test below with a brand-new account.

Do not add a database webhook; the app enqueues a durable staged job then wakes the worker directly. Schedule `research-scheduler` every 15-30 seconds with service-role authentication for stale-job and orphan-run recovery.

## Mandatory smoke test

- Landing, pricing, sample, robots, sitemap, and social image load on the canonical domain.
- New sign-up/OAuth, onboarding, refresh, and sign-out work.
- Quick Scan and Full Validation reach an honest terminal state.
- A completed report has citations, all normalized sections, and a consistent verdict.
- Quick Scan PDF downloads and opens; Full Validation Markdown, JSON, CSV, and PDF downloads and open.
- Dashboard, compare, settings, and protected redirects work on desktop/mobile.
- Cross-account run, report, export, team, and profile access is rejected.
- Provider and cost-cap failures become visible `Failed` runs.

## Production promotion

Production needs isolated secrets, OAuth, monitoring, alerting, backups, legal review, support, and rollback ownership. A paid launch additionally requires a reviewed billing integration and webhook. Apply migrations before dependent code; deploy the worker before enabling submissions. Record the commit, migration head, worker version, environment owners, smoke evidence, and rollback steps in the release ticket.
