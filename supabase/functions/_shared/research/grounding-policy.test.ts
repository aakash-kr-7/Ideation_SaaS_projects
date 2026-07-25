import { parseGeminiQuotaError } from "./gemini.ts";
import { groundedCallLimit, groundingFailureAction } from "./grounding-policy.ts";
import { buildResearchPacks } from "./external-retrieval.ts";

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
  assert(groundedCallLimit("optional", "quick_scan", 4) === 1, "Quick optional exceeded one call");
  assert(groundedCallLimit("optional", "full_validation", 4) === 2, "Full optional exceeded two calls");
  assert(groundedCallLimit("required", "full_validation", 4) === 4, "required mode lost packs");
});

Deno.test("lean Full Validation creates exactly four external research packs", () => {
  const packs = buildResearchPacks({
    idea_name: "Auditable RFP assistant",
    idea_description: "Security questionnaire evidence and stale claim detection",
    target_customer: "Cybersecurity proposal teams",
    target_region: "Global",
  }, "full_validation");
  assert(packs.map((pack) => pack.key).join(",") === "problem_demand,competition_pricing,market_gtm,risk_disconfirmation", "research packs drifted");
});
