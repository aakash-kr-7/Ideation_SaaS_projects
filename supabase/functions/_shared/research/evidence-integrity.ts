import {
  CRITERIA,
  type Criterion,
  type FactorResult,
  type ScoringEvidence,
  type ScoreConfidenceBand,
} from "./scoring-engine.ts";

export type EvidenceConfidence = "High" | "Moderate" | "Low" | "Insufficient";

export interface EvidenceSufficiencySummary {
  acceptedEvidenceCount: number;
  independentEvidenceGroups: number;
  independentDomains: number;
  sourceFamilyCoverage: string[];
  primaryDirectEvidenceCount: number;
  supportingEvidenceCount: number;
  challengingEvidenceCount: number;
  coveredFactors: Criterion[];
  assumedFactors: Criterion[];
  missingEvidenceFamilies: string[];
  sourceConcentration: number;
  overallEvidenceConfidence: EvidenceConfidence;
  mostImportantLimitation: string;
}

export interface VerdictChangeConditions {
  nearestBoundary: number | null;
  highestLeverageUncertainFactor: Criterion;
  upgradeCondition: string;
  downgradeCondition: string;
}

export type CompetitorVerificationStatus =
  | "discovered_candidate"
  | "live_verified_competitor"
  | "adjacent_alternative"
  | "unverified_seed";

export function competitorIntegrityPresentation(competitor: {
  evidenceIds?: string[];
  verificationStatus?: CompetitorVerificationStatus | string;
  classification?: string;
  pricing?: string;
  positioning?: string;
  gap?: string;
}) {
  const acceptedStatus = [
    "discovered_candidate",
    "live_verified_competitor",
    "adjacent_alternative",
    "unverified_seed",
  ].includes(String(competitor.verificationStatus))
    ? competitor.verificationStatus as CompetitorVerificationStatus
    : undefined;
  const verificationStatus = acceptedStatus ||
    (competitor.evidenceIds?.length
      ? competitor.classification === "adjacent"
        ? "adjacent_alternative"
        : "live_verified_competitor"
      : "unverified_seed");
  const liveVerified = verificationStatus === "live_verified_competitor" ||
    verificationStatus === "adjacent_alternative";
  return {
    verificationStatus,
    liveVerified,
    pricing: liveVerified ? competitor.pricing || "Unavailable" : "Not live verified",
    positioning: liveVerified ? competitor.positioning || "Unavailable" : "Not live verified",
    gap: liveVerified ? competitor.gap || "Unavailable" : "Unavailable — evidence gap",
  };
}

const EXPECTED_EVIDENCE_FAMILIES = [
  "customer_pain",
  "behavior_demand",
  "willingness_to_pay",
  "competitors",
  "pricing",
  "risks",
  "contradiction",
] as const;

const normalizeNumberWords = (value: string) => value
  .replace(/\bone\b/g, "1")
  .replace(/\btwo\b/g, "2")
  .replace(/\bthree\b/g, "3")
  .replace(/\bfour\b/g, "4")
  .replace(/\bfive\b/g, "5");

