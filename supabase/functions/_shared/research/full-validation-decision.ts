import {
  isDirectWillingnessToPayEvidence,
  type Criterion,
  type FactorResult,
  type ScoringEvidence,
} from "./scoring-engine.ts";

export type FullValidationVerdict =
  | "Build"
  | "Validate First"
  | "Niche Down"
  | "Reposition"
  | "Do Not Build Yet";

export type AlternativeClass =
  | "direct_competitor"
  | "adjacent_competitor"
  | "manual_workaround"
  | "internal_process"
  | "do_nothing";

export interface FullValidationEvidence extends ScoringEvidence {
  segment?: string | null;
}

export interface FullValidationFactorAnalysis {
  criterion: Criterion;
  rawScore: number;
  effectiveScore: number;
  evidenceCoefficient: number;
  evidenceState: FactorResult["evidenceState"];
  supportingEvidenceIds: string[];
  challengingEvidenceIds: string[];
  buyerSegmentApplicability: string[];
  unresolvedAssumptions: string[];
  scoreSensitivity: {
    lower: number;
    current: number;
    upper: number;
    explanation: string;
  };
}

export interface SegmentCandidate {
  name: string;
  evidenceIds: string[];
}

export interface SegmentRanking {
  segment: string;
  score: number;
  evidenceStrength: number;
  independentEvidenceGroups: number;
  metrics: {
    painSeverity: number;
    painFrequency: number;
    currentSpending: number;
    reachability: number;
    switchingFriction: number;
    urgency: number;
    procurementComplexity: number;
  };
  evidenceIds: string[];
  rankReason: string;
}

export interface VerifiedAlternativeInput {
  id: string;
  name: string;
  target?: string | null;
  positioning?: string | null;
  pricing?: string | null;
  strength?: string | null;
  gap?: string | null;
  classification?: string | null;
  verificationStatus?: string | null;
  evidenceIds?: string[];
}

export interface AlternativeMapItem {
  id: string;
  name: string;
  classification: AlternativeClass;
  verified: boolean;
  targetSegment: string | null;
  positioning: string | null;
  verifiedPricing: string | null;
  strengths: string[];
  recurringComplaints: string[];
  switchingImplications: string[];
  differentiationGap: string | null;
  evidenceIds: string[];
}

export interface VerifiedPrice {
  price: number;
  currency: string;
  billingPeriod: "month" | "year" | "one_time" | "usage" | "unknown";
  sourceId?: string | null;
  sourceUrl?: string | null;
}

export interface EconomicsConstraints {
  revenueTarget?: number | null;
  currency?: string | null;
  acquisitionCostRange?: [number, number] | null;
  variableCostRange?: [number, number] | null;
  fixedCostRange?: [number, number] | null;
  maximumValidationBudget?: number | null;
  assumedPriceRange?: [number, number] | null;
}

export interface EconomicsScenario {
  name: "conservative" | "base" | "upside";
  price: number | null;
  currency: string | null;
  customersRequired: number | null;
  acquisitionCost: number | null;
  grossMarginRange: [number, number] | null;
  breakEvenCustomers: number | null;
  supportBurden: "high" | "medium" | "low" | "unresolved";
  assumptions: string[];
  evidenceSourceIds: string[];
}

export interface AdversarialGateInput {
  deterministicVerdict: string;
  factors: FactorResult[];
  segmentRankings: SegmentRanking[];
  recommendedSegment: string | null;
  alternatives: AlternativeMapItem[];
  evidence: FullValidationEvidence[];
  risks: Array<{ category: string; severity: string; description?: string }>;
  strongObjection?: boolean;
}

export interface AdversarialGateResult {
  verdict: FullValidationVerdict;
  lowered: boolean;
  blocked: boolean;
  checks: Record<string, "passed" | "failed" | "unresolved">;
  reasons: string[];
}

