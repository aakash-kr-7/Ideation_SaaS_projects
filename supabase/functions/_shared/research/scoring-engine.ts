// Deliberately runtime-neutral: this module imports no provider or networking code.
export const CRITERIA = [
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
] as const;
export type Criterion = typeof CRITERIA[number];
export type Strength = "High" | "Medium" | "Low";
export type FactorEvidenceState = "EVIDENCED" | "SUGGESTIVE" | "ASSUMED";
export type NumericValidationState =
  | "verified"
  | "flagged"
  | "rejected"
  | "not_applicable"
  | "not_checked";

export const FACTOR_EVIDENCE_POLICY = {
  neutralBaseline: 50,
  evidenced: {
    minimumIndependentSupportingGroups: 2,
    minimumAuthority: 0.65,
    minimumDirectness: 0.6,
    minimumSemanticRelevance: 0.65,
    minimumCoefficient: 0.7,
  },
  suggestive: {
    minimumRelevantGroups: 1,
    minimumSemanticRelevance: 0.55,
    minimumCoefficient: 0.3,
    maximumCoefficient: 0.69,
  },
  assumed: { maximumCoefficient: 0.25 },
} as const;

export interface ScoringEvidence {
  id: string;
  signal_type: "Pain" | "Demand" | "Pricing" | "Risk";
  strength: Strength;
  title: string;
  snippet: string;
  source_id?: string | null;
  supporting_count?: number;
  contradicting_count?: number;
  confidence?: number;
  source_tier?: 1 | 2 | 3 | 4;
  excluded?: boolean;
  evidence_family?: "problem" | "solution";
  research_pass?: 1 | 2 | 3;
  independent_source_count?: number;
  independent_domain_count?: number;
  disconfirming?: boolean;
  evidence_topic?: string | null;
  relevance_score?: number | null;
  claim_id?: string | null;
  canonical_source_id?: string | null;
  canonical_domain?: string | null;
  source_family?: string | null;
  source_authority?: number | null;
  evidence_directness?: number | null;
  semantic_relevance?: number | null;
  independence_key?: string | null;
  syndication_group?: string | null;
  claim_fingerprint?: string | null;
  evidence_role?: "supporting" | "challenging" | null;
  associated_factor_ids?: string[];
  extraction_confidence?: number | null;
  numeric_validation_state?: NumericValidationState | null;
  model_classification_metadata?: Record<string, unknown> | null;
}
export interface ScoringRisk {
  id: string;
  category: "Market" | "Execution" | "Platform" | "Regulatory";
  severity: Strength;
}
export interface ScoringCompetitor {
  id: string;
  gap: string;
  strength: string;
  pricing: string;
  classification?: "direct" | "adjacent" | "substitute" | "workflow_workaround";
}
export interface ScoringContext {
  evidence: ScoringEvidence[];
  risks: ScoringRisk[];
  competitors: ScoringCompetitor[];
  hasPricingModel: boolean;
  launchStrategyCount: number;
  unresolvedContradictionCount?: number;
}
export interface WeightRow {
  criterion: string;
  weight: number;
}
export interface FactorResult {
  criterion: Criterion;
  /** Backward-compatible alias of effectiveScore. */
  score: number;
  rawScore: number;
  evidenceCoefficient: number;
  effectiveScore: number;
  evidenceState: FactorEvidenceState;
  evidenceIds: string[];
  supportingEvidenceIds: string[];
  challengingEvidenceIds: string[];
  confidenceDeductions: string[];
  unresolvedGaps: string[];
  note: string;
}

const STRENGTH = { High: 1, Medium: 0.65, Low: 0.35 } as const;
const clamp = (n: number) =>
  Math.max(0, Math.min(100, Math.round(n * 10) / 10));
const lexicon = (text: string, words: string[]) =>
  words.some((w) => text.toLowerCase().includes(w));
