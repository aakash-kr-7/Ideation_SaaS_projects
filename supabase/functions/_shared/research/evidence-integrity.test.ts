import {
  applyFactorEvidenceConfidence,
  CRITERIA,
  deriveFactorEvidence,
  deriveScoreConfidenceBand,
  FACTOR_EVIDENCE_POLICY,
  type FactorResult,
  type ScoringEvidence,
} from "./scoring-engine.ts";
import {
  applyReportSemanticDeduplication,
  buildEvidenceSufficiencySummary,
  buildVerdictChangeConditions,
  competitorIntegrityPresentation,
  findPlaceholderLeakage,
  isSemanticDuplicate,
} from "./evidence-integrity.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const evidence = (
  id: string,
  overrides: Partial<ScoringEvidence> = {},
): ScoringEvidence => ({
  id,
  signal_type: "Pain",
  strength: "High",
  title: `Buyer evidence ${id}`,
  snippet: "A qualified buyer reports weekly workflow pain with measurable delay.",
  source_tier: 1,
  source_authority: 0.9,
  evidence_directness: 0.85,
  semantic_relevance: 0.9,
  extraction_confidence: 0.9,
  numeric_validation_state: "not_applicable",
  evidence_role: "supporting",
  independence_key: id,
  ...overrides,
});

Deno.test("factor evidence states use independent claim groups, not URL volume", () => {
  const duplicated = [
    evidence("url-a", { independence_key: "same-claim", claim_fingerprint: "same-claim" }),
    evidence("url-b", { independence_key: "same-claim", claim_fingerprint: "same-claim" }),
  ];
  const duplicateState = deriveFactorEvidence(duplicated);
  assert(duplicateState.state === "SUGGESTIVE", "syndicated copies became evidenced");
  const independentState = deriveFactorEvidence([
    evidence("primary"),
    evidence("corroboration", { source_tier: 2, source_authority: 0.75 }),
  ]);
  assert(independentState.state === "EVIDENCED", "independent corroboration was not evidenced");
  assert(
    independentState.coefficient >= FACTOR_EVIDENCE_POLICY.evidenced.minimumCoefficient,
    "evidenced coefficient missed configured floor",
  );
});

Deno.test("missing evidence pulls positive and risk factors to neutral", () => {
  const positive = applyFactorEvidenceConfidence(
    { criterion: "painSeverity", score: 90, note: "test" },
    [],
  );
  const risk = applyFactorEvidenceConfidence(
    { criterion: "platformDependencyRisk", score: 90, note: "test" },
    [],
  );
  assert(positive.effectiveScore === 50, "unsupported positive factor did not become neutral");
  assert(risk.effectiveScore === 50, "unsupported risk factor did not become neutral");
  assert(positive.evidenceState === "ASSUMED" && risk.evidenceState === "ASSUMED", "unsupported factors were not assumed");
});

Deno.test("risk-oriented factors apply confidence before deterministic inversion", () => {
  const signals = [
    evidence("risk-primary", { signal_type: "Risk", evidence_role: "supporting" }),
    evidence("risk-corroboration", { signal_type: "Risk", evidence_role: "supporting", source_tier: 2 }),
  ];
  const risk = applyFactorEvidenceConfidence(
    { criterion: "platformDependencyRisk", score: 90, note: "risk" },
    signals,
  );
  const expected = Math.round((50 + (90 - 50) * risk.evidenceCoefficient) * 10) / 10;
  assert(risk.effectiveScore === expected, "risk confidence was applied after inversion");
  assert(100 - risk.effectiveScore < 50, "supported high risk did not reduce its weighted contribution");
});

Deno.test("uncertainty bands derive from factor coefficients rather than fixed padding", () => {
  const weights = CRITERIA.map((criterion) => ({ criterion, weight: 1 }));
  const factors = CRITERIA.map((criterion): FactorResult => ({
    criterion,
    score: 55,
    rawScore: 90,
    effectiveScore: 55,
    evidenceCoefficient: 0.125,
    evidenceState: "ASSUMED",
    evidenceIds: [],
    supportingEvidenceIds: [],
    challengingEvidenceIds: [],
    confidenceDeductions: ["Missing evidence"],
    unresolvedGaps: ["Direct evidence is missing"],
    note: "test",
  }));
  const band = deriveScoreConfidenceBand(factors, weights, 55);
  assert(band.label === "Low Evidence Confidence", "low-confidence band mislabeled");
  assert(band.maximum - band.minimum > 10, "band collapsed to decorative fixed ±5");
  const strong = deriveScoreConfidenceBand(
    factors.map((factor) => ({
      ...factor,
      score: 80,
      rawScore: 80,
      effectiveScore: 80,
      evidenceCoefficient: 0.9,
      evidenceState: "EVIDENCED",
    })),
    weights,
    80,
  );
  assert(strong.display === "80/100", "strong evidence did not show the normal exact score");
});

