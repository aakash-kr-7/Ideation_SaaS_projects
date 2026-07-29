import type { ResearchPack, RetrievedSource } from "./external-retrieval.ts";
import type { CanonicalResearchBrief } from "./research-brief.ts";

export const QUICK_SCAN_GROUNDED_CALL_BUDGET = {
  planned: 3,
  conditionalRepair: 1,
  maximum: 4,
} as const;

export const COVERAGE_REPAIR_TRIGGERS = [
  "fewer_than_three_independent_groups",
  "critical_factor_without_direct_evidence",
  "no_live_verified_competitor",
  "no_validated_pricing",
  "buyer_evidence_absent",
  "single_source_family",
  "missing_proposition_contradiction",
] as const;

export type CoverageRepairTrigger = typeof COVERAGE_REPAIR_TRIGGERS[number];

export interface ValidatedPricingObservation {
  sourceUrl: string;
  sourceDomain: string;
  queryFamily: string;
  exactExcerpt: string;
  planName: string | null;
  pricePoint: string;
  pricingModel: "subscription" | "usage" | "one_time" | "custom" | "unknown";
  validationState: "verified";
}

export interface PreSynthesisFactorState {
  factorId: string;
  evidenceState: "EVIDENCED" | "SUGGESTIVE" | "ASSUMED";
  sourceFamilies: string[];
  directSourceCount: number;
}

export interface QuickScanCoverage {
  independentGroups: string[];
  independentDomains: string[];
  sourceFamilies: string[];
  directSourceCount: number;
  buyerEvidenceCount: number;
  liveVerifiedCompetitorCount: number;
  validatedPricingCount: number;
  adversarialEvidenceCount: number;
  criticalFactorsWithoutDirectEvidence: string[];
  factorEvidenceStates: PreSynthesisFactorState[];
  missingEvidence: string[];
  sourceConcentration: {
    dominantDomain: string | null;
    dominantDomainShare: number;
    dominantFamily: string | null;
    dominantFamilyShare: number;
  };
  repairTriggers: CoverageRepairTrigger[];
}

const FACTOR_REQUIREMENTS: Array<{
  factorId: string;
  families: string[];
  dimensions: string[];
  critical?: boolean;
}> = [
  { factorId: "problemSeverity", families: ["quick_primary_problem_buyer_demand"], dimensions: ["problem"], critical: true },
  { factorId: "customerPainFrequency", families: ["quick_primary_problem_buyer_demand"], dimensions: ["problem", "user_workflow"], critical: true },
  { factorId: "marketDemand", families: ["quick_primary_problem_buyer_demand"], dimensions: ["target_buyer", "market_category"], critical: true },
  { factorId: "willingnessToPay", families: ["quick_pricing_wtp_reachability"], dimensions: ["target_buyer"], critical: true },
  { factorId: "competitorDensity", families: ["quick_adversarial", "quick_pricing_wtp_reachability"], dimensions: ["market_category"] },
  { factorId: "differentiationPotential", families: ["quick_adversarial", "quick_pricing_wtp_reachability"], dimensions: ["proposed_solution", "market_category"] },
  { factorId: "technicalFeasibility", families: ["quick_primary_problem_buyer_demand"], dimensions: ["proposed_solution"] },
  { factorId: "buildComplexity", families: ["quick_primary_problem_buyer_demand"], dimensions: ["proposed_solution"] },
  { factorId: "goToMarketEase", families: ["quick_pricing_wtp_reachability"], dimensions: ["target_buyer"], critical: true },
  { factorId: "buyerReachability", families: ["quick_pricing_wtp_reachability"], dimensions: ["target_buyer"], critical: true },
  { factorId: "switchingFriction", families: ["quick_adversarial", "quick_pricing_wtp_reachability"], dimensions: ["user_workflow"] },
  { factorId: "regulatoryRisk", families: ["quick_adversarial"], dimensions: ["market_category"] },
];

