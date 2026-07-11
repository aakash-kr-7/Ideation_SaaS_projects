# BuildSignal

BuildSignal is an evidence-backed opportunity validation workspace for startup, micro-SaaS, app, and tool ideas.

It helps builders decide what to build, what to validate, what to narrow, and what to stop before spending weeks writing production code. A research run turns an idea brief into a structured report with public-signal evidence, competitor teardown, weighted scoring, MVP scope, pricing hypotheses, risks, and a first-customer plan.

## What is included

- Premium landing, dashboard, report, comparison, pricing, settings, and sample-library experiences.
- A 12-factor opportunity score with adjustable weights and inverted platform/regulatory risk factors.
- Explainable verdicts: `Build Now`, `Validate First`, `Niche Down`, `Weak Signal`, and `Avoid`.
- Five clearly labelled sample reports for exploring the framework.
- Interactive pricing calculator, validation experiment checklist, MRR scenarios, and idea comparison matrix.
- Markdown, JSON, CSV, and browser-print PDF export flows.
- Mock-first research pipeline and API routes that work without external API keys.
- Zod report schemas and a Supabase-ready SQL schema.

## Trust model

BuildSignal is deliberately source-aware:

- Sources and evidence context are displayed in reports.
- Inferences and assumptions are separated from verified evidence.
- Scores are explainable and their weights are adjustable.
- Mock data is labelled as sample data.
- Reports reduce uncertainty; they do not guarantee market success.

## Research pipeline

1. Receive an idea brief with buyer, market, region, and research depth.
2. Generate competitor, complaint, pricing, workaround, community, and review queries.
3. Search through a provider abstraction.
4. Extract source context through an extractor abstraction.
5. Deduplicate and classify evidence.
6. Produce a structured analysis and weighted opportunity report.
7. Surface live progress, source count, evidence count, and report completion in the UI.

The repository currently uses mock search, extraction, and structured-analysis providers. These make the product usable locally without keys and explicitly label mock signals. The provider interfaces are designed to be replaced with real Tavily, Serper, Brave, Firecrawl, Jina, OpenAI, Gemini, or Anthropic integrations.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/research/start` | Create and start a research run. |
| `GET` | `/api/research/:id` | Retrieve a research run and report. |
| `GET` | `/api/research/:id/progress` | Retrieve live stage, counts, and completion state. |
| `POST` | `/api/research/:id/export` | Export a completed report as Markdown, JSON, or CSV. |
| `POST` | `/api/research/compare` | Compare up to four completed reports. |

## Run locally

### Prerequisites

- Node.js 18 or later

### Install

```bash
npm install
```

### Start development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

> On Windows systems where PowerShell blocks `npm.ps1`, use `npm.cmd run dev`.

### Production build

```bash
npm run build
```

### Start the production server

```bash
npm run start
```

## Project structure

```text
app/
  api/research/        # Research pipeline route handlers
  dashboard/           # Command center and scoring workspace
  research/            # New run, live progress, and report routes
  sample-report/       # Public sample report
  sample-reports/      # Sample report library
components/
  dashboard/           # Command-center components
  landing/             # Conversion-focused landing page
  opportunity/         # Idea comparison components
  report/              # Validation report, calculator, experiments, exports
  research/            # Research form and progress timeline
  scoring/             # Weight editor and score breakdown
  ui/                  # Reusable buttons, cards, and badges
lib/
  copy.ts              # Shared product and microcopy
  scoring.ts           # 12-factor scoring model and verdict logic
  report-schema.ts     # Zod schemas and report contracts
  report-mocks.ts      # Clearly labelled sample report data
  research/            # Provider abstractions, pipeline, evidence, store
supabase/
  schema.sql           # Supabase-ready persistence schema
```

## Sample data

The sample library includes illustrative reports for:

- Recruiter Resume Reformatting Engine
- Visa Document Compiler
- Stripe Failed Payment Recovery Tool
- Designer Approval Portal
- GEO Audit Suite

They demonstrate report depth and interaction patterns. They are not customer reports, endorsements, or verified market claims.
