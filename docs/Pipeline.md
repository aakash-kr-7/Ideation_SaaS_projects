# SignalFit evidence and reasoning pipeline

A research request is always authenticated and database-backed. The API inserts a `Queued` run, dispatches the Edge worker with a dedicated bearer secret, and returns a progress URL. The worker atomically claims only a `Queued` row, schedules the pipeline, and returns `202`.

## Stages

1. `Searching`: run up to five Tavily queries.
2. `Extracting`: persist up to three independently addressable URLs and their Firecrawl markdown.
3. `Normalizing`: use Groq to extract evidence, fall back to Cerebras on Groq failure, then deduplicate with Cohere embeddings (Jaccard is the non-generative dedup fallback).
4. `Scoring`: run six citation-validating specialists over database rows, then compute the deterministic 12-factor score in provider-free code.
5. `Generating`: run the Final Judge over specialist JSON plus stored score breakdowns, create an immutable report version, and upload JSON, Markdown, CSV, and PDF artifacts to private Storage.
6. `Completed` or `Failed`: persist the terminal run state and append the matching stage-history row.

`research_runs.status`, `research_stages.status`, `research_stages.stage_name`, the worker, and the UI share the values exported by `supabase/functions/_shared/research/status.ts`.

## Source of truth

Pipeline code is stored only under `supabase/functions/_shared/`. This location is inside the directory mounted and bundled by Supabase Edge Functions, while remaining importable by Next.js for runtime-neutral schemas, types, and scoring. The worker imports it directly; no manual copy, generated vendor folder, symlink, or ignored duplicate is used.

## Evidence integrity

A source must be inserted successfully before the pipeline can complete. Each `evidence_items.source_id` resolves to a `sources.url`; the report payload carries the same URL for citations. A persistence error aborts the run. The pipeline never substitutes sample URLs, random embeddings, fabricated evidence, or an empty successful result.

Acquisition is methodology-aware and sequential. Pass 1 always issues separate problem-space and solution-space query families, including a named-source market-sizing query. Pass 2 derives named entities and recurring pain language from persisted Pass 1 evidence, then records the triggering evidence UUIDs on every follow-up query. Pass 3 searches explicitly for failure, shutdown, pivot, saturation, strong incumbents, and refusal-to-pay evidence. Each pass is persisted in `research_passes`; every physical query is persisted in `research_queries`.

Sources and evidence carry Tier 1–4 quality, family, pass, exclusion, and disconfirmation metadata. Tier 4 SEO/listicle/promotional sources remain auditable but are excluded from scoring. Cohere embeddings cluster the underlying pain/objection labels without deleting corroborating rows, and each row stores independent source/domain counts. Sufficiency requires two independent problem sources, two independent solution sources, actual disconfirming evidence, a Tier 1 willingness-to-pay signal, Tier 1/2 evidence, and a pain cluster corroborated by two independent identities. Missing coverage deterministically triggers gap-specific escalation while the shared run cost and retrieval-time reserves allow it; otherwise the exact budget-limited gaps are stored and rendered in the report.

Market-size fields are citation-only. A report version may store TAM/SAM/SOM/market-size figures only when the figure maps to an evidence UUID, source UUID, and source URL from the same run. A database trigger enforces the relationship; when no verified figure exists the report stores `null` fields plus `No verifiable market-size data found...`.

## Reasoning stage

The Competition, Market, Pricing, Risk, Demand, and GTM specialists read only structured rows scoped to one `research_run`: `evidence_items` and the normalized opportunity child tables. They never import or instantiate search or extraction providers and do not select `sources.text_content`. Every claim-shaped field requires one or more evidence UUIDs in its Zod schema. Citations are checked again against the run's actual evidence-ID set; invalid or absent citations trigger a retry. After three unsuccessful attempts the section is persisted as `Incomplete`, the error is logged, and the other sections continue.

All structured LLM work uses `ReasoningProvider.generateStructured`. Groq remains primary and Cerebras remains the fallback, with each physical attempt recorded in `api_usage_logs` and charged against the same per-run `CostBudget` used by evidence acquisition. Each specialist receives at most eight deterministically selected, relevant evidence rows. `CEREBRAS_MODEL` is optional and defaults to `gpt-oss-120b`; provider requests time out after 30 seconds, `REASONING_MAX_COMPLETION_TOKENS` defaults to `2048`, and `REASONING_AGENT_PACING_MS` defaults to `8000`. The reasoning phase is bounded to 115 seconds and reserves its final 35 seconds for Final Judge and terminal persistence. Once the specialist window is exhausted, remaining sections are persisted as incomplete; if scoring reaches the reserved boundary, the run fails with a specific logged reason instead of being killed in a transient state. `FORCE_SPECIALIST_AGENT_FAILURE=<agent name>` is a test-only environment switch for exercising the bounded failure path.