export function evaluateQuickScanCoverage(
  sources: RetrievedSource[],
  pricing: ValidatedPricingObservation[] = extractValidatedPricingObservations(sources),
): QuickScanCoverage {
  const independentGroups = unique(sources.map(independenceGroup));
  const independentDomains = unique(sources.map((source) => canonicalDomain(source.domain)));
  const sourceFamilies = unique(sources.map(sourceFamily));
  const directSources = sources.filter((source) =>
    source.authority.directnessScore >= 0.72 && source.relevance.score >= 0.58
  );
  const buyerEvidence = sources.filter((source) =>
    /quick_primary_problem_buyer_demand|quick_pricing_wtp_reachability|quick_coverage_repair/.test(source.queryFamily) &&
    (source.authority.pageType === "buyer_review" ||
      source.authority.pageType === "community_discussion" ||
      source.relevance.matchedDimensions.includes("target_buyer"))
  );
  const competitors = sources.filter((source) =>
    /quick_pricing_wtp_reachability|quick_adversarial|quick_coverage_repair/.test(source.queryFamily) &&
    ["official_product", "official_documentation", "official_pricing"].includes(source.authority.pageType)
  );
  const adversarial = sources.filter((source) =>
    source.queryFamily === "quick_adversarial" &&
    propositionChallengeLanguage(`${source.title}\n${source.text}`)
  );
  const factorEvidenceStates = FACTOR_REQUIREMENTS.map((requirement) => {
    const relevant = sources.filter((source) =>
      (requirement.families.includes(source.queryFamily) ||
        source.queryFamily === "quick_coverage_repair") &&
      requirement.dimensions.some((dimension) =>
        source.relevance.matchedDimensions.includes(dimension as never)
      )
    );
    const direct = relevant.filter((source) =>
      source.authority.directnessScore >= 0.72 && source.relevance.score >= 0.58
    );
    const independent = unique(relevant.map(independenceGroup)).length;
    return {
      factorId: requirement.factorId,
      evidenceState: direct.length > 0 && independent >= 2
        ? "EVIDENCED" as const
        : relevant.length > 0
        ? "SUGGESTIVE" as const
        : "ASSUMED" as const,
      sourceFamilies: unique(relevant.map(sourceFamily)),
      directSourceCount: direct.length,
    };
  });
  const criticalFactorsWithoutDirectEvidence = FACTOR_REQUIREMENTS
    .filter((requirement) => requirement.critical)
    .filter((requirement) =>
      factorEvidenceStates.find((state) => state.factorId === requirement.factorId)?.directSourceCount === 0
    )
    .map((requirement) => requirement.factorId);
  const domainConcentration = concentration(sources.map((source) => canonicalDomain(source.domain)));
  const familyConcentration = concentration(sources.map(sourceFamily));
  const repairTriggers: CoverageRepairTrigger[] = [];
  if (independentGroups.length < 3) repairTriggers.push("fewer_than_three_independent_groups");
  if (criticalFactorsWithoutDirectEvidence.length) repairTriggers.push("critical_factor_without_direct_evidence");
  if (!competitors.length) repairTriggers.push("no_live_verified_competitor");
  if (!pricing.length) repairTriggers.push("no_validated_pricing");
  if (!buyerEvidence.length) repairTriggers.push("buyer_evidence_absent");
  if (sourceFamilies.length <= 1) repairTriggers.push("single_source_family");
  const positiveClaimStrong = sources.some((source) =>
    source.queryFamily === "quick_primary_problem_buyer_demand" &&
    source.authority.directnessScore >= 0.8 &&
    source.relevance.score >= 0.72
  );
  if (positiveClaimStrong && !adversarial.length) repairTriggers.push("missing_proposition_contradiction");
  const missingEvidence = [
    ...(!buyerEvidence.length ? ["direct buyer evidence"] : []),
    ...(!competitors.length ? ["live-verified competitor"] : []),
    ...(!pricing.length ? ["deterministically validated pricing"] : []),
    ...(!adversarial.length ? ["proposition-specific challenging evidence"] : []),
    ...criticalFactorsWithoutDirectEvidence.map((factor) => `direct evidence for ${factor}`),
  ];
  return {
    independentGroups,
    independentDomains,
    sourceFamilies,
    directSourceCount: directSources.length,
    buyerEvidenceCount: buyerEvidence.length,
    liveVerifiedCompetitorCount: competitors.length,
    validatedPricingCount: pricing.length,
    adversarialEvidenceCount: adversarial.length,
    criticalFactorsWithoutDirectEvidence,
    factorEvidenceStates,
    missingEvidence: unique(missingEvidence),
    sourceConcentration: {
      dominantDomain: domainConcentration.value,
      dominantDomainShare: domainConcentration.share,
      dominantFamily: familyConcentration.value,
      dominantFamilyShare: familyConcentration.share,
    },
    repairTriggers: unique(repairTriggers),
  };
}

