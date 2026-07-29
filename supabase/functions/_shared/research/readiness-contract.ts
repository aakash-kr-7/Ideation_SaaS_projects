import {
  CRITERIA,
  type Criterion,
  type FactorResult,
  type ScoringEvidence,
  type WeightRow,
} from "./scoring-engine.ts";

export const SHOULD_BUILD_SCORE_NAME = "ShouldBuild Readiness Score";
export const SHOULD_BUILD_SCORE_CONTRACT = {
  name: SHOULD_BUILD_SCORE_NAME,
  meaning:
    "An evidence-based measure of how ready the current idea and founder constraints are for the decision being considered.",
  doesNotMean:
    "It is not a probability of success, a forecast of revenue, or a promise that the idea will work.",
  method:
    "The official score remains the deterministic weighted result of the existing 12 factors. Evidence Confidence is reported separately.",
} as const;

export const READINESS_ROLLUP_MAPPING = {
  marketEvidence: [
    "painSeverity",
    "purchaseUrgency",
    "willingnessToPay",
    "competitionGap",
    "retentionPotential",
  ],
  founderAndConstraintFit: [
    "founderFit",
    "buyerReachability",
    "distributionClarity",
  ],
  executionFeasibility: [
    "mvpSpeed",
    "platformDependencyRisk",
    "regulatoryRisk",
    "speedToFirstRevenue",
  ],
} as const satisfies Record<string, readonly Criterion[]>;

export type FounderSkillFit = "strong" | "partial" | "gap";
export type FounderDomainExperience = "deep" | "some" | "none";
export type FounderAudienceAccess =
  | "owned_target_audience"
  | "relevant_network"
  | "none";
export type FounderBuyerAccess = "direct" | "warm" | "cold" | "none";
export type ConstraintTolerance = "low" | "medium" | "high";

export interface FullValidationDecisionContract {
  decisionBeingConsidered: string;
  targetMilestone: string;
  deadline: string;
  availableTimeHoursPerWeek: number;
  availableBudgetAmount: number;
  budgetCurrency: string;
  founderSkills: string;
  skillFit: FounderSkillFit;
  domainExperience: string;
  domainExperienceLevel: FounderDomainExperience;
  existingAudience: FounderAudienceAccess;
  existingAudienceDetails?: string;
  buyerAccess: FounderBuyerAccess;
  buyerAccessDetails?: string;
  platformTolerance: ConstraintTolerance;
  regulatoryTolerance: ConstraintTolerance;
  abandonmentConditions: string;
  confirmed: true;
}

export interface ReadinessRollup {
  key: keyof typeof READINESS_ROLLUP_MAPPING;
  label: string;
  score: number;
  factors: Criterion[];
}

export interface ScoreChangeContract {
  question: string;
  answer: string;
  materialUpwardEvidence: string;
  materialDownwardEvidence: string;
  strongestKillCondition: string;
  highestLeverageUnresolvedAssumption: string;
  currentScore: number;
  targetScore: number;
}

export interface VerificationCardPayload {
  version: 2;
  ideaName: string;
  title: string;
  score: { value: number; range: string };
  verdict: string;
  evidenceConfidence: string;
  independentEvidenceGroups: number;
  currentAsOf: string;
  immutableReportLink: string;
  immutableVerificationUrl: string;
  methodologyLink: string;
  interpretation: "decision_readiness_not_success_probability";
}

const UPWARD_EVIDENCE: Record<Criterion, string> = {
  painSeverity:
    "obtain recent, attributable examples from multiple independent target buyers showing severe workflow consequences",
  purchaseUrgency:
    "obtain independent buyer evidence of a current deadline, budget event, or measurable cost of delay",
  willingnessToPay:
    "obtain at least two independent attributable paid-pilot, deposit, or purchase commitments for the same scoped offer",
  buyerReachability:
    "measure a named channel repeatedly producing qualified target-buyer conversations",
  mvpSpeed:
    "demonstrate the core workflow inside the confirmed time and budget without unresolved execution dependencies",
  competitionGap:
    "run direct workflow comparisons showing a buyer-relevant gap across independently verified alternatives",
  retentionPotential:
    "observe target users repeating the workflow across separate real work cycles without prompting",
  platformDependencyRisk:
    "document and test that the critical workflow survives a platform-policy, vendor, or API failure",
  regulatoryRisk:
    "obtain authoritative confirmation that the proposed workflow is permissible within the founder's tolerance",
  founderFit:
    "confirm the founder profile and demonstrate the required domain capability and target-buyer access",
  distributionClarity:
    "measure one channel repeatedly yielding qualified buyers at a known conversion rate",
  speedToFirstRevenue:
    "obtain an attributable paid commitment for the scoped first offer from a qualified buyer",
};