export function buildFullValidationFactorAnalysis(
  factors: FactorResult[],
  evidence: FullValidationEvidence[],
  defaultSegment: string,
): FullValidationFactorAnalysis[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  return factors.map((factor) => {
    const linked = factor.evidenceIds.flatMap((id) =>
      evidenceById.has(id) ? [evidenceById.get(id)!] : []
    );
    const segments = unique(linked.map((item) =>
      String(item.segment || "").trim()
    ).filter(Boolean));
    const sensitivityRadius = Math.round((1 - factor.evidenceCoefficient) * 25);
    return {
      criterion: factor.criterion,
      rawScore: factor.rawScore,
      effectiveScore: factor.effectiveScore,
      evidenceCoefficient: factor.evidenceCoefficient,
      evidenceState: factor.evidenceState,
      supportingEvidenceIds: factor.supportingEvidenceIds,
      challengingEvidenceIds: factor.challengingEvidenceIds,
      buyerSegmentApplicability: segments.length
        ? segments
        : [defaultSegment],
      unresolvedAssumptions: unique([
        ...factor.unresolvedGaps,
        ...(factor.evidenceState === "ASSUMED"
          ? ["The factor is neutral-weighted until direct evidence is accepted."]
          : []),
      ]),
      scoreSensitivity: {
        lower: clamp(factor.effectiveScore - sensitivityRadius),
        current: factor.effectiveScore,
        upper: clamp(factor.effectiveScore + sensitivityRadius),
        explanation:
          "Range reflects the factor's evidence coefficient; missing evidence widens uncertainty around neutral rather than creating a penalty.",
      },
    };
  });
}

export function rankBuyerSegments(
  candidates: SegmentCandidate[],
  evidence: FullValidationEvidence[],
): { rankings: SegmentRanking[]; recommendedSegment: string | null } {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const rankings = candidates
    .filter((candidate) => candidate.name.trim())
    .map((candidate) => {
      const explicitlyLinked = candidate.evidenceIds.flatMap((id) =>
        evidenceById.has(id) ? [evidenceById.get(id)!] : []
      );
      const segmentMatched = evidence.filter((item) =>
        normalize(item.segment || "") === normalize(candidate.name)
      );
      const items = dedupeById([...explicitlyLinked, ...segmentMatched]);
      const metric = (predicate: (item: FullValidationEvidence) => boolean) =>
        evidenceMetric(items.filter(predicate));
      const painSeverity = metric((item) => item.signal_type === "Pain");
      const painFrequency = metric((item) =>
        /daily|weekly|monthly|recurr|every time|frequent/i.test(text(item))
      );
      const currentSpending = metric((item) =>
        item.signal_type === "Pricing" &&
        isDirectWillingnessToPayEvidence(item)
      );
      const reachability = metric((item) =>
        item.evidence_topic === "gtm" ||
        /community|directory|association|conference|outreach|channel/i.test(
          text(item),
        )
      );
      const switchingFrictionEvidence = items.filter((item) =>
        /switch|migration|integrat|training|lock.in|workflow change/i.test(
          text(item),
        )
      );
      const switchingFriction = switchingFrictionEvidence.length
        ? 100 - evidenceMetric(switchingFrictionEvidence)
        : 50;
      const urgency = metric((item) =>
        /urgent|immediate|deadline|cost|lost|delay|risk|must/i.test(text(item))
      );
      const procurementEvidence = items.filter((item) =>
        /procure|approval|security review|legal review|contract|budget cycle/i
          .test(text(item))
      );
      const procurementComplexity = procurementEvidence.length
        ? 100 - evidenceMetric(procurementEvidence)
        : 50;
      const evidenceStrength = round(items.length
        ? items.reduce((sum, item) =>
          sum + normalized(item.source_authority, 0.45) * 0.35 +
          normalized(item.evidence_directness, 0.45) * 0.3 +
          normalized(item.semantic_relevance ?? item.relevance_score, 0.5) *
            0.35, 0) / items.length
        : 0);
      const independentEvidenceGroups =
        new Set(items.map(independenceKey)).size;
      const score = round(
        painSeverity * 0.2 + painFrequency * 0.15 +
          currentSpending * 0.15 + reachability * 0.15 +
          switchingFriction * 0.1 + urgency * 0.15 +
          procurementComplexity * 0.1,
        1,
      );
      return {
        segment: candidate.name.trim(),
        score,
        evidenceStrength,
        independentEvidenceGroups,
        metrics: {
          painSeverity,
          painFrequency,
          currentSpending,
          reachability,
          switchingFriction,
          urgency,
          procurementComplexity,
        },
        evidenceIds: items.map((item) => item.id),
        rankReason: "",
      };
    })
    .sort((left, right) =>
      right.score - left.score ||
      right.evidenceStrength - left.evidenceStrength ||
      left.segment.localeCompare(right.segment)
    );
  const top = rankings[0];
  const runnerUp = rankings[1];
  const supported = Boolean(
    top && top.evidenceStrength >= 0.45 &&
      top.independentEvidenceGroups >= 2 &&
      (!runnerUp || top.score - runnerUp.score >= 5),
  );
  for (const [index, ranking] of rankings.entries()) {
    ranking.rankReason = index === 0
      ? supported
        ? "Ranks first with sufficient independent evidence and a material lead."
        : "Ranks first provisionally, but evidence strength or separation is insufficient for a recommendation."
      : `Ranks lower because its deterministic score is ${
        round((top?.score || 0) - ranking.score, 1)
      } points below the leading segment, with evidence strength ${
        round(ranking.evidenceStrength, 2)
      }.`;
  }
  return { rankings, recommendedSegment: supported ? top.segment : null };
}