const refs = (items: ScoringEvidence[]) => [...new Set(items.map((e) => e.id))];
const round = (value: number, precision = 3) =>
  Number(value.toFixed(precision));
const normalizedMetric = (value: number | null | undefined, fallback: number) =>
  Math.max(0, Math.min(1, Number.isFinite(Number(value)) ? Number(value) : fallback));
const authorityFor = (item: ScoringEvidence) =>
  normalizedMetric(
    item.source_authority,
    ({ 1: 1, 2: 0.8, 3: 0.45, 4: 0 } as const)[item.source_tier ?? 3],
  );
const directnessFor = (item: ScoringEvidence) =>
  normalizedMetric(
    item.evidence_directness,
    item.source_tier === 1 ? 0.85 : item.source_tier === 2 ? 0.65 : 0.4,
  );
const relevanceFor = (item: ScoringEvidence) =>
  normalizedMetric(item.semantic_relevance ?? item.relevance_score, 0.55);
const independenceKeyFor = (item: ScoringEvidence) =>
  item.independence_key || item.syndication_group ||
  item.claim_fingerprint || item.canonical_source_id || item.source_id ||
  item.canonical_domain || `evidence:${item.id}`;
const roleFor = (item: ScoringEvidence) =>
  item.evidence_role || (item.disconfirming ? "challenging" : "supporting");

function average(items: ScoringEvidence[], getter: (item: ScoringEvidence) => number) {
  return items.length
    ? items.reduce((sum, item) => sum + getter(item), 0) / items.length
    : 0;
}

