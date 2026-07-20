# Gemini hybrid pipeline

1. `plan` loads the run, creates the opportunity idempotently, and initializes metrics.
2. `grounded_research` runs Gemini with Google Search grounding. Quick Scan uses one broad pass plus a conditional disconfirming pass; Full Validation uses bounded problem, competition/pricing, market/GTM, and risk packs.
3. `evidence_boosters` retrieves a bounded set of Gemini-cited pages and selectively queries Hacker News or GitHub for relevant technical audiences.
4. `validate_normalize` accepts only claims whose canonical URL appears in grounding metadata or booster results. It persists sources, evidence, artifacts, clusters, coverage gaps, and the adversarial gate idempotently.
5. `analyze_score` computes all 12 factors deterministically, applies the code-owned adversarial downgrade, and builds chart datasets from persisted rows.
6. `generate_report` asks the canonical Gemini client for exactly three cited narrative sentences, validates every citation, and persists the report, immutable version, and charts.
7. `generate_exports` renders and privately stores the mode-allowed PDF, Markdown, CSV, and JSON files with checksums.
8. `complete` calls the idempotent finalization RPC, consumes the reservation once, and records final metrics.

There is no alternate engine, provider fallback, multi-pass discovery executor, gap cycle, or fixture-only production path. Transient provider failures retry through durable queue limits. Permanent schema, attribution, citation, or completeness failures terminalize the run and restore its reservation.
