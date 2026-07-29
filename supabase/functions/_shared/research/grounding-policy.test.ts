import { parseGeminiQuotaError } from "./gemini.ts";
import { groundedCallLimit, groundingFailureAction } from "./grounding-policy.ts";
import { buildResearchPacks } from "./external-retrieval.ts";
import { buildCanonicalResearchBrief } from "./research-brief.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

Deno.test("daily Gemini grounding quota is parsed without exposing credentials", () => {
  const quota = parseGeminiQuotaError(JSON.stringify({
    error: {
      code: 429,
      status: "RESOURCE_EXHAUSTED",
      message: "Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash",
      details: [{ retryDelay: "59.2s" }],
    },
  }));
  assert(quota?.metric === "generativelanguage.googleapis.com/generate_content_free_tier_requests", "quota metric missing");
  assert(quota?.limit === 20, "quota limit missing");
  assert(quota?.retryDelayMs === 59_200, "retry delay missing");
  assert(quota?.dailyExhausted, "daily exhaustion was not classified");
});

Deno.test("optional daily quota exhaustion degrades once instead of retrying the queue", () => {
  const quota = { metric: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", limit: 20, retryDelayMs: 59_000, dailyExhausted: true };
  assert(groundingFailureAction("optional", quota, "429 RESOURCE_EXHAUSTED") === "degrade", "optional grounding did not degrade");
  assert(groundingFailureAction("required", quota, "429 RESOURCE_EXHAUSTED") === "fail", "required daily quota should fail without repeated retries");
});

Deno.test("grounding call budgets are bounded by report mode", () => {
  assert(groundedCallLimit("disabled", "quick_scan", 4) === 0, "disabled mode made a call");
  assert(groundedCallLimit("optional", "quick_scan", 4) === 3, "Quick Scan did not reserve its three decision-purpose calls");
  assert(groundedCallLimit("required", "quick_scan", 5) === 3, "Quick Scan planned more than three pre-repair calls");
  assert(groundedCallLimit("optional", "full_validation", 9) === 8, "Full Validation exceeded eight normal calls");
  assert(groundedCallLimit("required", "full_validation", 4) === 4, "required mode lost packs");
});

Deno.test("Full Validation deliberately covers six decision research packs", () => {
  const input = {
    idea_name: "Auditable RFP assistant",
    idea_description: "Security questionnaire evidence and stale claim detection",
    target_customer: "Cybersecurity proposal teams",
    target_region: "Global",
    market_type: "B2B SaaS",
  };
  const packs = buildResearchPacks(
    input,
    "full_validation",
    buildCanonicalResearchBrief(input),
  );
  assert(packs.length === 6, "Full Validation pack depth drifted");
  assert(new Set(packs.map((pack) => pack.key)).size === 6, "Full Validation query families are not distinct");
  assert(packs.some((pack) => pack.key === "full_pricing_wtp_procurement") && packs.some((pack) => pack.key === "full_adversarial"), "pricing or adversarial pack missing");
});