Deno.test("Evidence Sufficiency exposes coverage, concentration, and assumed factors", () => {
  const factors = CRITERIA.map((criterion, index): FactorResult => ({
    criterion,
    score: 50,
    rawScore: 50,
    effectiveScore: 50,
    evidenceCoefficient: index === 0 ? 0.75 : 0,
    evidenceState: index === 0 ? "EVIDENCED" : "ASSUMED",
    evidenceIds: index === 0 ? ["a"] : [],
    supportingEvidenceIds: index === 0 ? ["a"] : [],
    challengingEvidenceIds: [],
    confidenceDeductions: [],
    unresolvedGaps: index === 0 ? [] : ["Missing"],
    note: "test",
  }));
  const summary = buildEvidenceSufficiencySummary(
    [evidence("a", { canonical_domain: "buyer.example", source_family: "customer_pain" })],
    factors,
    { minimum: 10, maximum: 90, label: "Low Evidence Confidence", display: "10–90 · Low Evidence Confidence" },
  );
  assert(summary.acceptedEvidenceCount === 1, "accepted evidence count mismatch");
  assert(summary.independentEvidenceGroups === 1, "independence count mismatch");
  assert(summary.assumedFactors.length === 11, "assumed factors mismatch");
  assert(summary.mostImportantLimitation.includes("11 of 12"), "main limitation is not explicit");
});

Deno.test("semantic duplicates retain the strongest report placement", () => {
  assert(
    isSemanticDuplicate(
      "Buyers report a weekly manual workflow with costly delay.",
      "A costly delay comes from the manual workflow buyers report every week.",
    ),
    "normalized semantic duplicate was missed",
  );
  const payload: any = {
    executiveSummary: "Buyers report weekly manual workflow pain with measurable delay.",
    topRecommendation: "Test willingness to pay.",
    decisionProduct: {
      sections: [{
        title: "Problem",
        summary: "Weekly manual workflow pain with measurable delay is reported by buyers.",
        statements: [],
      }],
      specialistOutputs: [],
    },
  };
  applyReportSemanticDeduplication(payload);
  assert(payload.executiveSummary.startsWith("Buyers"), "strongest placement was removed");
  assert(payload.decisionProduct.sections[0].summary.startsWith("Unavailable"), "duplicate field was repeated");
});

Deno.test("recognizable placeholders are blocked unless accepted evidence contains them", () => {
  const payload = { pricing: "$49/month", customer: "Acme Inc." };
  assert(findPlaceholderLeakage(payload, []).length === 2, "placeholder leakage passed");
  assert(
    findPlaceholderLeakage(payload, ["Acme Inc. offers $49/month"]).length === 0,
    "evidence-grounded values were incorrectly blocked",
  );
});

Deno.test("verdict-change conditions are factor-specific and falsifiable", () => {
  const factors = CRITERIA.map((criterion): FactorResult => ({
    criterion,
    score: 50,
    rawScore: 50,
    effectiveScore: 50,
    evidenceCoefficient: criterion === "willingnessToPay" ? 0 : 0.8,
    evidenceState: criterion === "willingnessToPay" ? "ASSUMED" : "EVIDENCED",
    evidenceIds: [],
    supportingEvidenceIds: [],
    challengingEvidenceIds: [],
    confidenceDeductions: [],
    unresolvedGaps: [],
    note: "test",
  }));
  const conditions = buildVerdictChangeConditions(
    69,
    factors,
    CRITERIA.map((criterion) => ({ criterion, weight: criterion === "willingnessToPay" ? 20 : 1 })),
  );
  assert(conditions.nearestBoundary === 70, "nearest verdict boundary mismatch");
  assert(conditions.highestLeverageUncertainFactor === "willingnessToPay", "highest leverage factor mismatch");
  assert(conditions.upgradeCondition.includes("paid-pilot"), "upgrade condition is generic");
  assert(conditions.downgradeCondition.includes("reject payment"), "downgrade condition is generic");
});

Deno.test("seeded competitors cannot expose unverified current fields", () => {
  const seed = competitorIntegrityPresentation({
    verificationStatus: "unverified_seed",
    pricing: "$49/month",
    positioning: "Market leader",
    gap: "Fastest product",
  });
  assert(!seed.liveVerified, "seed was marked verified");
  assert(seed.pricing === "Not live verified", "seeded pricing leaked");
  assert(seed.positioning === "Not live verified", "seeded positioning leaked");
  const verified = competitorIntegrityPresentation({
    verificationStatus: "live_verified_competitor",
    evidenceIds: ["accepted"],
    pricing: "Verified source price",
  });
  assert(verified.liveVerified && verified.pricing === "Verified source price", "verified competitor was hidden");
});