export function deriveFactorEvidence(
  items: ScoringEvidence[],
  unresolvedContradiction = false,
) {
  const accepted = items.filter((item) =>
    !item.excluded && (item.source_tier ?? 3) < 4 &&
    item.numeric_validation_state !== "rejected"
  );
  const supporting = accepted.filter((item) => roleFor(item) === "supporting");
  const challenging = accepted.filter((item) => roleFor(item) === "challenging");
  const supportingGroups = new Set(supporting.map(independenceKeyFor)).size;
  const challengingGroups = new Set(challenging.map(independenceKeyFor)).size;
  const relevantGroups = new Set(accepted.map(independenceKeyFor)).size;
  const authority = average(accepted, authorityFor);
  const directness = average(accepted, directnessFor);
  const relevance = average(accepted, relevanceFor);
  const extraction = average(
    accepted,
    (item) => normalizedMetric(item.extraction_confidence, 0.75),
  );
  const numericIntegrity = accepted.some((item) =>
      item.numeric_validation_state === "flagged"
    )
    ? 0.55
    : 1;
  const hasPrimaryDirect = supporting.some((item) =>
    authorityFor(item) >= 0.8 && directnessFor(item) >= 0.75
  );
  const integrityFailure = items.some((item) =>
    item.numeric_validation_state === "rejected"
  );
  const unresolvedChallenge = unresolvedContradiction ||
    (challengingGroups > 0 && supportingGroups > 0);
  const evidenced = !integrityFailure && !unresolvedChallenge &&
    relevance >= FACTOR_EVIDENCE_POLICY.evidenced.minimumSemanticRelevance &&
    authority >= FACTOR_EVIDENCE_POLICY.evidenced.minimumAuthority &&
    directness >= FACTOR_EVIDENCE_POLICY.evidenced.minimumDirectness &&
    (supportingGroups >=
        FACTOR_EVIDENCE_POLICY.evidenced.minimumIndependentSupportingGroups ||
      (hasPrimaryDirect && supportingGroups >= 2));
  const suggestive = !evidenced &&
    relevantGroups >= FACTOR_EVIDENCE_POLICY.suggestive.minimumRelevantGroups &&
    relevance >= FACTOR_EVIDENCE_POLICY.suggestive.minimumSemanticRelevance;
  const state: FactorEvidenceState = evidenced
    ? "EVIDENCED"
    : suggestive
    ? "SUGGESTIVE"
    : "ASSUMED";
  let coefficient = accepted.length
    ? Math.min(1, relevantGroups / 2) * 0.3 + authority * 0.2 +
      directness * 0.2 + relevance * 0.2 + extraction * numericIntegrity * 0.1
    : 0;
  if (unresolvedChallenge) coefficient -= 0.15;
  if (integrityFailure) coefficient -= 0.25;
  if (state === "EVIDENCED") {
    coefficient = Math.max(
      FACTOR_EVIDENCE_POLICY.evidenced.minimumCoefficient,
      coefficient,
    );
  } else if (state === "SUGGESTIVE") {
    coefficient = Math.max(
      FACTOR_EVIDENCE_POLICY.suggestive.minimumCoefficient,
      Math.min(FACTOR_EVIDENCE_POLICY.suggestive.maximumCoefficient, coefficient),
    );
  } else {
    coefficient = Math.min(
      FACTOR_EVIDENCE_POLICY.assumed.maximumCoefficient,
      coefficient,
    );
  }
  coefficient = round(Math.max(0, Math.min(1, coefficient)));
  const confidenceDeductions = [
    ...(supportingGroups < 2 ? ["Fewer than two independent supporting evidence groups."] : []),
    ...(directness < FACTOR_EVIDENCE_POLICY.evidenced.minimumDirectness
      ? ["Evidence is mostly indirect."]
      : []),
    ...(authority < FACTOR_EVIDENCE_POLICY.evidenced.minimumAuthority
      ? ["Source authority is below the evidenced threshold."]
      : []),
    ...(unresolvedChallenge ? ["Supporting and challenging evidence remain unresolved."] : []),
    ...(integrityFailure ? ["A numeric integrity failure was detected."] : []),
    ...(accepted.some((item) => item.numeric_validation_state === "flagged")
      ? ["A numeric claim remains flagged."]
      : []),
  ];
  const unresolvedGaps = state === "EVIDENCED"
    ? []
    : [
      ...(supportingGroups < 2
        ? ["Independent corroboration is missing."]
        : []),
      ...(hasPrimaryDirect ? [] : ["Direct primary evidence is missing."]),
      ...(unresolvedChallenge ? ["Resolve the current contradiction."] : []),
    ];
  return {
    state,
    coefficient,
    supportingEvidenceIds: refs(supporting),
    challengingEvidenceIds: refs(challenging),
    confidenceDeductions,
    unresolvedGaps,
    independentGroups: relevantGroups,
  };
}

