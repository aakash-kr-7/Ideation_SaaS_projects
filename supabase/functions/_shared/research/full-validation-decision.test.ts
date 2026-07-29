import {
  applyFullValidationAdversarialGate,
  buildAlternativeMap,
  buildEconomicsScenarios,
  buildFullValidationFactorAnalysis,
  buildThirtyDayActionPlan,
  buildVerdictStructure,
  deterministicDecisionFingerprint,
  rankBuyerSegments,
  type FullValidationEvidence,
} from "./full-validation-decision.ts";
import {
  applyFactorEvidenceConfidence,
  isDirectWillingnessToPayEvidence,
  type Criterion,
  type FactorResult,
} from "./scoring-engine.ts";
import { buildCanonicalResearchBrief } from "./research-brief.ts";
import { runOptionalGroqAdversarialReview } from "./groq-classifier.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

function evidence(
  id: string,
  overrides: Partial<FullValidationEvidence> = {},
): FullValidationEvidence {
  return {
    id,
    signal_type: "Demand",
    strength: "High",
    title: "Buyer evidence",
    snippet: "Agency buyers report urgent weekly workflow delays and paid for a pilot.",
    source_tier: 1,
    excluded: false,
    disconfirming: false,
    evidence_topic: "willingness_to_pay",
    source_authority: 0.9,
    evidence_directness: 0.9,
    semantic_relevance: 0.9,
    extraction_confidence: 0.9,
    independence_key: `group-${id}`,
    evidence_role: "supporting",
    segment: "Agencies",
    numeric_validation_state: "verified",
    ...overrides,
  };
}

function factor(
  criterion: Criterion,
  effectiveScore = 70,
  state: FactorResult["evidenceState"] = "EVIDENCED",
): FactorResult {
  return {
    criterion,
    score: effectiveScore,
    rawScore: effectiveScore,
    effectiveScore,
    evidenceCoefficient: state === "EVIDENCED"
      ? 0.8
      : state === "SUGGESTIVE"
      ? 0.5
      : 0.1,
    evidenceState: state,
    evidenceIds: ["e1", "e2"],
    supportingEvidenceIds: ["e1", "e2"],
    challengingEvidenceIds: [],
    confidenceDeductions: [],
    unresolvedGaps: state === "EVIDENCED" ? [] : ["Direct evidence missing."],
    note: "Test factor",
  };
}

const allFactors = [
  "painSeverity",
  "purchaseUrgency",
  "willingnessToPay",
  "buyerReachability",
  "mvpSpeed",
  "competitionGap",
  "retentionPotential",
  "platformDependencyRisk",
  "regulatoryRisk",
  "founderFit",
  "distributionClarity",
  "speedToFirstRevenue",
] as Criterion[];

Deno.test("segment rankings use evidence strength and explain lower-ranked segments", () => {
  const rows = [
    evidence("e1", { signal_type: "Pricing" }),
    evidence("e2", {
      signal_type: "Pain",
      evidence_topic: "customer_pain",
      snippet: "Agency buyers have urgent weekly delays and purchased a paid pilot.",
    }),
    evidence("e3", {
      segment: "Enterprises",
      strength: "Low",
      source_authority: 0.5,
      evidence_directness: 0.5,
      semantic_relevance: 0.55,
      snippet: "Enterprise interest is occasional and procurement requires legal review.",
      evidence_topic: "segments",
    }),
  ];
  const result = rankBuyerSegments([
    { name: "Agencies", evidenceIds: ["e1", "e2"] },
    { name: "Enterprises", evidenceIds: ["e3"] },
  ], rows);
  assert(result.recommendedSegment === "Agencies", "strong segment not recommended");
  assert(result.rankings[1].rankReason.includes("Ranks lower"), "lower rank unexplained");
  assert(result.rankings[0].metrics.currentSpending > result.rankings[1].metrics.currentSpending, "spending evidence not distinguished");
});

Deno.test("factor analysis persists neutral uncertainty and score sensitivity", () => {
  const assumed = factor("founderFit", 50, "ASSUMED");
  assumed.rawScore = 90;
  assumed.effectiveScore = 54;
  assumed.evidenceIds = [];
  assumed.supportingEvidenceIds = [];
  const analysis = buildFullValidationFactorAnalysis(
    [assumed],
    [],
    "Agencies",
  )[0];
  assert(analysis.evidenceState === "ASSUMED", "evidence state changed");
  assert(analysis.buyerSegmentApplicability[0] === "Agencies", "segment applicability missing");
  assert(analysis.scoreSensitivity.lower < analysis.effectiveScore && analysis.scoreSensitivity.upper > analysis.effectiveScore, "sensitivity range missing");
  assert(analysis.unresolvedAssumptions.length > 0, "assumption missing");
});

