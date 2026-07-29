import {
  applyFactorEvidenceConfidence,
  calculateDeterministicScore,
  computeFactors,
  CRITERIA,
  type Criterion,
  type FactorResult,
} from "./scoring-engine.ts";
import {
  buildFounderFitFactor,
  buildInterpretedDecisionBrief,
  buildScoreChangeContract,
  buildVerificationCardPayload,
  deriveReadinessRollups,
  READINESS_ROLLUP_MAPPING,
  type FullValidationDecisionContract,
} from "./readiness-contract.ts";
import { startResearchRunSchema } from "../report-schema.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const weights = CRITERIA.map((criterion) => ({ criterion, weight: 1 }));
const completeFounder: FullValidationDecisionContract = {
  decisionBeingConsidered: "Whether to fund and build a paid pilot",
  targetMilestone: "Two attributable paid pilots",
  deadline: "2026-10-31",
  availableTimeHoursPerWeek: 20,
  availableBudgetAmount: 5_000,
  budgetCurrency: "USD",
  founderSkills: "Product engineering and founder-led B2B sales",
  skillFit: "strong",
  domainExperience: "Five years operating agency approval workflows",
  domainExperienceLevel: "deep",
  existingAudience: "owned_target_audience",
  existingAudienceDetails: "Newsletter read by agency operators",
  buyerAccess: "direct",
  buyerAccessDetails: "Ten agency owners available for interviews",
  platformTolerance: "medium",
  regulatoryTolerance: "low",
  abandonmentConditions:
    "Abandon if ten qualified trials produce zero paid commitments.",
  confirmed: true,
};

function factor(
  criterion: Criterion,
  effectiveScore: number,
  coefficient = 0.8,
): FactorResult {
  return {
    criterion,
    score: effectiveScore,
    rawScore: effectiveScore,
    effectiveScore,
    evidenceCoefficient: coefficient,
    evidenceState: coefficient >= 0.7
      ? "EVIDENCED"
      : coefficient >= 0.3
      ? "SUGGESTIVE"
      : "ASSUMED",
    evidenceIds: [],
    supportingEvidenceIds: [],
    challengingEvidenceIds: [],
    confidenceDeductions: [],
    unresolvedGaps: coefficient >= 0.7 ? [] : ["Direct evidence missing."],
    note: "fixture",
  };
}

Deno.test("complete founder profile produces input-backed founder fit and an interpreted brief", () => {
  const result = buildFounderFitFactor(completeFounder, []);
  assert(result.evidenceState === "EVIDENCED", "complete profile not evidenced");
  assert(result.rawScore > 80, "complete high-fit profile scored unexpectedly low");
  const brief = buildInterpretedDecisionBrief(completeFounder);
  assert(brief.includes("Two attributable paid pilots"), "milestone omitted");
  assert(brief.includes("Abandon if"), "abandonment condition omitted");
});

Deno.test("Full Validation intake requires the confirmed decision contract while Quick Scan stays compatible", () => {
  const base = {
    project_id: "00000000-0000-4000-8000-000000000001",
    idea_name: "Agency approvals",
    idea_description: "Approval workflow for independent agencies",
    target_customer: "Independent agencies",
    market_type: "B2B" as const,
    target_region: "Global",
    idempotency_key: "00000000-0000-4000-8000-000000000002",
  };
  assert(
    startResearchRunSchema.safeParse({
      ...base,
      mode: "quick_scan",
      assumptions: {},
    }).success,
    "Quick Scan unexpectedly requires a decision contract",
  );
  assert(
    !startResearchRunSchema.safeParse({
      ...base,
      mode: "full_validation",
      assumptions: {},
    }).success,
    "Full Validation started without confirmation",
  );
  assert(
    startResearchRunSchema.safeParse({
      ...base,
      mode: "full_validation",
      assumptions: { decisionContract: completeFounder },
    }).success,
    "confirmed Full Validation decision contract was rejected",
  );
});

Deno.test("missing founder profile stays ASSUMED, neutral, and confidence-reducing", () => {
  const result = buildFounderFitFactor(null, []);
  assert(result.evidenceState === "ASSUMED", "missing profile was inferred");
  assert(result.rawScore === 50 && result.effectiveScore === 50, "missing profile was penalized or rewarded");
  assert(result.evidenceCoefficient === 0, "missing profile did not reduce confidence");
  assert(result.note.includes("No founder-fit conclusion"), "a founder conclusion was fabricated");
});