export function applyFactorEvidenceConfidence(
  factor: Pick<FactorResult, "criterion" | "note"> & {
    score: number;
    evidenceIds?: string[];
  },
  items: ScoringEvidence[],
  unresolvedContradiction = false,
): FactorResult {
  const rawScore = clamp(factor.score);
  const evidence = deriveFactorEvidence(items, unresolvedContradiction);
  const effectiveScore = clamp(
    FACTOR_EVIDENCE_POLICY.neutralBaseline +
      (rawScore - FACTOR_EVIDENCE_POLICY.neutralBaseline) *
        evidence.coefficient,
  );
  return {
    criterion: factor.criterion,
    score: effectiveScore,
    rawScore,
    evidenceCoefficient: evidence.coefficient,
    effectiveScore,
    evidenceState: evidence.state,
    evidenceIds: refs(items),
    supportingEvidenceIds: evidence.supportingEvidenceIds,
    challengingEvidenceIds: evidence.challengingEvidenceIds,
    confidenceDeductions: evidence.confidenceDeductions,
    unresolvedGaps: evidence.unresolvedGaps,
    note: factor.note,
  };
}
export function isDirectWillingnessToPayEvidence(evidence: Pick<ScoringEvidence, "title" | "snippet" | "evidence_topic">) {
  if (evidence.evidence_topic !== "willingness_to_pay") return false;
  const text = `${evidence.title} ${evidence.snippet}`.toLowerCase();
  return [
    /\b(?:customer|buyer|team|agency|participant)s?\b.{0,100}\b(?:paid|purchased|renewed|committed|signed a paid|allocated a budget)\b/,
    /\b(?:paid|purchased|renewed|committed|signed a paid|allocated a budget)\b.{0,100}\b(?:customer|buyer|team|agency|participant)s?\b/,
    /\b(?:paid pilot|purchase commitment|signed commitment|deposit paid|pre[- ]?order|conversion rate|renewal rate|price sensitivity|transaction data)\b/,
  ].some((pattern) => pattern.test(text));
}
function evidenceScore(items: ScoringEvidence[], baseline = 20): number {
  const usable = items.filter((e) => !e.excluded && (e.source_tier ?? 3) < 4);
  if (!usable.length) return baseline;
  const total = usable.reduce((sum, e) => {
    const support = Math.max(1, e.supporting_count ?? 1);
    const contradictions = Math.max(0, e.contradicting_count ?? 0);
    const consistency = support / (support + contradictions);
    const tierWeight =
      ({ 1: 1, 2: .8, 3: .25, 4: 0 } as const)[e.source_tier ?? 3];
    const independent = Math.min(
      1.5,
      1 + .1 * Math.max(0, (e.independent_source_count ?? 1) - 1),
    );
    return sum +
      STRENGTH[e.strength] * (e.confidence ?? 0.5) * consistency * tierWeight *
        independent;
  }, 0);
  return clamp(
    50 + 40 * Math.min(1, total / 2) + 10 * Math.min(1, usable.length / 3),
  );
}

function qualityWeightedCount(items: ScoringEvidence[]) {
  return items.reduce((sum, item) => {
    const tier =
      ({ 1: 1, 2: .8, 3: .25, 4: 0 } as const)[item.source_tier ?? 3];
    const corroboration = Math.min(
      1.35,
      1 + .1 * Math.max(0, (item.independent_source_count ?? 1) - 1),
    );
    return sum + tier * corroboration;
  }, 0);
}

