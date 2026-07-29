import { buildResearchPacks, type RetrievedSource } from "./external-retrieval.ts";
import {
  buildCoverageRepairPack,
  evaluateQuickScanCoverage,
  extractValidatedPricingObservations,
  QUICK_SCAN_GROUNDED_CALL_BUDGET,
} from "./quick-scan-research-strategy.ts";
import { buildCanonicalResearchBrief } from "./research-brief.ts";
import { seedsForBrief } from "./competitor-seeds.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const brief = buildCanonicalResearchBrief({
  idea_name: "Approval Ledger",
  idea_description:
    "An approval audit trail for agencies collecting client sign-off",
  target_customer: "Digital agencies",
  market_type: "B2B SaaS",
});

function source(overrides: Partial<RetrievedSource>): RetrievedSource {
  const url = overrides.canonicalUrl || overrides.url ||
    "https://example.com/page";
  return {
    title: "Accepted evidence",
    url,
    canonicalUrl: url,
    snippet: "",
    provider: "direct_http",
    queryFamily: "quick_primary_problem_buyer_demand",
    score: 80,
    text:
      "Digital agencies repeatedly collect client approval and preserve approval history for delivery workflows.",
    sourceTier: 2,
    domain: new URL(url).hostname,
    publisher: new URL(url).hostname,
    sourceClass: "primary",
    extractionMethod: "direct_http",
    retrievalDate: "2026-07-29",
    relevance: {
      score: 0.82,
      classification: "directly_relevant",
      matchedDimensions: [
        "target_buyer",
        "user_workflow",
        "problem",
        "proposed_solution",
      ],
      mismatchReasons: [],
      acceptanceDecision: "accepted_core",
      deterministicChecks: [],
    },
    authority: {
      sourceTier: 2,
      pageType: "official_documentation",
      authorityScore: 0.8,
      directnessScore: 0.82,
      promotionalBias: "medium",
      reason: "test",
    },
    ...overrides,
  };
}

Deno.test("Quick Scan plans exactly three decision-purpose packs", () => {
  const packs = buildResearchPacks({
    idea_name: "Approval Ledger",
    idea_description:
      "An approval audit trail for agencies collecting client sign-off",
    target_customer: "Digital agencies",
    target_region: "Global",
  }, "quick_scan", brief);
  assert(packs.length === 3, "Quick Scan did not plan exactly three packs");
  assert(
    packs.map((pack) => pack.purpose).join(",") ===
      "primary,adversarial,pricing_wtp",
    "Quick Scan call purposes drifted",
  );
  assert(
    QUICK_SCAN_GROUNDED_CALL_BUDGET.maximum === 4,
    "grounded call ceiling drifted",
  );
});

Deno.test("coverage repair triggers are evidence-derived and use a different angle", () => {
  const coverage = evaluateQuickScanCoverage([]);
  assert(
    coverage.repairTriggers.includes("fewer_than_three_independent_groups"),
    "independence trigger missing",
  );
  assert(
    coverage.repairTriggers.includes("no_validated_pricing"),
    "pricing trigger missing",
  );
  assert(
    coverage.repairTriggers.includes("buyer_evidence_absent"),
    "buyer trigger missing",
  );
  const repair = buildCoverageRepairPack(brief, coverage);
  assert(repair.purpose === "coverage_repair", "repair purpose missing");
  assert(/different|first-person|pricing|official/i.test(`${repair.focus} ${repair.query}`), "repair query did not change angle");
});

Deno.test("pricing observations require price text on an accepted official page", () => {
  const pricing = source({
    canonicalUrl: "https://vendor.test/pricing",
    url: "https://vendor.test/pricing",
    queryFamily: "quick_pricing_wtp_reachability",
    text:
      "The Professional plan costs $29 per user per month for client approval workflows.",
    authority: {
      sourceTier: 1,
      pageType: "official_pricing",
      authorityScore: 0.92,
      directnessScore: 0.96,
      promotionalBias: "high",
      reason: "official price",
    },
  });
  const observations = extractValidatedPricingObservations([pricing]);
  assert(observations.length === 1, "official price was not validated");
  assert(observations[0].pricePoint.includes("$29"), "price point drifted");
  assert(observations[0].planName === "Professional", "plan name was not copied from source text");
  assert(
    extractValidatedPricingObservations([
      source({ text: "Pricing is available from sales." }),
    ]).length === 0,
    "a price was invented without numeric source content",
  );
});

Deno.test("independence, adversarial coverage, and source-family coverage are conservative", () => {
  const sources = [
    source({ canonicalUrl: "https://buyer.test/pain", url: "https://buyer.test/pain" }),
    source({
      canonicalUrl: "https://forum.test/thread",
      url: "https://forum.test/thread",
      queryFamily: "quick_adversarial",
      sourceClass: "community",
      text:
        "Agencies say email is good enough and resist switching because approvals are occasional.",
      authority: {
        sourceTier: 2,
        pageType: "community_discussion",
        authorityScore: 0.6,
        directnessScore: 0.78,
        promotionalBias: "low",
        reason: "buyer discussion",
      },
    }),
    source({
      canonicalUrl: "https://vendor.test/pricing",
      url: "https://vendor.test/pricing",
      queryFamily: "quick_pricing_wtp_reachability",
      text: "Professional plan $29 per month for agency approval.",
      authority: {
        sourceTier: 1,
        pageType: "official_pricing",
        authorityScore: 0.92,
        directnessScore: 0.96,
        promotionalBias: "high",
        reason: "official price",
      },
    }),
  ];
  const coverage = evaluateQuickScanCoverage(sources);
  assert(coverage.independentGroups.length === 3, "independent groups collapsed incorrectly");
  assert(coverage.sourceFamilies.length >= 2, "source-family coverage missing");
  assert(coverage.adversarialEvidenceCount === 1, "genuine challenge was not recognised");
  assert(coverage.validatedPricingCount === 1, "validated price not counted");
});

Deno.test("competitor seeds contain candidates only and remain unverified", () => {
  const registry = seedsForBrief(brief);
  assert(registry.categoryId === "client_approval", "idea classification drifted");
  assert(registry.candidates.length >= 1, "candidate registry is empty");
  assert(
    registry.candidates.every((candidate) =>
      !("pricing" in candidate) && !("positioning" in candidate)
    ),
    "seed registry stored assumed pricing or positioning",
  );
});
