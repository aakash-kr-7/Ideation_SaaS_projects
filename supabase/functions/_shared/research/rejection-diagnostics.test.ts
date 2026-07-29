import { aggregateRejectionDiagnostics } from "./stage-executors/gemini-hybrid/validate-normalize.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

Deno.test("evidence rejection diagnostics expose actionable integrity reasons", () => {
  const result = aggregateRejectionDiagnostics({
    deterministic_relevance_rejected: 2,
    excerpt_not_supported_by_page: 1,
    duplicate_source_claim: 3,
    weak_source_tier: 2,
    "numeric_claim_rejected:source_mismatch": 4,
    invalid_evidence_topic: 1,
  });
  assert(result.semantic_mismatch === 2, "semantic mismatch was not diagnosed");
  assert(result.missing_excerpt === 1, "missing excerpt was not diagnosed");
  assert(result.duplicate_source === 3, "duplicate source was not diagnosed");
  assert(result.weak_authority === 2, "weak authority was not diagnosed");
  assert(result.pricing_mismatch === 4, "pricing mismatch was not diagnosed");
  assert(result.parsing_failure === 1, "parsing failure was not diagnosed");
});
