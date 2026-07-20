# Architecture

The Next.js application authenticates users with Supabase and relies on RLS for tenant-scoped reads and writes. `ResearchService` calls the atomic reservation RPC, enqueues `plan`, and wakes the Edge worker. The worker claims one durable job, runs exactly one canonical stage, atomically commits the result and next job, then performs a best-effort wake-up. The scheduler is the polling and stale-claim recovery fallback.

Gemini configuration, model selection, timeout, retry, grounding parsing, caching, usage accounting, and cost accounting live in `supabase/functions/_shared/research/gemini.ts`. Stage code receives the same Gemini interface through `ResearchDependencies`; tests may inject a fake implementation without replacing production stage logic.

Normalized sources and evidence feed the code-owned 12-factor scoring engine. The report stage uses Gemini only for the cited narrative, while code owns the numeric score and verdict. Reports, versions, charts, and exports are persisted before the completion RPC consumes the reservation.

Terminal failure, cancellation, and stale recovery settle credits through idempotent database functions. No request body can directly execute a run, and queue/cache/usage tables are service-role only.
