# ShouldBuild

ShouldBuild is an authenticated market-validation application. It uses Gemini grounded research, selective public evidence boosters, deterministic 12-factor scoring, and immutable cited reports.

The sole research path is:

```text
plan → grounded_research → evidence_boosters → validate_normalize
     → analyze_score → generate_report → generate_exports → complete
```

The durable Supabase queue owns retries, cancellation, stale-claim recovery, and terminal credit settlement. Gemini is the only generative provider. GitHub, Hacker News, and direct retrieval of Gemini-cited public pages are optional evidence boosters; they never replace the grounded research stage.

## Product foundation

- Next.js App Router, Supabase Auth, onboarding, teams, projects, dashboard, settings, report history, and comparison.
- Supabase RLS, private exports, durable jobs, scheduler recovery, and exactly-once credit finalization/restoration.
- Evidence Graph tables, attributable evidence normalization, deterministic scoring, chart datasets, immutable report versions, and PDF/Markdown/CSV/JSON exports.
- Quick Scan and Full Validation modes. Paid checkout is not implemented.

## Local development

Requirements: Node.js, Deno 2, Docker Desktop, and the Supabase CLI.

```bash
copy .env.example .env.local
npm install
npx supabase start
npx supabase db reset
npm run dev
```

Populate ignored local environment files; never add real credentials to `.env.example`.

## Verification

```bash
npm run check
npm run test:queue
npm run test:gemini
npm run test:rls
npm run smoke:worker
npm run smoke:scheduler
npm run test:pipeline
npx supabase db reset
```

`test:pipeline` calls the real local Edge worker and Gemini API. It requires local Supabase to be running and `GEMINI_API_KEY` to be available to the Edge runtime.

## Repository map

```text
app/                    Next.js routes and authenticated APIs
components/             application and report UI
lib/                    server services, repositories, schemas, and Supabase clients
public/                 deliberate product assets
scripts/                repeatable verification and maintenance commands
supabase/functions/     worker, scheduler, and canonical Gemini hybrid engine
supabase/migrations/    immutable migration history plus forward-only cleanup
tests/e2e/              browser journey coverage
docs/                   current operating documentation
```

See [Architecture](./docs/Architecture.md), [Pipeline](./docs/Pipeline.md), [Database](./docs/Database.md), [Secrets](./docs/Secrets.md), [Security](./docs/Security.md), and [Deployment](./docs/Deployment.md).