export function buildAlternativeMap(
  alternatives: VerifiedAlternativeInput[],
  evidence: FullValidationEvidence[],
): AlternativeMapItem[] {
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  return alternatives.map((alternative) => {
    const linked = (alternative.evidenceIds || []).flatMap((id) =>
      evidenceById.has(id) ? [evidenceById.get(id)!] : []
    );
    const verified = [
      "live_verified_competitor",
      "adjacent_alternative",
    ].includes(alternative.verificationStatus || "") && linked.length > 0;
    const complaints = linked.filter((item) =>
      /complain|frustrat|difficult|expensive|slow|missing|poor|fail|limit/i.test(
        text(item),
      )
    ).map((item) => item.snippet).filter(Boolean);
    const switching = linked.filter((item) =>
      /switch|migration|integrat|training|lock.in|export|workflow/i.test(
        text(item),
      )
    ).map((item) => item.snippet).filter(Boolean);
    const gap = verified && alternative.gap &&
        claimTextSupported(alternative.gap, linked)
      ? alternative.gap.trim()
      : null;
    return {
      id: alternative.id,
      name: alternative.name,
      classification: classifyAlternative(alternative),
      verified,
      targetSegment: verified ? clean(alternative.target) : null,
      positioning: verified ? clean(alternative.positioning) : null,
      verifiedPricing: verified &&
          alternative.pricing &&
          !/unknown|not public|not verified|unavailable/i.test(
            alternative.pricing,
          )
        ? alternative.pricing.trim()
        : null,
      strengths: verified && alternative.strength
        ? [alternative.strength.trim()]
        : [],
      recurringComplaints: unique(complaints),
      switchingImplications: unique(switching),
      differentiationGap: gap,
      evidenceIds: linked.map((item) => item.id),
    };
  });
}

export function buildEconomicsScenarios(input: {
  verifiedPrices: VerifiedPrice[];
  constraints: EconomicsConstraints;
  evidence: FullValidationEvidence[];
  operationalRiskCount: number;
}): EconomicsScenario[] {
  const observed = input.verifiedPrices
    .filter((item) => Number.isFinite(item.price) && item.price > 0)
    .sort((left, right) => left.price - right.price);
  const constraintRange = input.constraints.assumedPriceRange;
  const prices = observed.length
    ? [
      observed[0].price,
      observed[Math.floor((observed.length - 1) / 2)].price,
      observed[observed.length - 1].price,
    ]
    : constraintRange
    ? [constraintRange[0], (constraintRange[0] + constraintRange[1]) / 2, constraintRange[1]]
    : [null, null, null];
  const acquisition = scenarioValues(input.constraints.acquisitionCostRange);
  const variable = scenarioValues(input.constraints.variableCostRange);
  const fixed = scenarioValues(input.constraints.fixedCostRange);
  const names = ["conservative", "base", "upside"] as const;
  return names.map((name, index) => {
    const price = prices[index];
    const acquisitionCost = acquisition[index];
    const variableCost = variable[index];
    const fixedCost = fixed[index];
    const annualPrice = price === null
      ? null
      : price * billingMultiplier(observed[index]?.billingPeriod || "unknown");
    const customersRequired =
      annualPrice && input.constraints.revenueTarget
        ? Math.ceil(input.constraints.revenueTarget / annualPrice)
        : null;
    const grossMarginRange: [number, number] | null =
      price !== null && variableCost !== null && price > 0
        ? [
          round(Math.max(0, (price - variableCost * 1.2) / price) * 100, 1),
          round(
            Math.max(
              0,
              Math.min(1, (price - variableCost * 0.8) / price),
            ) * 100,
            1,
          ),
        ]
        : null;
    const contribution = price !== null && variableCost !== null
      ? price - variableCost
      : null;
    const breakEvenCustomers = contribution && contribution > 0 &&
        fixedCost !== null
      ? Math.ceil(fixedCost / contribution)
      : null;
    return {
      name,
      price,
      currency: observed[Math.min(index, Math.max(0, observed.length - 1))]
          ?.currency ||
        input.constraints.currency || null,
      customersRequired,
      acquisitionCost,
      grossMarginRange,
      breakEvenCustomers,
      supportBurden: input.operationalRiskCount >= 3
        ? "high"
        : input.operationalRiskCount >= 1
        ? "medium"
        : input.evidence.some((item) =>
            /support|onboarding|implementation|manual operation/i.test(
              text(item),
            )
          )
        ? "low"
        : "unresolved",
      assumptions: unique([
        ...(!observed.length && constraintRange
          ? ["Price is user-provided or explicitly assumed, not market-verified."]
          : []),
        ...(price === null ? ["No verified or user-constrained price range."] : []),
        ...(acquisitionCost === null
          ? ["Acquisition cost was not supplied and is not projected."]
          : ["Acquisition cost is a user-provided assumption."]),
        ...(variableCost === null
          ? ["Variable cost and gross margin remain unresolved."]
          : ["Variable cost is a user-provided assumption."]),
        ...(fixedCost === null
          ? ["Fixed cost and break-even remain unresolved."]
          : ["Fixed cost is a user-provided assumption."]),
      ]),
      evidenceSourceIds: unique(observed.map((item) =>
        item.sourceId || ""
      ).filter(Boolean)),
    };
  });
}