Deno.test("strong market remains distinct from poor founder and constraint fit", () => {
  const poorFounder = buildFounderFitFactor({
    ...completeFounder,
    availableTimeHoursPerWeek: 2,
    availableBudgetAmount: 0,
    skillFit: "gap",
    domainExperienceLevel: "none",
    existingAudience: "none",
    buyerAccess: "none",
  }, []);
  const factors = CRITERIA.map((criterion) =>
    criterion === "founderFit"
      ? poorFounder
      : factor(
        criterion,
        ["platformDependencyRisk", "regulatoryRisk"].includes(criterion)
          ? 15
          : 90,
      )
  );
  const rollups = deriveReadinessRollups(factors, weights);
  const market = rollups.find((item) => item.key === "marketEvidence")!;
  const founder = rollups.find((item) =>
    item.key === "founderAndConstraintFit"
  )!;
  assert(market.score >= 85, "strong market rollup was lost");
  assert(founder.score < market.score, "poor founder fit was hidden by market evidence");
});

Deno.test("weak evidence cannot turn a high raw factor into high readiness or confidence", () => {
  const result = applyFactorEvidenceConfidence({
    criterion: "painSeverity",
    score: 95,
    note: "fixture",
  }, []);
  assert(result.rawScore === 95, "raw fixture score changed");
  assert(result.effectiveScore === 50, "weak evidence did not pull readiness to neutral");
  assert(result.evidenceState === "ASSUMED" && result.evidenceCoefficient === 0, "weak evidence reported false confidence");
});

Deno.test("score-change contract names upgrade, downgrade, kill, and unresolved evidence", () => {
  const factors = CRITERIA.map((criterion, index) =>
    factor(criterion, 55 + index, criterion === "willingnessToPay" ? 0.1 : 0.8)
  );
  const contract = buildScoreChangeContract({
    score: 68,
    factors,
    weights,
    founderContract: completeFounder,
  });
  assert(contract.question === "What gets this score from 68 to 70?", "X-to-Y question is unstable");
  assert(contract.answer.includes("Obtain this score-changing evidence"), "upgrade recommends wording instead of evidence");
  assert(contract.materialDownwardEvidence.length > 20, "downgrade evidence missing");
  assert(contract.strongestKillCondition === completeFounder.abandonmentConditions, "confirmed kill condition was ignored");
  assert(contract.highestLeverageUnresolvedAssumption.startsWith("willingnessToPay"), "highest-leverage assumption is incorrect");
});

Deno.test("rollup mapping covers every official factor exactly once and excludes confidence", () => {
  const mapped = Object.values(READINESS_ROLLUP_MAPPING).flat();
  assert(mapped.length === 12, "rollup mapping changed the official factor count");
  assert(new Set(mapped).size === 12, "a factor appears in multiple readiness rollups");
  assert(CRITERIA.every((criterion) => mapped.includes(criterion)), "an official factor is missing from rollups");
  assert(!mapped.includes("evidenceConfidence" as Criterion), "Evidence Confidence entered readiness");
});

Deno.test("verification-card output is deterministically reproducible", () => {
  const input = {
    ideaName: "Agency approvals",
    score: 68,
    scoreRange: "61–74",
    verdict: "Validate First",
    evidenceConfidence: "Moderate",
    independentEvidenceGroups: 7,
    currentAsOf: "2026-07-29T10:00:00.000Z",
    immutableReportLink:
      "/research/00000000-0000-4000-8000-000000000001/results",
  };
  assert(
    JSON.stringify(buildVerificationCardPayload(input)) ===
      JSON.stringify(buildVerificationCardPayload({ ...input })),
    "verification payload is nondeterministic",
  );
});

Deno.test("Quick Scan regression fixture preserves the neutral assumed founder factor", () => {
  const factors = computeFactors({
    evidence: [
      {
        id: "q1",
        signal_type: "Pain",
        strength: "High",
        title: "Weekly workflow delay",
        snippet: "Agency teams report a weekly workflow delay costing hours.",
        source_tier: 2,
        source_authority: 0.8,
        evidence_directness: 0.7,
        semantic_relevance: 0.8,
        extraction_confidence: 0.9,
        independence_key: "quick-group-1",
      },
      {
        id: "q2",
        signal_type: "Demand",
        strength: "Medium",
        title: "Recurring manual work",
        snippet: "Agency teams repeat this manual workflow every week.",
        source_tier: 2,
        source_authority: 0.8,
        evidence_directness: 0.7,
        semantic_relevance: 0.8,
        extraction_confidence: 0.9,
        independence_key: "quick-group-2",
      },
    ],
    risks: [],
    competitors: [],
    hasPricingModel: false,
    launchStrategyCount: 0,
  });
  const founder = factors.find((item) => item.criterion === "founderFit")!;
  assert(factors.length === 12, "Quick Scan factor architecture changed");
  assert(founder.effectiveScore === 50 && founder.evidenceState === "ASSUMED", "Quick Scan founder behavior changed");
  const score = calculateDeterministicScore(factors, weights);
  assert(score === 50.6, `Quick Scan locked fixture changed: ${score}`);
});
