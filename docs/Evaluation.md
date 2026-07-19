# Research-quality evaluation

`evaluation/research-quality-cases.json` is the fixed ten-case corpus for every pipeline change. It covers B2B SaaS, consumer, developer, local-service, marketplace, education, healthcare-adjacent, creator, saturated, and low-public-data ideas. The corpus records required evidence families, not desired verdicts.

Run each case through the normal authenticated launch path in an isolated local or staging team. Export the immutable report JSON plus its persisted chart datasets to `evaluation/results/`, then run:

```bash
node scripts/evaluate-research-quality.mjs evaluation/results evaluation/latest-summary.json
```

The resulting JSON is a comparable baseline for source relevance/diversity, citation resolution, contradictory evidence, field completeness, chart integrity, score range, accepted sources, domains, and evidence-item counts. Record per-run `research_pipeline_metrics`, `research_job_attempts`, and `api_usage_logs` alongside it for cost, p50/p90 time, cache hit, fallback, retry, and failure-rate calculations. Do not publish performance claims until a representative baseline has been recorded.
