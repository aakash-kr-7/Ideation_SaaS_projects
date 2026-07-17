# ShouldBuild

ShouldBuild is an evidence-backed market-validation application. A signed-in user describes a product idea; the research pipeline gathers public evidence and produces a cited report with deterministic scoring across 12 factors and one of five verdicts: Build Now, Validate First, Niche Down, Weak Signal, or Avoid.

> **Launch status:** the application builds and its core research tests pass, but it is not ready for a paid public launch. Billing, plan enforcement, production security controls, monitoring, legal pages, and hosted end-to-end verification remain. See [REMAINING_WORK.md](./REMAINING_WORK.md).

## Implemented

- Next.js 15 App Router UI with Supabase Auth, onboarding, dashboard, research, live progress, reports, comparisons, settings, and a public sample report.
- Supabase Postgres, RLS, Realtime, Storage, migrations, and one Deno Edge Function worker.
- Tavily search, Firecrawl extraction, Cohere embeddings, Groq reasoning, and Cerebras fallback.
- Broad, targeted, and adversarial retrieval with source tiering and citation checks.
- Provider-free 12-factor scoring and code-owned verdict selection.
- Immutable report versions and server-generated Markdown, JSON, CSV, and PDF exports.
- Per-run provider cost cap, usage records, terminal failure states, and error logging.

The pricing page describes four subscription plans, but paid checkout and plan entitlements are not implemented. Existing billing and feature-limit tables are schema foundations only.

## System overview

```text
Browser
  -> authenticated Next.js route or Server Action
  -> Queued research_runs row
  -> authenticated Supabase Edge Function dispatch
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
npm run build
```

`npm run lint` is not yet a valid CI check because ESLint is unconfigured.

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
REMAINING_WORK.md          canonical launch backlog
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
- [Remaining work](./REMAINING_WORK.md)

## Verified on 2026-07-17

- `npm run build`: passed; it reports a Supabase Edge-runtime warning from middleware.
- `npm run test:scoring`: passed, 22 tests.
- `npm run lint`: blocked by interactive ESLint setup.
- Dependency vulnerability audit: not completed because registry access required approval to export dependency metadata.

These checks do not replace hosted migrations, live provider runs, browser E2E, RLS adversarial tests, payment tests, or production smoke tests.