export function buildCoverageRepairPack(
  brief: CanonicalResearchBrief,
  coverage: QuickScanCoverage,
): ResearchPack {
  const angle = coverage.repairTriggers.includes("buyer_evidence_absent")
    ? "first-person discussion interview procurement forum complaint"
    : coverage.repairTriggers.includes("no_validated_pricing")
    ? "site:official pricing plans billing procurement paid pilot"
    : coverage.repairTriggers.includes("no_live_verified_competitor")
    ? "official product documentation alternatives comparison"
    : coverage.repairTriggers.includes("missing_proposition_contradiction")
    ? "failed abandoned unnecessary workaround resistance switching occasional"
    : "case study documentation buyer review measurable outcome";
  return {
    key: "quick_coverage_repair",
    purpose: "coverage_repair",
    query:
      `"${brief.targetBuyer}" "${brief.workflowChanged}" ${angle} -summary -trend`,
    focus:
      `a different-angle coverage repair for: ${coverage.repairTriggers.join(", ")}`,
  };
}

export function extractValidatedPricingObservations(
  sources: RetrievedSource[],
): ValidatedPricingObservation[] {
  const observations: ValidatedPricingObservation[] = [];
  const currencyPrice = /(?:[$€£₹]\s?\d+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?\s?(?:USD|EUR|GBP|INR))(?:\s*(?:\/|per)\s*(?:user|seat|month|year|project|usage|request))?/gi;
  const planPattern = /\b([A-Z][A-Za-z0-9 +&-]{1,30})\s+(?:plan|tier|package)\b/;
  for (const source of sources) {
    if (!["official_pricing", "official_documentation"].includes(source.authority.pageType)) continue;
    const matches = [...source.text.matchAll(currencyPrice)].slice(0, 8);
    for (const match of matches) {
      const start = Math.max(0, (match.index || 0) - 90);
      const end = Math.min(source.text.length, (match.index || 0) + match[0].length + 110);
      const excerpt = source.text.slice(start, end).replace(/\s+/g, " ").trim();
      if (!excerpt.includes(match[0])) continue;
      const planName = excerpt.match(planPattern)?.[1]?.trim()
        .replace(/^the\s+/i, "") || null;
      observations.push({
        sourceUrl: source.canonicalUrl,
        sourceDomain: canonicalDomain(source.domain),
        queryFamily: source.queryFamily,
        exactExcerpt: excerpt,
        planName,
        pricePoint: match[0].replace(/\s+/g, " ").trim(),
        pricingModel: /per (?:user|seat|month|year)|\/\s*(?:user|seat|month|year)/i.test(excerpt)
          ? "subscription"
          : /usage|request|credit|token/i.test(excerpt)
          ? "usage"
          : /one.time|lifetime/i.test(excerpt)
          ? "one_time"
          : /contact (?:us|sales)|custom/i.test(excerpt)
          ? "custom"
          : "unknown",
        validationState: "verified",
      });
    }
  }
  return dedupePricing(observations);
}

export function propositionContradictions(
  proposition: string,
  sources: Array<{ sourceId: string; queryFamily: string }>,
) {
  const supportingEvidenceIds = unique(sources
    .filter((source) => source.queryFamily === "quick_primary_problem_buyer_demand")
    .map((source) => source.sourceId));
  const challengingEvidenceIds = unique(sources
    .filter((source) => source.queryFamily === "quick_adversarial")
    .map((source) => source.sourceId));
  return [{
    proposition,
    supportingEvidenceIds,
    challengingEvidenceIds,
    segmentApplicability: "Canonical target buyer and workflow only",
    unresolvedImplication: challengingEvidenceIds.length
      ? "The accepted adversarial sources must be tested against the same proposition during evidence extraction."
      : "No genuine proposition-specific contradiction passed retrieval validation in this scan.",
  }];
}

function sourceFamily(source: RetrievedSource) {
  return source.sourceClass || source.authority.pageType;
}

function independenceGroup(source: RetrievedSource) {
  const normalized = source.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const claimPrefix = normalized.split(" ").slice(0, 60).join(" ");
  return `${canonicalDomain(source.domain)}:${simpleHash(claimPrefix)}`;
}

function canonicalDomain(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function propositionChallengeLanguage(value: string) {
  return /\b(?:unnecessary|low priority|rarely|occasional|workaround|free alternative|resistan|switching|failed|abandoned|saturat|already use|good enough|not worth)\b/i.test(value);
}

function concentration(values: string[]) {
  if (!values.length) return { value: null, share: 0 };
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const [value, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
  return { value, share: Number((count / values.length).toFixed(2)) };
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function dedupePricing(values: ValidatedPricingObservation[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = `${value.sourceUrl}|${value.planName || ""}|${value.pricePoint}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