const DOWNWARD_EVIDENCE: Record<Criterion, string> = {
  painSeverity:
    "qualified target buyers independently report infrequent pain with no measurable consequence",
  purchaseUrgency:
    "buyers consistently defer action without a cost, deadline, or budget impact",
  willingnessToPay:
    "qualified buyers reject payment after reviewing or using the same scoped offer",
  buyerReachability:
    "the confirmed channels fail to produce qualified target-buyer conversations",
  mvpSpeed:
    "a required dependency pushes the core workflow beyond the confirmed deadline, time, or budget",
  competitionGap:
    "direct tests show current alternatives already solve the same workflow without meaningful switching friction",
  retentionPotential:
    "users do not repeat the workflow after an initial trial",
  platformDependencyRisk:
    "a platform policy, vendor decision, or API restriction blocks the core workflow",
  regulatoryRisk:
    "an authoritative source identifies a required approval or prohibition outside the confirmed tolerance",
  founderFit:
    "the confirmed founder profile lacks the buyer access, domain capability, time, or budget required for the first test",
  distributionClarity:
    "qualified acquisition is unavailable without an untested channel outside the confirmed budget",
  speedToFirstRevenue:
    "qualified buyers require substantial unpaid scope before considering payment",
};

const ROLLUP_LABELS: Record<keyof typeof READINESS_ROLLUP_MAPPING, string> = {
  marketEvidence: "Market Evidence",
  founderAndConstraintFit: "Founder and Constraint Fit",
  executionFeasibility: "Execution Feasibility",
};

const clamp = (value: number) =>
  Math.max(0, Math.min(100, Math.round(value * 10) / 10));

const riskAdjusted = (factor: FactorResult) =>
  factor.criterion === "platformDependencyRisk" ||
    factor.criterion === "regulatoryRisk"
    ? 100 - factor.effectiveScore
    : factor.effectiveScore;

export function buildInterpretedDecisionBrief(
  contract: FullValidationDecisionContract,
) {
  const audience = contract.existingAudience === "owned_target_audience"
    ? "an owned audience containing target buyers"
    : contract.existingAudience === "relevant_network"
    ? "a relevant network but no confirmed owned target-buyer audience"
    : "no existing relevant audience";
  const buyerAccess = contract.buyerAccess === "direct"
    ? "direct target-buyer access"
    : contract.buyerAccess === "warm"
    ? "warm introductions to target buyers"
    : contract.buyerAccess === "cold"
    ? "cold outreach only"
    : "no current target-buyer access";
  return [
    `Decision: ${contract.decisionBeingConsidered}.`,
    `Milestone: ${contract.targetMilestone} by ${contract.deadline}.`,
    `Constraints: ${contract.availableTimeHoursPerWeek} hours/week and ${contract.budgetCurrency.toUpperCase()} ${contract.availableBudgetAmount}.`,
    `Founder fit inputs: ${contract.skillFit} skill fit (${contract.founderSkills}); ${contract.domainExperienceLevel} domain experience (${contract.domainExperience}); ${audience}; ${buyerAccess}.`,
    `Tolerance: ${contract.platformTolerance} platform dependency and ${contract.regulatoryTolerance} regulatory exposure.`,
    `Abandon if: ${contract.abandonmentConditions}.`,
  ].join(" ");
}

