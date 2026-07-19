# Architecture

Last reconciled with the repository on 2026-07-18.

ShouldBuild is a Next.js 15 App Router application backed by Supabase Postgres, Auth, Realtime, Storage, and a Deno Edge Function. Browser and Next.js access uses the signed-in user's session; the worker uses the service role and a dedicated dispatch secret.

```text
Next.js UI / API -> validated RLS-scoped reservation RPC -> durable staged queue
  -> authenticated worker claim -> normalized data, report, charts, exports
  -> Supabase Realtime progress and RLS-scoped reads
```

## Boundaries

- `app/`: pages and route handlers.
- `components/`: UI; authenticated report pages do not import samples.
- `lib/repositories/` and `lib/services/`: reusable data access and orchestration.
- `lib/actions/`: Server Actions. The Server Action and REST route both delegate to `ResearchService`; only that service may reserve and enqueue a run.
- `lib/report-data.ts`: RLS-scoped loading of immutable canonical report payloads.
- `lib/sample-reports.ts`: fixtures allowed only on the labelled public sample route.
- `supabase/functions/`: permanent worker source; it must not import the host `lib/` tree.

Some routes still query Supabase directly, so repository/service layering is a convention under migration, not an enforced invariant.

## Auth and tenancy

Supabase Auth uses PKCE. Middleware refreshes sessions, protects workspace pages, and routes incomplete profiles to onboarding. Tenant ownership resolves through `research_runs -> projects -> teams -> team_members`. RLS is the browser/server security boundary. The service-role worker bypasses RLS and must validate its secret and expected run state.

Middleware allows all `/api/*` paths through, so each private route must explicitly authenticate or deliberately rely on RLS. New routes must never assume middleware authenticated them.

## Background work and reports

The app atomically reserves the selected report entitlement while inserting a `Queued` run, then enqueues `plan_research` and wakes `functions/v1/research-worker`. The worker claims exactly one visible durable job, commits its result atomically, and lets the scheduler recover stale claims. It persists status history, normalized output, immutable report versions, chart datasets, and mode-configured private exports.

## Known gaps

- No checkout, payment webhooks, product catalogue, or subscription lifecycle. A trusted paid-credit grant boundary exists for a future billing integration.
- No automated browser E2E or disposable-Supabase integration suite.
- Middleware build emits a Supabase Edge-runtime compatibility warning.