Deno.test("missing evidence pulls positive and risk-oriented factors toward neutral", () => {
  const positive = applyFactorEvidenceConfidence({
    criterion: "painSeverity",
    score: 90,
    note: "test",
  }, []);
  const risk = applyFactorEvidenceConfidence({
    criterion: "regulatoryRisk",
    score: 90,
    note: "test",
  }, []);
  assert(positive.effectiveScore === 50, "positive missing evidence was punished");
  assert(risk.effectiveScore === 50, "risk missing evidence was treated as proven risk");
});

Deno.test("economics scenarios use verified ranges and user constraints only", () => {
  const scenarios = buildEconomicsScenarios({
    verifiedPrices: [
      { price: 10, currency: "USD", billingPeriod: "month", sourceId: "p1" },
      { price: 20, currency: "USD", billingPeriod: "month", sourceId: "p2" },
      { price: 30, currency: "USD", billingPeriod: "month", sourceId: "p3" },
    ],
    constraints: {
      revenueTarget: 1200,
      currency: "USD",
      acquisitionCostRange: [20, 60],
      variableCostRange: [2, 6],
      fixedCostRange: [100, 300],
    },
    evidence: [],
    operationalRiskCount: 1,
  });
  assert(scenarios.map((item) => item.price).join(",") === "10,20,30", "price scenarios drifted");
  assert(scenarios[0].customersRequired === 10, "customer requirement incorrect");
  assert(scenarios[0].acquisitionCost === 60 && scenarios[2].acquisitionCost === 20, "scenario conservatism inverted");
  assert(scenarios.every((item) => item.grossMarginRange !== null), "gross margin range missing");
});

Deno.test("alternative map supports all five classes and suppresses unsupported gaps", () => {
  const linked = evidence("c1", {
    evidence_topic: "competitors",
    snippet: "The product serves agencies and customers complain that migration is slow.",
  });
  const map = buildAlternativeMap([
    { id: "1", name: "DirectCo", classification: "direct", verificationStatus: "live_verified_competitor", evidenceIds: ["c1"], target: "Agencies", positioning: "Agency workflow", gap: "Unproven magic automation" },
    { id: "2", name: "AdjacentCo", classification: "adjacent", verificationStatus: "adjacent_alternative", evidenceIds: ["c1"] },
    { id: "3", name: "Manual spreadsheet", classification: "workflow_workaround", verificationStatus: "adjacent_alternative", evidenceIds: ["c1"] },
    { id: "4", name: "Internal homegrown process", classification: "substitute", verificationStatus: "adjacent_alternative", evidenceIds: ["c1"] },
    { id: "5", name: "Do nothing status quo", classification: "substitute", verificationStatus: "adjacent_alternative", evidenceIds: ["c1"] },
  ], [linked]);
  assert(new Set(map.map((item) => item.classification)).size === 5, "alternative classes incomplete");
  assert(map[0].differentiationGap === null, "unsupported gap survived");
  assert(map[0].recurringComplaints.length > 0 && map[0].switchingImplications.length > 0, "complaint or switching evidence missing");
});

Deno.test("WTP distinguishes attributable purchase behaviour from list pricing", () => {
  assert(isDirectWillingnessToPayEvidence(evidence("w1")), "paid pilot not recognized");
  assert(!isDirectWillingnessToPayEvidence(evidence("w2", {
    title: "Vendor pricing",
    snippet: "The vendor lists a $20 monthly plan.",
    evidence_topic: "pricing",
  })), "list price treated as WTP");
});

