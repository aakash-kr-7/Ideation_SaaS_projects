import type { RetrievedSource } from "./external-retrieval.ts";
import {
  buildFullValidationPacks,
  contradictionMatchesProposition,
  decomposeFullValidationPropositions,
  evidenceAppliesToProposition,
  evaluateFullValidationCoverage,
  FULL_VALIDATION_NORMAL_CALL_LIMIT,
  FULL_VALIDATION_REPAIR_CALL_LIMIT,
  selectConditionalPacks,
} from "./full-validation-research-strategy.ts";
import { buildCanonicalResearchBrief } from "./research-brief.ts";
import { classifyPackFailure, packOutcome } from "./quick-scan-reliability.ts";
import { groundedCallLimit } from "./grounding-policy.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const brief = buildCanonicalResearchBrief({
  idea_name: "Developer Marketplace",
  idea_description:
    "An AI marketplace matching software teams with verified specialist agents for recurring code maintenance",
  target_customer: "Software engineering leaders",
  market_type: "B2B marketplace",
  target_region: "India and United States",
});

function source(overrides: Partial<RetrievedSource>): RetrievedSource {
  const url = overrides.canonicalUrl || overrides.url ||
    "https://example.test/page";
  return {
    title: "Evidence",
    url,
    canonicalUrl: url,
    snippet: "",
    provider: "gemini_grounding",
    queryFamily: "full_buyer_problem",
    score: 90,
    text:
      "Software engineering leaders repeatedly use a weekly workaround for code maintenance.",
    sourceTier: 2,
    domain: new URL(url).hostname,
    publisher: new URL(url).hostname,
    sourceClass: "primary",
    extractionMethod: "direct_http",
    retrievalDate: "2026-07-29",
    relevance: {
      score: 0.9,
      classification: "directly_relevant",
      matchedDimensions: ["target_buyer", "user_workflow", "problem"],
      mismatchReasons: [],
      acceptanceDecision: "accepted_core",
      deterministicChecks: [],
    },
    authority: {
      sourceTier: 2,
      pageType: "buyer_review",
      authorityScore: 0.8,
      directnessScore: 0.85,
      promotionalBias: "low",
      reason: "test",
    },
    ...overrides,
  };
}

Deno.test("Full Validation decomposes seven testable buyer-bound propositions", () => {
  const propositions = decomposeFullValidationPropositions(brief);
  assert(propositions.length === 7, "expected seven propositions");
  assert(
    propositions.every((item) =>
      item.buyerSegment === brief.targetBuyer && item.factorIds.length > 0
    ),
    "proposition lost buyer or factor binding",
  );
});

Deno.test("Full Validation plans six non-overlapping normal grounded packs within budget", () => {
  const packs = buildFullValidationPacks(brief);
  assert(packs.length === 6, "core pack count drifted");
  assert(new Set(packs.map((pack) => pack.key)).size === 6, "packs repeated");
  assert(packs.length <= FULL_VALIDATION_NORMAL_CALL_LIMIT, "normal call budget exceeded");
  assert(
    groundedCallLimit("optional", "full_validation", packs.length) === 6,
    "Full Validation grounded calls were incorrectly degraded",
  );
});

Deno.test("segment-specific evidence never crosses buyer segments", () => {
  const proposition = decomposeFullValidationPropositions(brief)[0];
  assert(evidenceAppliesToProposition(proposition, {
    buyerSegment: brief.targetBuyer,
    researchPack: proposition.primaryPackKey,
  }), "same-segment evidence did not link");
  assert(!evidenceAppliesToProposition(proposition, {
    buyerSegment: "Individual developers",
    researchPack: proposition.primaryPackKey,
  }), "cross-segment evidence linked");
});