export function computeFactors(ctx: ScoringContext): FactorResult[] {
  const usableEvidence = ctx.evidence.filter((e) =>
    !e.excluded && (e.source_tier ?? 3) < 4
  );
  const by = (type: ScoringEvidence["signal_type"]) =>
    usableEvidence.filter((e) => e.signal_type === type);
  const pain = by("Pain"),
    demand = by("Demand"),
    pricing = by("Pricing"),
    risk = by("Risk");
  const urgent = [...pain, ...demand].filter((e) =>
    lexicon(`${e.title} ${e.snippet}`, [
      "urgent",
      "immediately",
      "now",
      "waste",
      "hours",
      "cost",
    ])
  );
  const recurring = [...pain, ...demand].filter((e) =>
    lexicon(`${e.title} ${e.snippet}`, [
      "daily",
      "weekly",
      "monthly",
      "recurring",
      "every time",
      "workflow",
    ])
  );
  const platform = risk.filter((e) =>
    lexicon(`${e.title} ${e.snippet}`, [
      "platform",
      "api",
      "vendor",
      "dependency",
    ])
  );
  const regulatory = risk.filter((e) =>
    lexicon(`${e.title} ${e.snippet}`, [
      "regulat",
      "compliance",
      "privacy",
      "legal",
      "license",
    ])
  );
  const directCompetitors = ctx.competitors.filter((c) => c.classification === "direct");
  const explicitGaps = directCompetitors.filter((c) => c.gap.trim().length >= 12);
  const competitiveDensity = ctx.competitors.reduce((sum, competitor) => {
    const classification = competitor.classification || "adjacent";
    const weight = classification === "direct"
      ? 1
      : classification === "adjacent"
      ? 0.35
      : classification === "substitute"
      ? 0.25
      : 0.15;
    return sum + weight;
  }, 0);
  const gapEvidence = [...pain, ...demand].filter((e) =>
    lexicon(`${e.title} ${e.snippet}`, [
      "alternative",
      "missing",
      "expensive",
      "frustrat",
      "complex",
    ])
  );
  const competitorEvidence = usableEvidence.filter((item) =>
    item.evidence_topic === "competitors" ||
    item.evidence_topic === "alternatives"
  );
  const competitionFactorEvidence = [
    ...new Map([...gapEvidence, ...competitorEvidence].map((item) => [item.id, item])).values(),
  ];
  const independentSources = Math.max(
    0,
    ...demand.map((e) => e.independent_source_count ?? 1),
  );
  const weightedDemand = qualityWeightedCount(demand);
  const weightedGapEvidence = qualityWeightedCount(gapEvidence);
  const tierOnePublishedPricing = pricing.filter((e) => e.source_tier === 1);
  const directWillingnessToPay = pricing.filter((e) =>
    e.source_tier === 1 && isDirectWillingnessToPayEvidence(e)
  );
  const executionRisks = ctx.risks.filter((r) =>
    r.category === "Execution" && r.severity !== "Low"
  );
  const mk = (
    criterion: Criterion,
    score: number,
    items: ScoringEvidence[],
    note: string,
  ) => applyFactorEvidenceConfidence({
    criterion,
    score: clamp(score),
    evidenceIds: refs(items),
    note,
  }, items, Boolean(ctx.unresolvedContradictionCount) &&
    items.some((item) => roleFor(item) === "challenging"));
  return [
    mk(
      "painSeverity",
      evidenceScore(pain),
      pain,
      "Weighted verified pain strength, confidence, and contradiction ratio.",
    ),
    mk(
      "purchaseUrgency",
      evidenceScore(urgent, 15),
      urgent,
      "Urgency language in pain and demand evidence.",
    ),
    mk(
      "willingnessToPay",
      evidenceScore(directWillingnessToPay, directWillingnessToPay.length ? 25 : 10),
      directWillingnessToPay,
      directWillingnessToPay.length
        ? "Tier 1 buyer payment or purchase-commitment evidence, weighted by independent corroboration."
        : "No direct Tier 1 buyer payment or purchase-commitment evidence; competitor list prices do not prove willingness to pay.",
    ),
    mk(
      "buyerReachability",
      20 + Math.min(65, weightedDemand * 6 + independentSources * 9),
      demand,
      "Demand volume and independently sourced communities.",
    ),
    mk(
      "mvpSpeed",
      75 - executionRisks.length * 15 - risk.length * 3,
      risk,
      "Execution-risk burden; fewer material risks increase feasibility.",
    ),
    mk(
      "competitionGap",
      65 - competitiveDensity * 8 + explicitGaps.length * 10 +
        Math.min(15, weightedGapEvidence * 5),
      competitionFactorEvidence,
      "Classification-weighted competitive density; only justified direct competitors receive full incumbent pressure or gap credit.",
    ),
    mk(
      "retentionPotential",
      evidenceScore(recurring, 20),
      recurring,
      "Recurring-workflow language in verified evidence.",
    ),
    mk(
      "platformDependencyRisk",
      evidenceScore(platform, 10),
      platform,
      "Platform dependency risk evidence; this factor is inverted in the weighted total.",
    ),
    mk(
      "regulatoryRisk",
      evidenceScore(regulatory, 10),
      regulatory,
      "Regulatory and compliance risk evidence; this factor is inverted in the weighted total.",
    ),
    mk(
      "founderFit",
      25 +
        Math.min(
          45,
          usableEvidence.filter((e) => (e.source_tier ?? 3) <= 2).length * 7,
        ),
      [],
      "Run-specific evidence access and domain signal coverage; no unsupported founder biography is inferred.",
    ),
    mk(
      "distributionClarity",
      20 + Math.min(65, weightedDemand * 7 + ctx.launchStrategyCount * 6),
      demand,
      "Demand evidence plus persisted launch-channel specificity.",
    ),
    mk(
      "speedToFirstRevenue",
      (evidenceScore([...tierOnePublishedPricing, ...urgent], 10) +
        (tierOnePublishedPricing.length ? 10 : 0)) * 0.87,
      [...tierOnePublishedPricing, ...urgent],
      "Pricing proof and purchase urgency combined deterministically.",
    ),
  ];
}

