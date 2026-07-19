# ShouldBuild

ShouldBuild is an evidence-backed market-validation application. A signed-in user describes a product idea; the research pipeline gathers public evidence and produces a cited report with deterministic scoring across 12 factors and one of five verdicts: Build Now, Validate First, Niche Down, Weak Signal, or Avoid.

> **Launch status:** paid checkout is not available. The repository includes report entitlements and a trusted paid-credit grant boundary, but no billing provider, products, prices, subscriptions, or purchase flow. Hosted provider, security, and end-to-end verification remain deployment responsibilities.

## Implemented

- Next.js 15 App Router UI with Supabase Auth, onboarding, dashboard, research, live progress, reports, comparisons, settings, and a public sample report.
- Supabase Postgres, RLS, Realtime, Storage, migrations, and one Deno Edge Function worker.
- Tavily search, Firecrawl extraction, Cohere embeddings, Groq reasoning, and Cerebras fallback.
- Broad, targeted, and adversarial retrieval with source tiering and citation checks.
- Provider-free 12-factor scoring and code-owned verdict selection.
- Immutable report versions and mode-aware server exports: Quick Scan PDF; Full Validation Markdown, JSON, CSV, and PDF.
- Per-run provider cost cap, usage records, terminal failure states, and error logging.

The access page deliberately marks paid Full Validation, subscriptions, and report packs unavailable. The database currently enforces one-credit Quick Scan and three-credit Full Validation reservations; it does not implement billing.

## System overview

```text
Browser
  -> authenticated Next.js route or Server Action -> ResearchService
  -> reservation RPC + Queued research_runs row + staged queue job
  -> authenticated Supabase Edge Function job claim
  -> Tavily / Firecrawl / Cohere / Groq (Cerebras fallback)
  -> normalized rows, deterministic score, report version, exports
  -> Realtime progress and RLS-scoped report reads
```

The worker source of truth is `supabase/functions/`. Do not copy the host application's `lib/` tree into the Edge Function.

## Local development

Requirements: Node.js 18+, Deno, Docker Desktop, and the Supabase CLI.

```bash
npm install
supabase start
npm run dev
```

1. Copy `.env.local.example` to `.env.local` for Next.js.
2. Copy `.env.example` to `.env` only for local Google OAuth.
3. Create ignored `supabase/functions/research-worker/.env` using [docs/Secrets.md](./docs/Secrets.md).
4. Never commit real environment files.

Checks:

```bash
npx tsc --noEmit --incremental false
npm run test:scoring
npm run lint
npm run build
npm run audit:truth
```

## Canonical statuses

`Queued`, `Searching`, `Extracting`, `Normalizing`, `Scoring`, `Generating`, `Completed`, `Failed`, and `Cancelled` are shared by the database, worker, API, and UI. The TypeScript source is `supabase/functions/_shared/research/status.ts`.

## Project map

```text
app/                       pages and authenticated API routes
components/                product UI and report rendering
lib/                       auth, repositories, services, schemas, adapters
public/                    social image and source-logo assets
supabase/migrations/       migration-first schema and RLS
supabase/functions/        Edge worker and shared pipeline code
docs/                      technical and operating documentation
```

## Documentation

- [Architecture](./docs/Architecture.md)
- [Authentication](./docs/Auth-Setup.md)
- [Database](./docs/Database.md)
- [Pipeline](./docs/Pipeline.md)
- [Secrets](./docs/Secrets.md)
- [Security](./docs/Security.md)
- [Deployment](./docs/Deployment.md)
- [Troubleshooting](./docs/Troubleshooting.md)

## Verification

Run the commands above in the target environment. A checked-in status statement is not a substitute for current CI output or hosted smoke testing.

These checks do not replace hosted migrations, live provider runs, browser E2E, RLS adversarial tests, or production smoke tests. Payment testing is not applicable until a billing integration exists.