Deno.test("contradictions require the same proposition and buyer segment", () => {
  const proposition = decomposeFullValidationPropositions(brief)[1];
  assert(contradictionMatchesProposition(
    proposition,
    { propositionKey: proposition.key, buyerSegment: proposition.buyerSegment },
    { propositionKey: proposition.key, buyerSegment: proposition.buyerSegment },
  ), "valid contradiction did not match");
  assert(!contradictionMatchesProposition(
    proposition,
    { propositionKey: proposition.key, buyerSegment: proposition.buyerSegment },
    { propositionKey: "problem_exists", buyerSegment: proposition.buyerSegment },
  ), "different proposition matched");
  assert(!contradictionMatchesProposition(
    proposition,
    { propositionKey: proposition.key, buyerSegment: proposition.buyerSegment },
    { propositionKey: proposition.key, buyerSegment: "Consumers" },
  ), "different segment matched");
});

Deno.test("repeated underlying claims across URLs count as one evidence group", () => {
  const text = "The same syndicated underlying claim is repeated verbatim.";
  const coverage = evaluateFullValidationCoverage([
    source({ url: "https://one.test/a", canonicalUrl: "https://one.test/a", text }),
    source({ url: "https://two.test/b", canonicalUrl: "https://two.test/b", text }),
    source({ url: "https://three.test/c", canonicalUrl: "https://three.test/c", text }),
  ], brief);
  assert(
    coverage.independentEvidenceGroups.length === 1,
    "syndicated URLs inflated independence",
  );
});

Deno.test("competitor and pricing counts require official live evidence", () => {
  const coverage = evaluateFullValidationCoverage([
    source({
      url: "https://vendor.test/product",
      canonicalUrl: "https://vendor.test/product",
      queryFamily: "full_alternatives_competitors",
      sourceClass: "official",
      authority: {
        sourceTier: 1,
        pageType: "official_product",
        authorityScore: 1,
        directnessScore: 0.9,
        promotionalBias: "high",
        reason: "official product",
      },
    }),
    source({
      url: "https://vendor.test/pricing",
      canonicalUrl: "https://vendor.test/pricing",
      queryFamily: "full_pricing_wtp_procurement",
      text: "The Pro plan costs $49 per user per month.",
      sourceClass: "official",
      authority: {
        sourceTier: 1,
        pageType: "official_pricing",
        authorityScore: 1,
        directnessScore: 0.9,
        promotionalBias: "high",
        reason: "official pricing",
      },
    }),
    source({
      url: "https://blog.test/pricing",
      canonicalUrl: "https://blog.test/pricing",
      queryFamily: "full_pricing_wtp_procurement",
      text: "We think it probably costs $10.",
      sourceClass: "commercial",
      authority: {
        sourceTier: 3,
        pageType: "secondary_article",
        authorityScore: 0.4,
        directnessScore: 0.3,
        promotionalBias: "medium",
        reason: "unverified",
      },
    }),
  ], brief);
  assert(coverage.verifiedCompetitorCount === 1, "competitor verification inflated");
  assert(coverage.verifiedPricingCount === 1, "pricing verification inflated");
  assert(coverage.directWtpCount === 0, "list pricing was treated as WTP");
});

Deno.test("conditional research is trigger-driven, distinct, and capped at two", () => {
  const coverage = evaluateFullValidationCoverage([], brief);
  const repairs = selectConditionalPacks(brief, coverage);
  assert(repairs.length === FULL_VALIDATION_REPAIR_CALL_LIMIT, "repair call cap drifted");
  assert(new Set(repairs.map((pack) => pack.conditionalTrigger)).size === repairs.length, "repair trigger repeated");
  assert(coverage.triggers.includes("marketplace_liquidity"), "marketplace trigger missing");
  assert(coverage.triggers.includes("missing_pricing_wtp"), "pricing/WTP trigger missing");
});

Deno.test("provider failure remains unavailable while empty completed packs remain no-evidence", () => {
  assert(classifyPackFailure(new Error("provider unavailable"), null) === "provider_failed", "provider failure misclassified");
  assert(classifyPackFailure(new Error("request timed out"), null) === "timed_out", "timeout misclassified");
  assert(packOutcome(0) === "completed_no_evidence", "empty completed pack status wrong");
});
