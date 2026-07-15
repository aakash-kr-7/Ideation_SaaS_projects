# SignalFit evidence pipeline

A research request is always authenticated and database-backed. The API inserts a `Queued` run, dispatches the Edge worker with a dedicated bearer secret, and returns a progress URL. The worker atomically claims only a `Queued` row, schedules the pipeline, and returns `202`.

## Stages

1. `Searching`: run up to five Tavily queries.
2. `Extracting`: persist up to three independently addressable URLs and their Firecrawl markdown.
3. `Normalizing`: use Groq to extract evidence, fall back to OpenRouter on Groq failure, then deduplicate with Cohere embeddings (Jaccard is the non-generative dedup fallback).
4. `Scoring`: synthesize evidence and compute the deterministic 12-factor score.
5. `Generating`: write normalized opportunity, evidence, score, report, and report-version rows.
6. `Completed` or `Failed`: persist the terminal run state and append the matching stage-history row.

`research_runs.status`, `research_stages.status`, `research_stages.stage_name`, the worker, and the UI share the values exported by `supabase/functions/_shared/research/status.ts`.

## Source of truth

Pipeline code is stored only under `supabase/functions/_shared/`. This location is inside the directory mounted and bundled by Supabase Edge Functions, while remaining importable by Next.js for runtime-neutral schemas, types, and scoring. The worker imports it directly; no manual copy, generated vendor folder, symlink, or ignored duplicate is used.

## Evidence integrity

A source must be inserted successfully before the pipeline can complete. Each `evidence_items.source_id` resolves to a `sources.url`; the report payload carries the same URL for citations. A persistence error aborts the run. The pipeline never substitutes sample URLs, random embeddings, fabricated evidence, or an empty successful result.

## Providers, retry, fallback, and cost

- Tavily: search, maximum five logical queries.
- Firecrawl: page extraction, maximum three unique URLs.
- Groq `llama-3.3-70b-versatile`: primary structured evidence and report reasoning.
- OpenRouter `meta-llama/llama-3.3-70b-instruct:free`: reasoning fallback.
- Cohere `embed-english-v3.0`: semantic deduplication.

Every physical provider attempt is logged to `api_usage_logs`, including retry failures. LLM and embedding token usage is stored when returned by the provider. Estimated cost is reserved before each attempt, and the run stops before exceeding `RESEARCH_RUN_COST_CAP_USD`.

## Failure semantics

Missing credentials, provider exhaustion, missing evidence, cost-cap exhaustion, and database errors are fatal. The pipeline writes `error_logs`, appends a `Failed` transition, updates `research_runs`, and throws `PipelineError`. The worker logs that rejection; it does not return fake or empty success.