export function applyFullValidationAdversarialGate(
  input: AdversarialGateInput,
): AdversarialGateResult {
  const factor = new Map(input.factors.map((item) => [item.criterion, item]));
  const state = (criterion: Criterion) => factor.get(criterion);
  const directWtp = input.evidence.some((item) =>
    isDirectWillingnessToPayEvidence(item)
  );
  const cheapAlternative = input.alternatives.some((item) =>
    item.verified &&
    (item.classification === "manual_workaround" ||
      item.classification === "do_nothing" ||
      /free|included|no cost/i.test(item.verifiedPricing || ""))
  );
  const directWithoutGap = input.alternatives.some((item) =>
    item.verified && item.classification === "direct_competitor" &&
    item.differentiationGap === null
  );
  const wedgeInvalidated = directWithoutGap && input.evidence.some((item) =>
    (item.evidence_role === "challenging" || item.disconfirming) &&
    ["competitors", "alternatives", "contradiction"].includes(
      item.evidence_topic || "",
    )
  );
  const excessiveDependencies = input.risks.filter((risk) =>
    ["Platform", "Regulatory", "Execution"].includes(risk.category) &&
    risk.severity === "High"
  ).length >= 2;
  const optimisticOnly = input.factors.filter((item) =>
    item.evidenceState === "ASSUMED"
  ).length >= 6;
  const checks: AdversarialGateResult["checks"] = {
    problemUrgent: checkFactor(state("purchaseUrgency"), 55),
    cheapExistingSolution: cheapAlternative ? "failed" : "passed",
    switchingRealistic: evidenceCheck(input.evidence, /switch|migration|lock.in|workflow change/i),
    buyerReachable: checkFactor(state("buyerReachability"), 55),
    willingnessToPay: directWtp ? "passed" : "unresolved",
    competitionPreservesWedge: wedgeInvalidated
      ? "failed"
      : directWithoutGap
      ? "unresolved"
      : "passed",
    dependenciesManageable: excessiveDependencies ? "failed" : "passed",
    notOptimisticOnly: optimisticOnly ? "failed" : "passed",
  };
  const failures = Object.entries(checks).filter(([, value]) =>
    value === "failed"
  ).map(([key]) => key);
  const unresolved = Object.entries(checks).filter(([, value]) =>
    value === "unresolved"
  ).map(([key]) => key);
  let verdict = mapLegacyVerdict(input.deterministicVerdict);
  let blocked = false;
  if (
    excessiveDependencies || optimisticOnly || input.strongObjection ||
    failures.length >= 3
  ) {
    verdict = "Do Not Build Yet";
    blocked = true;
  } else if (wedgeInvalidated) {
    verdict = "Reposition";
  } else if (
    input.segmentRankings.length > 1 && !input.recommendedSegment &&
    verdict === "Build"
  ) {
    verdict = "Niche Down";
  } else if (
    !directWtp || unresolved.length >= 3 ||
    verdict === "Build" &&
      input.factors.some((item) => item.evidenceState === "ASSUMED")
  ) {
    verdict = "Validate First";
  }
  return {
    verdict,
    lowered: verdict !== mapLegacyVerdict(input.deterministicVerdict),
    blocked,
    checks,
    reasons: [
      ...failures.map((key) => `Failed adversarial check: ${key}.`),
      ...unresolved.map((key) => `Unresolved adversarial check: ${key}.`),
    ],
  };
}