export function calculateDeterministicScore(
  factors: Array<FactorResult | {
    criterion: Criterion;
    score: number;
    effectiveScore?: number;
    evidenceIds: string[];
    note: string;
  }>,
  weightRows: WeightRow[],
) {
  const weights = new Map(
    weightRows.map((w) => [w.criterion, Math.max(0, Number(w.weight))]),
  );
  for (const key of CRITERIA) {
    if (!weights.has(key)) {
      throw new Error(`Missing database weight for ${key}`);
    }
  }
  const totalWeight = CRITERIA.reduce(
    (sum, key) => sum + (weights.get(key) ?? 0),
    0,
  );
  if (totalWeight <= 0) {
    throw new Error("Scoring weights must sum to a positive value.");
  }
  const raw = factors.reduce((sum, factor) => {
    const factorScore = factor.effectiveScore ?? factor.score;
    const effective = factor.criterion === "platformDependencyRisk" ||
        factor.criterion === "regulatoryRisk"
      ? 100 - factorScore
      : factorScore;
    return sum + effective * (weights.get(factor.criterion) ?? 0) / totalWeight;
  }, 0);
  return Math.round(raw * 10) / 10;
}

export type ScoreConfidenceBand = {
  minimum: number;
  maximum: number;
  label: "High Evidence Confidence" | "Moderate Evidence Confidence" | "Low Evidence Confidence";
  display: string;
};

export function deriveScoreConfidenceBand(
  factors: FactorResult[],
  weightRows: WeightRow[],
  exactScore = calculateDeterministicScore(factors, weightRows),
): ScoreConfidenceBand {
  const weights = new Map(weightRows.map((row) => [row.criterion, Math.max(0, Number(row.weight))]));
  const totalWeight = CRITERIA.reduce((sum, criterion) => sum + (weights.get(criterion) ?? 0), 0) || 1;
  const uncertainty = factors.reduce((sum, factor) => {
    const weight = (weights.get(factor.criterion) ?? 0) / totalWeight;
    return sum + (1 - factor.evidenceCoefficient) * 50 * weight;
  }, 0);
  const weightedCoefficient = factors.reduce((sum, factor) =>
    sum + factor.evidenceCoefficient * ((weights.get(factor.criterion) ?? 0) / totalWeight), 0);
  const label = weightedCoefficient >= 0.72 &&
      factors.filter((factor) => factor.evidenceState === "ASSUMED").length <= 1
    ? "High Evidence Confidence"
    : weightedCoefficient >= 0.45 &&
        factors.filter((factor) => factor.evidenceState === "ASSUMED").length <= 5
    ? "Moderate Evidence Confidence"
    : "Low Evidence Confidence";
  const minimum = Math.max(0, Math.floor(exactScore - uncertainty));
  const maximum = Math.min(100, Math.ceil(exactScore + uncertainty));
  return {
    minimum,
    maximum,
    label,
    display: label === "High Evidence Confidence"
      ? `${round(exactScore, 1)}/100`
      : `${minimum}–${maximum} · ${label}`,
  };
}

export function verdictFor(score: number) {
  if (score >= 85) return "Build Now" as const;
  if (score >= 70) return "Validate First" as const;
  if (score >= 55) return "Niche Down" as const;
  if (score >= 40) return "Weak Signal" as const;
  return "Avoid" as const;
}