export function buildFounderFitFactor(
  contract: FullValidationDecisionContract | null | undefined,
  risks: Array<{ category: string; severity: string }>,
): FactorResult {
  if (!contract?.confirmed) {
    return {
      criterion: "founderFit",
      score: 50,
      rawScore: 50,
      evidenceCoefficient: 0,
      effectiveScore: 50,
      evidenceState: "ASSUMED",
      evidenceIds: [],
      supportingEvidenceIds: [],
      challengingEvidenceIds: [],
      confidenceDeductions: [
        "The founder profile was not confirmed before research.",
      ],
      unresolvedGaps: [
        "Confirm founder skills, domain experience, distribution, buyer access, time, budget, and dependency tolerances.",
      ],
      note:
        "No founder-fit conclusion is made without confirmed founder inputs.",
    };
  }
  const skill = { strong: 90, partial: 60, gap: 20 }[contract.skillFit];
  const domain = { deep: 90, some: 60, none: 25 }[
    contract.domainExperienceLevel
  ];
  const audience = {
    owned_target_audience: 90,
    relevant_network: 65,
    none: 25,
  }[contract.existingAudience];
  const access = { direct: 90, warm: 70, cold: 40, none: 10 }[
    contract.buyerAccess
  ];
  let rawScore = (skill + domain + audience + access) / 4;
  if (contract.availableTimeHoursPerWeek < 5) rawScore -= 15;
  else if (contract.availableTimeHoursPerWeek < 10) rawScore -= 7;
  if (contract.availableBudgetAmount <= 0) rawScore -= 10;
  const highPlatformRisk = risks.some((risk) =>
    risk.category === "Platform" && risk.severity === "High"
  );
  const highRegulatoryRisk = risks.some((risk) =>
    risk.category === "Regulatory" && risk.severity === "High"
  );
  if (highPlatformRisk && contract.platformTolerance === "low") rawScore -= 15;
  if (highRegulatoryRisk && contract.regulatoryTolerance === "low") {
    rawScore -= 15;
  }
  rawScore = clamp(rawScore);
  const coefficient = 0.85;
  const effectiveScore = clamp(50 + (rawScore - 50) * coefficient);
  return {
    criterion: "founderFit",
    score: effectiveScore,
    rawScore,
    evidenceCoefficient: coefficient,
    effectiveScore,
    evidenceState: "EVIDENCED",
    evidenceIds: [],
    supportingEvidenceIds: [],
    challengingEvidenceIds: [],
    confidenceDeductions: [
      "Founder fit is based on confirmed self-reported constraints, not independently verified biography.",
    ],
    unresolvedGaps: [],
    note:
      "Confirmed founder skills, domain experience, audience, buyer access, time, budget, and risk tolerances.",
  };
}

export function deriveReadinessRollups(
  factors: FactorResult[],
  weightRows: WeightRow[],
): ReadinessRollup[] {
  const factorByCriterion = new Map(
    factors.map((factor) => [factor.criterion, factor]),
  );
  const weightByCriterion = new Map(
    weightRows.map((row) => [row.criterion, Math.max(0, Number(row.weight))]),
  );
  return Object.entries(READINESS_ROLLUP_MAPPING).map(([key, criteria]) => {
    const weighted = criteria.reduce((sum, criterion) => {
      const factor = factorByCriterion.get(criterion);
      return sum +
        (factor ? riskAdjusted(factor) : 50) *
          (weightByCriterion.get(criterion) ?? 0);
    }, 0);
    const totalWeight = criteria.reduce(
      (sum, criterion) => sum + (weightByCriterion.get(criterion) ?? 0),
      0,
    );
    return {
      key: key as keyof typeof READINESS_ROLLUP_MAPPING,
      label: ROLLUP_LABELS[key as keyof typeof READINESS_ROLLUP_MAPPING],
      score: clamp(totalWeight ? weighted / totalWeight : 50),
      factors: [...criteria],
    };
  });
}

export function countIndependentEvidenceGroups(evidence: ScoringEvidence[]) {
  return new Set(
    evidence
      .filter((item) =>
        !item.excluded && (item.source_tier ?? 3) < 4 &&
        item.numeric_validation_state !== "rejected"
      )
      .map((item) =>
        item.independence_key || item.syndication_group ||
        item.claim_fingerprint || item.canonical_source_id || item.source_id ||
        item.canonical_domain || `evidence:${item.id}`
      ),
  ).size;
}