export function buildVerdictStructure(input: {
  verdict: FullValidationVerdict;
  exactScore: number;
  scoreRange: { minimum: number; maximum: number; display: string };
  evidenceConfidence: string;
  factors: FactorResult[];
  evidence: FullValidationEvidence[];
  recommendedSegment: string | null;
  recommendedWedge: string | null;
}): {
  verdict: FullValidationVerdict;
  score: number;
  scoreRange: string;
  evidenceConfidence: string;
  strongestSupportingEvidenceId: string | null;
  strongestChallengingEvidenceId: string | null;
  strongestAssumption: string;
  recommendedTargetSegment: string | null;
  recommendedProductWedge: string | null;
  upgradeCondition: string;
  downgradeCondition: string;
  killCondition: string;
} {
  const strongest = (role: "supporting" | "challenging") =>
    input.evidence
      .filter((item) =>
        (item.evidence_role ||
          (item.disconfirming ? "challenging" : "supporting")) === role
      )
      .sort((left, right) => evidenceQuality(right) - evidenceQuality(left))[0]
      ?.id || null;
  const weakest = [...input.factors].sort((left, right) =>
    left.evidenceCoefficient - right.evidenceCoefficient ||
    left.criterion.localeCompare(right.criterion)
  )[0];
  return {
    verdict: input.verdict,
    score: input.exactScore,
    scoreRange: input.scoreRange.display,
    evidenceConfidence: input.evidenceConfidence,
    strongestSupportingEvidenceId: strongest("supporting"),
    strongestChallengingEvidenceId: strongest("challenging"),
    strongestAssumption: weakest
      ? `${weakest.criterion} remains ${weakest.evidenceState.toLowerCase()} with coefficient ${weakest.evidenceCoefficient}.`
      : "No factor analysis was available.",
    recommendedTargetSegment: input.recommendedSegment,
    recommendedProductWedge: input.recommendedWedge,
    upgradeCondition:
      "Upgrade only after two independent direct buyer groups confirm urgent recurring pain and attributable paid commitment for the recommended wedge.",
    downgradeCondition:
      "Downgrade if qualified buyers prefer an existing alternative, cannot be reached economically, or reject the tested paid offer.",
    killCondition:
      "Kill the opportunity if a time-boxed paid test produces no attributable commitment and the same buyers report a cheap satisfactory alternative with no material switching reason.",
  };
}

export function buildThirtyDayActionPlan(input: {
  targetSegment: string | null;
  wedge: string | null;
  constraints: EconomicsConstraints;
  recruitmentChannel?: string | null;
}) {
  const target = input.targetSegment ||
    "The leading buyer segment remains unresolved";
  const wedge = input.wedge || "the narrowest evidence-backed workflow";
  const maximumBudget = input.constraints.maximumValidationBudget ?? 500;
  return {
    highestValueHypothesis:
      `${target} will make an attributable paid commitment for ${wedge}.`,
    targetBuyer: target,
    recruitmentChannel: input.recruitmentChannel ||
      "The highest-evidence direct buyer channel; channel remains an assumption until measured.",
    sampleSize: 12,
    testMethod:
      "Run 12 problem interviews, invite qualified urgent buyers into five concierge workflow trials, then present one identical paid-pilot offer.",
    durationDays: 30,
    successThreshold:
      "At least 8/12 confirm recent recurring pain, 3/5 complete the real workflow twice, and at least 2 make an attributable monetary or signed paid commitment.",
    failureThreshold:
      "Fewer than 5/12 report recent consequential pain, fewer than 2/5 repeat the workflow, or zero paid commitments.",
    maximumBudget: {
      amount: maximumBudget,
      currency: input.constraints.currency || "USD",
      assumption: input.constraints.maximumValidationBudget == null,
    },
    decisionUnlocked:
      "Build the narrow wedge, change segment/positioning, or stop before product-scale engineering.",
    days: [
      { days: "1-5", priority: 1, action: "Recruit 12 qualified buyers and verify recency, frequency, current alternative, spending, and decision authority." },
      { days: "6-12", priority: 2, action: "Run structured interviews and rank disconfirming evidence before positive anecdotes." },
      { days: "13-22", priority: 3, action: `Deliver five concierge trials of ${wedge} and measure repeat workflow completion.` },
      { days: "23-27", priority: 4, action: "Present one consistent paid-pilot offer and record payments, signed commitments, objections, and procurement steps." },
      { days: "28-30", priority: 5, action: "Apply the success, failure, upgrade, downgrade, and kill thresholds without expanding scope." },
    ],
  };
}