Each specialist now runs alongside a context-isolated Cerebras checker. The checker receives the same underlying evidence/source rows but never the specialist output; their categorical directions are compared only after both return, and mismatches persist as disputed interpretations. A one-shot Groq adversarial verdict gate starts from provider-free score factors before the specialist loop and receives no specialist conclusions. Running these checks concurrently preserves the 115-second phase and its 35-second Final Judge reserve. The added seven minimum provider attempts cost approximately `$0.14`, so `RESEARCH_REASONING_COST_RESERVE_USD` defaults to `$0.36` instead of `$0.22`; `RESEARCH_RUN_COST_CAP_USD` remains unchanged.

Final Judge receives the completed disputes and adversarial gate but cannot set the official verdict. Code compares its `written_verdict` with the provider-free mapping and persists any mismatch. A medium/high evidence-cited adversarial objection applies a visible code-owned safety downgrade to `Weak Signal` while preserving the original deterministic verdict separately. After generation, every narrative claim is resolved against a non-excluded `evidence_items` row with a persisted source URL. Invalid claims are removed and recorded; if no sourced executive conclusion remains, the run fails instead of publishing unsupported prose.

The Final Judge receives only specialist JSON and deterministic score data. Its Zod schema represents narrative as sentence records, each carrying at least one `evidence_id` or score criterion. Those sentence-level links are retained in the immutable report payload under `narrativeCitations`.

## Deterministic scoring

`supabase/functions/_shared/research/scoring-engine.ts` is a runtime-neutral module with no provider imports and no networking APIs. It derives the 12 factor values from persisted categorical/numeric inputs, including evidence strength, confidence, supporting/contradicting counts, normalized competitors, risks, pricing, and launch records. Exact evidence IDs used by each factor are returned with that factor and inserted into `score_evidence_refs`.

Weights are read from `scoring_weights`; the migration seeds the current documented defaults, and weights can be adjusted without a code deployment. Risk factors are inverted only during weighted aggregation. Verdict boundaries are `Build Now` 85–100, `Validate First` 70–84, `Niche Down` 55–69, `Weak Signal` 40–54, and `Avoid` 0–39. Offline unit tests include 69/70 and 84/85.

## Report versions and exports

Each generation inserts the next `report_versions.version_number`; database triggers reject updates and deletes of version rows. The worker renders JSON, Markdown, CSV, and PDF server-side, uploads them to `exports/<team UUID>/<run UUID>/v<version>/`, hashes each object, and records its path, size, and SHA-256 digest in `report_exports`. The download API returns these stored objects instead of compiling a report in the browser or route handler.

The `exports` bucket remains private. Its select policy derives the tenant UUID from the first path component and requires a matching `team_members` row for `auth.uid()`. Cross-team guessed paths therefore fail at the Storage policy even when the object name is known.

## Providers, retry, fallback, and cost

- Tavily: search, maximum five logical queries.
- Firecrawl: page extraction, maximum three unique URLs.
- Groq `llama-3.3-70b-versatile`: primary structured evidence and report reasoning.
- Cerebras `gpt-oss-120b` (configurable with `CEREBRAS_MODEL`): reasoning fallback.
- Cohere `embed-english-v3.0`: semantic deduplication.

Every physical provider attempt is logged to `api_usage_logs`, including retry failures. LLM and embedding token usage is stored when returned by the provider. Estimated cost is reserved before each attempt, and the run stops before exceeding `RESEARCH_RUN_COST_CAP_USD`. On resume, the worker loads the run's persisted usage total first, so a retry or regeneration cannot reset the per-run cap.

## Failure semantics

Missing credentials, provider exhaustion during required evidence extraction or Final Judge generation, missing evidence, cost-cap exhaustion, and database errors are fatal. A specialist-only failure is bounded to three attempts and becomes an incomplete section. Fatal errors write `error_logs`, append a `Failed` transition, update `research_runs`, and throw `PipelineError`; the worker never returns fake or empty success.
