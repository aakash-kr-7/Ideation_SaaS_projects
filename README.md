# SignalFit

SignalFit is an evidence-backed market-validation SaaS. An authenticated user submits a product idea; SignalFit searches the public web, extracts source material, structures and deduplicates evidence, scores the opportunity across 12 deterministic factors, and stores a cited decision report with one of five verdicts: Build Now, Validate First, Niche Down, Weak Signal, or Avoid.

## Architecture

```text
Next.js App Router
  -> authenticated research_runs insert
  -> authenticated dispatch to Supabase Edge Function
  -> Tavily search
  -> Firecrawl extraction
  -> Groq reasoning (Cerebras fallback)
  -> Cohere embeddings
  -> normalized Postgres records + report_versions
  -> Supabase Realtime progress
```

Postgres, Auth, Realtime, Storage, and Edge Functions run on Supabase. The live public API exposes 37 tables. Every tenant-owned table is protected by Row Level Security through the run -> project -> team relationship. `scoring_weights` is the documented exception: it is global reference data readable by every authenticated user and is not tenant-owned. The Next.js dashboard, progress API, report view, compare API, and export API read only from Supabase; no in-memory research store or mock provider is available to a real research request.

Static data used by the explicitly labelled `/sample-report` page lives in `lib/sample-reports.ts`. It is not imported by authenticated dashboards, progress views, scoring workbenches, report pages, research APIs, or the worker.

## Edge source layout

Supabase’s local Edge container mounts the `supabase/` directory, so worker code must not import the host application’s `lib/` tree. The permanent source of truth is:

```text
supabase/functions/
  _shared/
    research/
      pipeline.ts
      providers.ts
      status.ts
      types.ts
    report-schema.ts
    scoring.ts
    types.ts
  research-worker/
    index.ts
    deno.json
```

The worker imports `../_shared/research/pipeline.ts` directly. Next.js compatibility files such as `lib/scoring.ts`, `lib/report-schema.ts`, and `lib/types.ts` only re-export the shared implementation. Do not copy `lib/` into the function directory, add a vendored mirror to gitignore, or add a deploy-time source copy. Supabase bundles `functions/_shared/` as part of normal function deployment.

## Canonical research status

Both `research_runs.status` and the append-only `research_stages.status` history use exactly:

```text
Queued | Searching | Extracting | Normalizing | Scoring |
Generating | Completed | Failed | Cancelled
```

The TypeScript source is `supabase/functions/_shared/research/status.ts`. A stage-history row records the same value in `stage_name` and `status`.

## Provider safety and observability

The production worker requires `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`, `GROQ_API_KEY`, `CEREBRAS_API_KEY`, and `COHERE_API_KEY`. `CEREBRAS_MODEL` is optional and defaults to `gpt-oss-120b`; provider calls time out after 30 seconds, `REASONING_MAX_COMPLETION_TOKENS` defaults to `2048`, `REASONING_AGENT_PACING_MS` defaults to `8000`, and the reasoning phase reserves 35 seconds of its 115-second budget for Final Judge and terminal persistence. Missing credentials fail the run; no provider factory returns simulated data.

Each real provider attempt, including retries and failures, writes `provider`, `operation`, token counts where the provider supplies them, estimated cost, status, and any error to `api_usage_logs`. A per-run dollar cap is enforced by `RESEARCH_RUN_COST_CAP_USD` (default `1.00`); resumed workers seed the budget from the run's persisted usage total so retries cannot reset the cap. Pipeline failures also write `error_logs`, set the run to `Failed`, and propagate a typed error to the worker.

## Local development

Prerequisites: Node.js 18+, Docker Desktop, and the Supabase CLI.

```bash
npm install
supabase start
npm run dev
```

Set the Next.js Supabase variables and `WEBHOOK_SECRET` in `.env.local`. Set provider keys plus the same dedicated webhook secret in `supabase/functions/research-worker/.env`. Never use the service-role key as the webhook secret.

Checks:

```bash
npx tsc --noEmit --incremental false
supabase functions serve research-worker --env-file supabase/functions/research-worker/.env
npm run build
```

Google OAuth is enabled by the checked-in local `supabase/config.toml` and reads its credentials from the ignored root `.env`. Follow [docs/Auth-Setup.md](./docs/Auth-Setup.md) to configure Google Cloud, restart local Supabase, and verify a brand-new-user journey. Email/password auth remains available for local development.

Deployment:

```bash
supabase db push
supabase secrets set --env-file supabase/functions/research-worker/.env
supabase functions deploy research-worker --no-verify-jwt
```

The function performs its own dedicated bearer-secret check before parsing or processing a worker request.

## Project structure

```text
app/api/research/     authenticated start/progress/report/compare/export APIs
app/research/         idea form, live progress, and stored report pages
components/           UI and report rendering
lib/report-data.ts    normalized, RLS-scoped production report assembly
lib/repositories/     Next.js Supabase data access
lib/services/         server orchestration
lib/sample-reports.ts explicit sample-only fixtures
supabase/migrations/  schema, RLS, Realtime, status, and usage-log migrations
supabase/functions/   Deno worker and permanent shared runtime code
```

See [README-BACKEND.md](./README-BACKEND.md), [README-FRONTEND.md](./README-FRONTEND.md), and [docs/Pipeline.md](./docs/Pipeline.md).
