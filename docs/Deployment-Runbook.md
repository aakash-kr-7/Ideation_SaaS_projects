# Production Deployment Runbook

This runbook prepares a production deployment; it does not authorize a deployment. The canonical pre-launch proof is `npm run release`.

## 1. Prerequisites

- A Vercel project, production domain, and DNS access.
- A separate production Supabase project, current Supabase CLI, and an operator permitted to set project secrets.
- A Google OAuth production client and a Gemini key with grounding access.
- The values described in [Environment Variables](./Environment-Variables.md). Never paste real credentials into a committed file, terminal transcript, or release artifact.

## 2. Supabase project and database

1. Create the production project and record its project reference, URL, anon key, and service-role key in the secret manager.
2. Link the operator workstation, then apply the existing migrations in order with `npx supabase db push`. Do not edit, reorder, or replay individual applied migrations.
3. Run `npm run verify:db` against the prepared environment. Confirm deterministic `source_registry` seeding, buckets and policies, worker/scheduler/rate-limit RPCs, RLS, and service-role-only internal tables.
4. Enable Realtime for the configured research tables exactly as migrations specify.

## 3. Storage

Migrations create the private `exports`, `cached-sources`, and `user-assets` buckets and their policies. Verify bucket existence and policy behavior after migration; do not create alternate buckets manually. Run the RLS gate before launch.

## 4. Edge Functions, worker, and scheduler

1. Populate Supabase secrets from `supabase/functions/.env.production.example`; `GEMINI_API_KEY` and `WEBHOOK_SECRET` are required for the live pipeline. Supabase supplies its own URL and service-role credentials to functions.
2. Deploy the canonical `research-worker` and `research-scheduler` functions with the project reference. Keep JWT verification configuration consistent with the authenticated webhook contract in each function.
3. Configure one authenticated scheduler trigger for `research-scheduler` (for example, an every-minute pg_cron/net request) with an Authorization bearer value matching `WEBHOOK_SECRET`. Store that value in the scheduler secret store, never inline it in SQL history.
4. Check the scheduler and worker health endpoints, then run `npm run smoke:worker` and `npm run smoke:scheduler` in the deployment verification environment.

## 5. Vercel web application

1. Import the repository into Vercel and set production-only values from `.env.production.example`.
2. Required web values: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WEBHOOK_SECRET`, and `SHOULDBUILD_DEPLOYMENT_ENV=production`.
3. Leave Gemini and all payment variables out of Vercel browser-exposed variables. Gemini belongs in Supabase Edge Function secrets. Payment variables remain unset because payments are not implemented.
4. Require the Vercel production build to pass before promotion.

## 6. Domain, Auth, and OAuth

1. Attach the production domain in Vercel, complete DNS, and confirm HTTPS.
2. Set Supabase Auth Site URL to `https://<production-domain>` and allow exact production callback, verification, and reset URLs used by the app: `/auth/callback`, `/auth/verify`, and `/auth/reset-password` (plus the API callback if enabled).
3. In Google Cloud, authorize `https://<project-ref>.supabase.co/auth/v1/callback`; enable the same Google client in Supabase Auth.
4. Configure production SMTP, email verification, and password-reset templates to use the production domain.

## 7. Headers, CORS, rate limits, alerts, and monitoring

- Set `SHOULDBUILD_DEPLOYMENT_ENV=production`; Next.js then serves the production CSP, HSTS, HTTPS upgrade, frame, MIME, referrer, and permissions headers. Verify with `npm run verify:headers` against the deployed domain.
- Restrict function CORS to the production origin(s) in deployed configuration; do not use a wildcard production origin.
- Verify distributed rate-limit RPCs after migrations and run a rate-limit exercise before accepting traffic.
- Configure the signed operational-alert webhook secret and endpoint, then run `npm run verify:alerts` and `npm run ops:health`.
- Set Supabase managed backups/PITR appropriate to the plan and schedule a restore rehearsal. Follow [Backup and Recovery](./Backup-Recovery.md).

## 8. Post-deployment smoke and launch verification

1. Confirm `/api/health`, `/api/health/release`, worker health, scheduler health, and authenticated ops health.
2. Complete authenticated Quick Scan and Full Validation journeys; observe live progress, cancellation/recovery, reports, Evidence Graph, and all four exports.
3. Confirm tenant isolation, Storage access, Realtime updates, credit exactly-once behavior, headers, alert delivery, and backup/restore status.
4. Archive the passing `npm run release` output as the single bundle under `artifacts/certified-release/`.

## 9. Rollback and recovery

Promote the previous Vercel deployment, redeploy the matching Edge Function version, then use a forward-only corrective migration if database remediation is required. Do not delete or rewrite applied migrations. For data recovery, use the documented restore procedure and validate RLS, Storage, queue state, and credit reservations before reopening traffic.