export function deterministicDecisionFingerprint(value: unknown) {
  return stableStringify(value);
}

function classifyAlternative(input: VerifiedAlternativeInput): AlternativeClass {
  const value = `${input.name} ${input.positioning || ""} ${input.classification || ""}`
    .toLowerCase();
  if (/do nothing|status quo|no action|ignore|defer/.test(value)) {
    return "do_nothing";
  }
  if (/internal|in.house|homegrown|custom process/.test(value)) {
    return "internal_process";
  }
  if (
    input.classification === "workflow_workaround" ||
    /spreadsheet|email|manual|paper|chat|whatsapp/.test(value)
  ) return "manual_workaround";
  if (input.classification === "direct") return "direct_competitor";
  return "adjacent_competitor";
}

function mapLegacyVerdict(value: string): FullValidationVerdict {
  if (value === "Build Now" || value === "Build") return "Build";
  if (value === "Validate First") return "Validate First";
  if (value === "Niche Down") return "Niche Down";
  if (value === "Reposition") return "Reposition";
  return "Do Not Build Yet";
}

function checkFactor(
  factor: FactorResult | undefined,
  threshold: number,
): "passed" | "failed" | "unresolved" {
  if (!factor || factor.evidenceState === "ASSUMED") return "unresolved";
  return factor.effectiveScore >= threshold ? "passed" : "failed";
}

function evidenceCheck(
  evidence: FullValidationEvidence[],
  pattern: RegExp,
): "passed" | "unresolved" {
  return evidence.some((item) => pattern.test(text(item)))
    ? "passed"
    : "unresolved";
}

function evidenceMetric(items: FullValidationEvidence[]) {
  if (!items.length) return 0;
  const quality = items.reduce((sum, item) =>
    sum + evidenceQuality(item), 0) / items.length;
  return clamp(35 + quality * 50 + Math.min(15, items.length * 3));
}

function evidenceQuality(item: FullValidationEvidence) {
  return normalized(item.source_authority, 0.45) * 0.3 +
    normalized(item.evidence_directness, 0.45) * 0.25 +
    normalized(item.semantic_relevance ?? item.relevance_score, 0.5) * 0.3 +
    normalized(item.extraction_confidence, 0.65) * 0.15;
}

function claimTextSupported(claim: string, evidence: FullValidationEvidence[]) {
  const terms = claim.toLowerCase().split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 5);
  if (!terms.length) return false;
  return evidence.some((item) => {
    const value = text(item).toLowerCase();
    return terms.filter((term) => value.includes(term)).length >=
      Math.min(2, terms.length);
  });
}

function scenarioValues(range?: [number, number] | null) {
  if (!range) return [null, null, null] as const;
  return [
    Math.max(range[0], range[1]),
    (range[0] + range[1]) / 2,
    Math.min(range[0], range[1]),
  ] as const;
}

function billingMultiplier(period: VerifiedPrice["billingPeriod"]) {
  if (period === "month") return 12;
  return 1;
}

function normalized(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(0, Math.min(1, numeric))
    : fallback;
}

function independenceKey(item: FullValidationEvidence) {
  return item.independence_key || item.syndication_group ||
    item.claim_fingerprint || item.canonical_source_id || item.source_id ||
    item.id;
}

function text(item: Pick<FullValidationEvidence, "title" | "snippet">) {
  return `${item.title || ""} ${item.snippet || ""}`;
}

function clean(value: string | null | undefined) {
  const result = String(value || "").trim();
  return result && !/not verified|unknown|unavailable/i.test(result)
    ? result
    : null;
}

function dedupeById<T extends { id: string }>(values: T[]) {
  return [...new Map(values.map((item) => [item.id, item])).values()];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, round(value, 1)));
}

function round(value: number, precision = 3) {
  return Number(value.toFixed(precision));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
        .join(",")
    }}`;
  }
  return JSON.stringify(value);
}
