import {
  assessSemanticRelevance,
  buildCanonicalResearchBrief,
  classifyPageAuthority,
} from "./research-brief.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const brief = buildCanonicalResearchBrief({
  idea_name: "Customer approval audit trail",
  idea_description: "A lightweight approval and audit-trail workspace for service teams that need to collect customer sign-off, preserve attributable approval history and reduce disputes.",
  target_customer: "Service teams that deliver work to customers",
  market_type: "B2B SaaS",
  target_region: "Global English-speaking markets",
  assumptions: { buyer: "Service operations leaders and agency owners" },
});

Deno.test("canonical brief preserves the exact proposition and approval boundary", () => {
  assert(brief.exactProductProposition.includes("collect customer sign-off"), "proposition changed");
  assert(brief.directCompetitorCategory.includes("Client approval"), "wrong competitor category");
  assert(brief.adjacentOutOfScopeCategories.some((item) => item.includes("CI/CD")), "CI/CD boundary missing");
});

Deno.test("approval evidence passes while generic DevOps evidence is rejected", () => {
  const direct = assessSemanticRelevance(
    brief,
    "Agency project managers collect client approval on deliverables and retain a timestamped audit trail showing who approved each version.",
    "buyer_behavior",
  );
  const drift = assessSemanticRelevance(
    brief,
    "A YAML CI/CD pipeline automates deployment approvals and continuous delivery for engineering teams.",
    "competition",
  );
  assert(direct.acceptanceDecision === "accepted_core", "direct approval evidence rejected");
  assert(direct.matchedDimensions.length >= 3, "brief dimensions were not recorded");
  assert(drift.classification === "out_of_scope" && drift.acceptanceDecision === "rejected", "DevOps drift was not rejected");
  assert(drift.mismatchReasons.some((reason) => reason.includes("DevOps/CI/CD")), "drift reason missing");
});

Deno.test("page authority is classified from page content and purpose", () => {
  const pricing = classifyPageAuthority({
    url: "https://vendor.test/pricing",
    title: "Plans and pricing",
    text: "Approval workspace plans cost $20 per month and include client sign-off history.",
    provider: "brave",
    relevanceScore: 0.9,
  });
  assert(pricing.pageType === "official_pricing" && pricing.sourceTier === 1, "pricing page authority wrong");
  assert(pricing.promotionalBias === "high", "promotional bias not preserved");
});
