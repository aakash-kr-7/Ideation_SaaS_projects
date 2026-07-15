# SignalFit backend

SignalFit uses Supabase Postgres, Auth, Realtime, Storage, and one Deno Edge Function worker. Tenant ownership flows through `research_runs -> projects -> teams`; RLS protects direct and indirect child-table access. The public schema currently contains 37 tables. `scoring_weights` is global authenticated reference data; the other user-addressable rows are tenant-, team-, run-, or user-scoped, or service-role-only.

## Pipeline status

The evidence and reasoning pipeline is integrated and production-backed:

1. Tavily searches public evidence.
2. Firecrawl extracts source content.
3. Groq performs primary structured reasoning, with Cerebras as the fallback through the same `ReasoningProvider` interface.
4. Cohere embeddings support semantic deduplication.
5. Six citation-validating specialists read structured database rows only.
6. Provider-free code computes all 12 weighted factors and the verdict.
7. Final Judge writes citation-bearing narrative records from specialist JSON and deterministic scores.
8. The worker creates immutable report versions and stores server-generated JSON, Markdown, CSV, and paginated PDF exports in the private `exports` bucket.

Every physical provider attempt is recorded in `api_usage_logs` and charged against the per-run cost cap. Provider requests, specialist execution, and the overall reasoning phase are time-bounded so a run reaches `Completed` or `Failed` instead of remaining transient after provider exhaustion.

See [docs/Pipeline.md](docs/Pipeline.md) for stage, retry, scoring, traceability, export, and failure details.