export function normalizeSemanticText(value: unknown) {
  return normalizeNumberWords(String(value || "").toLowerCase())
    .replace(/\bevery week\b/g, "weekly")
    .replace(/\bcomes? from\b/g, " ")
    .replace(/\breported\b/g, "report")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\b(?:a|an|and|the|to|of|for|in|on|with|this|that|is|are|was|were)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function semanticSimilarity(left: unknown, right: unknown) {
  const a = normalizeSemanticText(left);
  const b = normalizeSemanticText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 32 && (a.includes(b) || b.includes(a))) {
    return Math.min(a.length, b.length) / Math.max(a.length, b.length);
  }
  const leftTokens = new Set(a.split(" "));
  const rightTokens = new Set(b.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  return intersection / union;
}

export function isSemanticDuplicate(left: unknown, right: unknown, threshold = 0.82) {
  return semanticSimilarity(left, right) >= threshold;
}

export function dedupeSemanticValues(
  values: Array<{ key: string; text: string; strength: number }>,
) {
  const ordered = [...values].sort((a, b) => b.strength - a.strength);
  const kept: typeof ordered = [];
  const unavailable = new Map<string, string>();
  for (const candidate of ordered) {
    const duplicate = kept.find((item) => isSemanticDuplicate(item.text, candidate.text));
    if (duplicate) {
      unavailable.set(
        candidate.key,
        `Unavailable — equivalent content is already shown in ${duplicate.key}.`,
      );
    } else {
      kept.push(candidate);
    }
  }
  return unavailable;
}

export function applyReportSemanticDeduplication(payload: any) {
  const placements: Array<{
    key: string;
    text: string;
    strength: number;
    replace: (value: string) => void;
  }> = [];
  const add = (
    key: string,
    text: unknown,
    strength: number,
    replace: (value: string) => void,
  ) => {
    const value = String(text || "").trim();
    if (value) placements.push({ key, text: value, strength, replace });
  };
  add("executive summary", payload.executiveSummary, 100, (value) => {
    payload.executiveSummary = value;
  });
  add("top recommendation", payload.topRecommendation, 90, (value) => {
    payload.topRecommendation = value;
  });
  add(
    "decision product primary recommendation",
    payload.decisionProduct?.primaryRecommendation,
    88,
    (value) => {
      payload.decisionProduct.primaryRecommendation = value;
    },
  );
  for (const [sectionIndex, section] of (payload.decisionProduct?.sections || []).entries()) {
    add(`section ${section.title || sectionIndex + 1}`, section.summary, 80, (value) => {
      section.summary = value;
    });
    for (const [statementIndex, statement] of (section.statements || []).entries()) {
      add(
        `${section.title || sectionIndex + 1} finding ${statementIndex + 1}`,
        statement.text,
        statement.kind === "Fact" ? 85 : 70,
        (value) => {
          statement.text = value;
          if (value.startsWith("Unavailable")) {
            statement.kind = "MissingEvidence";
            statement.evidenceIds = [];
            statement.sourceUrls = [];
          }
        },
      );
    }
  }
  for (const specialist of payload.decisionProduct?.specialistOutputs || []) {
    for (const [index, finding] of (specialist.keyFindings || []).entries()) {
      add(`${specialist.name} specialist finding ${index + 1}`, finding, 65, (value) => {
        specialist.keyFindings[index] = value;
      });
    }
    add(`${specialist.name} specialist implication`, specialist.decisionImplication, 60, (value) => {
      specialist.decisionImplication = value;
    });
  }
  const unavailable = dedupeSemanticValues(placements);
  for (const placement of placements) {
    const replacement = unavailable.get(placement.key);
    if (replacement) placement.replace(replacement);
  }
  return payload;
}

export const RECOGNIZABLE_REPORT_PLACEHOLDERS = [
  "Acme Inc.",
  "$49/month",
  "100 customers",
  "8 qualified participants",
  "14 days",
] as const;

export function findPlaceholderLeakage(
  payload: unknown,
  acceptedEvidenceText: string[],
  placeholders: readonly string[] = RECOGNIZABLE_REPORT_PLACEHOLDERS,
) {
  const reportText = JSON.stringify(payload);
  const evidenceText = acceptedEvidenceText.join("\n");
  return placeholders.filter((placeholder) =>
    reportText.toLowerCase().includes(placeholder.toLowerCase()) &&
    !evidenceText.toLowerCase().includes(placeholder.toLowerCase())
  );
}

const evidenceGroupKey = (item: ScoringEvidence) =>
  item.independence_key || item.syndication_group || item.claim_fingerprint ||
  item.canonical_source_id || item.source_id || `evidence:${item.id}`;
const domainFor = (item: ScoringEvidence) =>
  String(item.canonical_domain || "").replace(/^www\./, "").toLowerCase();
const evidenceFamilyFor = (item: ScoringEvidence) =>
  String(item.source_family || item.evidence_topic || item.evidence_family || "unclassified");

export function buildEvidenceSufficiencySummary(
  evidence: ScoringEvidence[],
  factors: FactorResult[],
  scoreBand?: ScoreConfidenceBand,
): EvidenceSufficiencySummary {
  const accepted = evidence.filter((item) =>
    !item.excluded && (item.source_tier ?? 3) < 4 &&
    item.numeric_validation_state !== "rejected"
  );
  const groups = new Set(accepted.map(evidenceGroupKey));
  const domains = new Set(accepted.map(domainFor).filter(Boolean));
  const sourceFamilies = [...new Set(accepted.map(evidenceFamilyFor).filter(Boolean))].sort();
  const sourceCounts = new Map<string, number>();
  for (const item of accepted) {
    const key = domainFor(item) || evidenceGroupKey(item);
    sourceCounts.set(key, (sourceCounts.get(key) || 0) + 1);
  }
  const largestSourceCount = Math.max(0, ...sourceCounts.values());
  const sourceConcentration = accepted.length
    ? Number((largestSourceCount / accepted.length).toFixed(3))
    : 0;
  const coveredFactors = factors
    .filter((factor) => factor.evidenceState !== "ASSUMED")
    .map((factor) => factor.criterion);
  const assumedFactors = factors
    .filter((factor) => factor.evidenceState === "ASSUMED")
    .map((factor) => factor.criterion);
  const missingEvidenceFamilies = EXPECTED_EVIDENCE_FAMILIES.filter((family) =>
    !accepted.some((item) =>
      item.evidence_topic === family || item.source_family === family
    )
  );
  const primaryDirectEvidenceCount = accepted.filter((item) =>
    (item.source_tier ?? 4) <= 2 &&
    Number(item.evidence_directness ?? 0) >= 0.7
  ).length;
  const supportingEvidenceCount = accepted.filter((item) =>
    item.evidence_role === "supporting" || (!item.evidence_role && !item.disconfirming)
  ).length;
  const challengingEvidenceCount = accepted.filter((item) =>
    item.evidence_role === "challenging" || item.disconfirming
  ).length;
  const overallEvidenceConfidence: EvidenceConfidence =
    scoreBand?.label === "High Evidence Confidence"
      ? "High"
      : scoreBand?.label === "Moderate Evidence Confidence"
      ? "Moderate"
      : accepted.length
      ? "Low"
      : "Insufficient";
  const mostImportantLimitation = assumedFactors.length
    ? `${assumedFactors.length} of ${CRITERIA.length} factors remain assumed; ${humanize(assumedFactors[0])} is the highest-priority unproven factor.`
    : primaryDirectEvidenceCount === 0
    ? "No accepted evidence item is both primary and direct."
    : sourceConcentration > 0.6
    ? `${Math.round(sourceConcentration * 100)}% of accepted evidence is concentrated in one source domain or family.`
    : missingEvidenceFamilies.length
    ? `The strongest remaining family gap is ${humanize(missingEvidenceFamilies[0])}.`
    : "No material evidence-sufficiency limitation was detected by the configured policy.";
  return {
    acceptedEvidenceCount: accepted.length,
    independentEvidenceGroups: groups.size,
    independentDomains: domains.size,
    sourceFamilyCoverage: sourceFamilies,
    primaryDirectEvidenceCount,
    supportingEvidenceCount,
    challengingEvidenceCount,
    coveredFactors,
    assumedFactors,
    missingEvidenceFamilies: [...missingEvidenceFamilies],
    sourceConcentration,
    overallEvidenceConfidence,
    mostImportantLimitation,
  };
}

const UPGRADE_CONDITIONS: Record<Criterion, string> = {
  painSeverity: "multiple independent target buyers provide attributable recent examples of severe workflow pain",
  purchaseUrgency: "independent target buyers show a current deadline, budget event, or measurable cost of delay",
  willingnessToPay: "at least two independent target buyers make attributable paid-pilot, deposit, or purchase commitments",
  buyerReachability: "a named acquisition channel repeatedly produces qualified target-buyer conversations",
  mvpSpeed: "the core workflow is demonstrated without the unresolved execution dependencies",
  competitionGap: "direct comparisons show a buyer-relevant workflow gap across independently verified alternatives",
  retentionPotential: "target users repeat the workflow without prompting across separate real work cycles",
  platformDependencyRisk: "the critical workflow remains viable under a documented platform-policy or API failure",
  regulatoryRisk: "an authoritative regulator or qualified primary source confirms the proposed workflow is permissible",
  founderFit: "the team demonstrates attributable buyer access or domain execution evidence",
  distributionClarity: "one channel repeatedly yields qualified buyers at a measurable conversion rate",
  speedToFirstRevenue: "a qualified buyer accepts a paid commitment for the scoped first offer",
};
const DOWNGRADE_CONDITIONS: Record<Criterion, string> = {
  painSeverity: "target buyers independently report that the workflow is infrequent or has no measurable consequence",
  purchaseUrgency: "buyers consistently defer action without cost, deadline, or budget impact",
  willingnessToPay: "qualified buyers reject payment after using or reviewing the same scoped offer",
  buyerReachability: "the proposed channels fail to produce qualified target-buyer conversations",
  mvpSpeed: "a required dependency makes the core workflow materially slower or broader than scored",
  competitionGap: "current alternatives already solve the same buyer workflow without measurable switching friction",
  retentionPotential: "users do not repeat the workflow after the first use",
  platformDependencyRisk: "a platform policy or API restriction blocks the core workflow",
  regulatoryRisk: "an authoritative source identifies a required approval or prohibition that blocks the workflow",
  founderFit: "the team cannot access the buyer, data, or domain capability required for the first test",
  distributionClarity: "qualified acquisition remains unavailable without an untested high-cost channel",
  speedToFirstRevenue: "qualified buyers require substantial unpaid scope before considering payment",
};

export function buildVerdictChangeConditions(
  score: number,
  factors: FactorResult[],
  weightRows: Array<{ criterion: string; weight: number }>,
): VerdictChangeConditions {
  const weights = new Map(weightRows.map((row) => [row.criterion, Number(row.weight) || 0]));
  const uncertain = [...factors]
    .sort((a, b) =>
      ((1 - b.evidenceCoefficient) * (weights.get(b.criterion) || 0)) -
      ((1 - a.evidenceCoefficient) * (weights.get(a.criterion) || 0))
    )[0] || factors[0];
  const boundaries = [40, 55, 70, 85];
  const nearestBoundary = boundaries.length
    ? [...boundaries].sort((a, b) => Math.abs(a - score) - Math.abs(b - score))[0]
    : null;
  const factor = uncertain?.criterion || "painSeverity";
  return {
    nearestBoundary,
    highestLeverageUncertainFactor: factor,
    upgradeCondition: `We would upgrade this verdict if ${UPGRADE_CONDITIONS[factor]}.`,
    downgradeCondition: `We would downgrade it if ${DOWNGRADE_CONDITIONS[factor]}.`,
  };
}

function humanize(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").toLowerCase();
}