Deno.test("adversarial gate can preserve, lower, reposition, and block verdicts", () => {
  const rows = [
    evidence("e1"),
    evidence("e2", { snippet: "Buyers paid and switching workflow is realistic." }),
  ];
  const factors = allFactors.map((criterion) => factor(criterion, 75));
  const base = {
    deterministicVerdict: "Build Now",
    factors,
    segmentRankings: [{
      segment: "Agencies",
      score: 80,
      evidenceStrength: 0.8,
      independentEvidenceGroups: 2,
      metrics: {
        painSeverity: 80,
        painFrequency: 80,
        currentSpending: 80,
        reachability: 80,
        switchingFriction: 70,
        urgency: 80,
        procurementComplexity: 70,
      },
      evidenceIds: ["e1", "e2"],
      rankReason: "supported",
    }],
    recommendedSegment: "Agencies",
    alternatives: [],
    evidence: rows,
    risks: [],
  };
  assert(applyFullValidationAdversarialGate(base).verdict === "Build", "supported build was always downgraded");
  assert(applyFullValidationAdversarialGate({ ...base, evidence: rows.map((item) => ({ ...item, evidence_topic: "pricing", snippet: "Vendor list price only." })) }).verdict === "Validate First", "missing WTP did not lower verdict");
  assert(applyFullValidationAdversarialGate({
    ...base,
    alternatives: [{
      id: "c",
      name: "Direct",
      classification: "direct_competitor",
      verified: true,
      targetSegment: "Agencies",
      positioning: "Same wedge",
      verifiedPricing: "$10",
      strengths: [],
      recurringComplaints: [],
      switchingImplications: [],
      differentiationGap: null,
      evidenceIds: ["e3"],
    }],
    evidence: [...rows, evidence("e3", {
      evidence_topic: "competitors",
      evidence_role: "challenging",
      disconfirming: true,
    })],
  }).verdict === "Reposition", "invalidated wedge did not reposition");
  assert(applyFullValidationAdversarialGate({ ...base, strongObjection: true }).verdict === "Do Not Build Yet", "strong objection did not block");
});

Deno.test("verdict structure carries upgrade, downgrade, and explicit kill conditions", () => {
  const structure = buildVerdictStructure({
    verdict: "Validate First",
    exactScore: 68,
    scoreRange: { minimum: 55, maximum: 78, display: "55–78" },
    evidenceConfidence: "Moderate",
    factors: allFactors.map((criterion) => factor(criterion)),
    evidence: [evidence("e1"), evidence("e2", { evidence_role: "challenging", disconfirming: true })],
    recommendedSegment: "Agencies",
    recommendedWedge: "Approval reminders",
  });
  assert(structure.upgradeCondition.includes("paid commitment"), "upgrade condition not falsifiable");
  assert(structure.downgradeCondition.includes("existing alternative"), "downgrade condition missing");
  assert(structure.killCondition.includes("zero") || structure.killCondition.includes("no attributable"), "kill condition not explicit");
});

Deno.test("30-day action plan has thresholds, budget, and prioritized days", () => {
  const plan = buildThirtyDayActionPlan({
    targetSegment: "Agencies",
    wedge: "Approval reminders",
    constraints: { maximumValidationBudget: 800, currency: "USD" },
    recruitmentChannel: "Agency association",
  });
  assert(plan.sampleSize === 12 && plan.durationDays === 30, "plan is not concrete");
  assert(plan.maximumBudget.amount === 800 && !plan.maximumBudget.assumption, "budget constraint lost");
  assert(plan.days.length === 5 && plan.days.every((item, index) => item.priority === index + 1), "30-day priorities invalid");
});

Deno.test("optional Groq failure is non-blocking and receives no score or verdict", async () => {
  const recorded: any[] = [];
  let groqInput: Record<string, unknown> = {};
  const db = {
    from() {
      const chain: any = {
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        maybeSingle: async () => ({ data: null }),
        upsert: async (value: unknown) => {
          recorded.push(value);
          return { error: null };
        },
      };
      return chain;
    },
  };
  const brief = buildCanonicalResearchBrief({
    idea_name: "Approval",
    idea_description: "Approval reminders for agencies",
    target_customer: "Agencies",
    market_type: "B2B SaaS",
  });
  const failingFetcher = ((
    _input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = JSON.parse(String(init?.body || "{}"));
    groqInput = JSON.parse(request.messages?.[1]?.content || "{}");
    return Promise.reject(new Error("Groq unavailable"));
  }) as typeof fetch;
  const result = await runOptionalGroqAdversarialReview({
    runId: "00000000-0000-4000-8000-000000000099",
    db,
    brief,
    claims: [{
      fingerprint: "f1",
      title: "Evidence",
      snippet: "Buyer paid.",
      codeRole: "supporting",
    }],
    risks: [],
  }, "test-key", failingFetcher);
  assert(!result.available && result.failure?.includes("unavailable"), "Groq failure blocked or disappeared");
  assert(!("score" in groqInput) && !("verdict" in groqInput), "official score or verdict was sent to Groq");
  assert(recorded.some((item) => JSON.stringify(item).includes("non_blocking_optional_failure")), "nonblocking failure not persisted");
});

Deno.test("deterministic decision fingerprint is reproducible across key order", () => {
  const left = deterministicDecisionFingerprint({ b: [2, 1], a: { y: 2, x: 1 } });
  const right = deterministicDecisionFingerprint({ a: { x: 1, y: 2 }, b: [2, 1] });
  assert(left === right, "deterministic output changed with object key order");
});