export function buildScoreChangeContract(input: {
  score: number;
  factors: FactorResult[];
  weights: WeightRow[];
  founderContract?: FullValidationDecisionContract | null;
}): ScoreChangeContract {
  const weightByCriterion = new Map(
    input.weights.map((row) => [row.criterion, Math.max(0, Number(row.weight))]),
  );
  const totalWeight = CRITERIA.reduce(
    (sum, criterion) => sum + (weightByCriterion.get(criterion) ?? 0),
    0,
  ) || 1;
  const unresolved = [...input.factors].sort((left, right) => {
    const leftLeverage = (1 - left.evidenceCoefficient) *
      (weightByCriterion.get(left.criterion) ?? 0);
    const rightLeverage = (1 - right.evidenceCoefficient) *
      (weightByCriterion.get(right.criterion) ?? 0);
    return rightLeverage - leftLeverage ||
      left.criterion.localeCompare(right.criterion);
  })[0];
  const upward = [...input.factors].sort((left, right) => {
    const leftRoom = (100 - riskAdjusted(left)) *
      (weightByCriterion.get(left.criterion) ?? 0) / totalWeight;
    const rightRoom = (100 - riskAdjusted(right)) *
      (weightByCriterion.get(right.criterion) ?? 0) / totalWeight;
    return rightRoom - leftRoom || left.criterion.localeCompare(right.criterion);
  })[0];
  const downward = [...input.factors].sort((left, right) => {
    const leftRoom = riskAdjusted(left) *
      (weightByCriterion.get(left.criterion) ?? 0) / totalWeight;
    const rightRoom = riskAdjusted(right) *
      (weightByCriterion.get(right.criterion) ?? 0) / totalWeight;
    return rightRoom - leftRoom || left.criterion.localeCompare(right.criterion);
  })[0];
  const nextBoundary = [40, 55, 70, 85, 100].find((value) =>
    value > input.score
  ) ?? 100;
  const targetScore = clamp(nextBoundary);
  const upwardCriterion = upward?.criterion ?? "painSeverity";
  const downwardCriterion = downward?.criterion ?? "painSeverity";
  const unresolvedCriterion = unresolved?.criterion ?? "painSeverity";
  const upwardEvidence = UPWARD_EVIDENCE[upwardCriterion];
  const answer =
    `Obtain this score-changing evidence: ${upwardEvidence}. The official score changes only when accepted evidence changes one or more of the 12 factor inputs; editing the narrative does not change it.`;
  return {
    question:
      `What gets this score from ${clamp(input.score)} to ${targetScore}?`,
    answer,
    materialUpwardEvidence: upwardEvidence,
    materialDownwardEvidence: DOWNWARD_EVIDENCE[downwardCriterion],
    strongestKillCondition:
      input.founderContract?.abandonmentConditions?.trim() ||
      "Kill the idea if a time-boxed test produces zero attributable paid commitments and qualified buyers report a satisfactory existing alternative with no material switching reason.",
    highestLeverageUnresolvedAssumption:
      `${unresolvedCriterion}: ${UPWARD_EVIDENCE[unresolvedCriterion]}.`,
    currentScore: clamp(input.score),
    targetScore,
  };
}

export function buildVerificationCardPayload(input: {
  ideaName: string;
  score: number;
  scoreRange: string;
  verdict: string;
  evidenceConfidence: string;
  independentEvidenceGroups: number;
  currentAsOf: string;
  immutableReportLink: string;
  immutableVerificationUrl?: string;
  methodologyLink?: string;
}): VerificationCardPayload {
  const score = clamp(input.score);
  return {
    version: 2,
    ideaName: input.ideaName,
    title: `ShouldBuild ${score}`,
    score: { value: score, range: input.scoreRange },
    verdict: input.verdict,
    evidenceConfidence: input.evidenceConfidence,
    independentEvidenceGroups: Math.max(
      0,
      Math.floor(input.independentEvidenceGroups),
    ),
    currentAsOf: input.currentAsOf.slice(0, 10),
    immutableReportLink: input.immutableReportLink,
    immutableVerificationUrl: input.immutableVerificationUrl ||
      input.immutableReportLink,
    methodologyLink: input.methodologyLink ||
      "/methodology/shouldbuild-readiness-score",
    interpretation: "decision_readiness_not_success_probability",
  };
}
