import type { ResearchPack, RetrievedSource } from "./external-retrieval.ts";
import type { CanonicalResearchBrief } from "./research-brief.ts";

export const FULL_VALIDATION_NORMAL_CALL_LIMIT = 8;
export const FULL_VALIDATION_REPAIR_CALL_LIMIT = 2;

export const FULL_VALIDATION_PACKS = [
  "full_buyer_problem",
  "full_alternatives_competitors",
  "full_pricing_wtp_procurement",
  "full_reachability_acquisition",
  "full_feasibility_operations",
  "full_adversarial",
] as const;

export const FULL_VALIDATION_CONDITIONAL_TRIGGERS = [
  "regulatory_legal_exposure",
  "technical_feasibility",
  "marketplace_liquidity",
  "geographic_differences",
  "segment_disagreement",
  "missing_pricing_wtp",
  "source_concentration",
  "unresolved_contradictions",
  "coverage_repair",
] as const;

export type FullValidationPackKey = typeof FULL_VALIDATION_PACKS[number];
export type FullValidationConditionalTrigger =
  typeof FULL_VALIDATION_CONDITIONAL_TRIGGERS[number];

export type PropositionKind =
  | "problem_exists"
  | "problem_frequency"
  | "alternatives_inadequate"
  | "budget_control"
  | "economic_reachability"
  | "switching_friction"
  | "operational_feasibility";

export interface TestableProposition {
  key: PropositionKind;
  statement: string;
  buyerSegment: string;
  factorIds: string[];
  primaryPackKey: FullValidationPackKey;
}

export interface FullValidationCoverage {
  independentEvidenceGroups: string[];
  sourceFamilies: string[];
  primaryOfficialCount: number;
  directBuyerVoiceCount: number;
  verifiedCompetitorCount: number;
  verifiedPricingCount: number;
  directWtpCount: number;
  behavioralDemandCount: number;
  challengingEvidenceCount: number;
  assumptions: string[];
  unresolvedGaps: string[];
  sourceConcentration: number;
  triggers: FullValidationConditionalTrigger[];
}

export function decomposeFullValidationPropositions(
  brief: CanonicalResearchBrief,
): TestableProposition[] {
  const segment = brief.targetBuyer.trim() || "Unspecified target buyer";
  return [
    {
      key: "problem_exists",
      statement: `${segment} experiences ${brief.problemSolved}.`,
      buyerSegment: segment,
      factorIds: ["problemSeverity"],
      primaryPackKey: "full_buyer_problem",
    },
    {
      key: "problem_frequency",
      statement: `${brief.problemSolved} occurs frequently enough for ${segment} to prioritize a solution.`,
      buyerSegment: segment,
      factorIds: ["customerPainFrequency", "purchaseUrgency"],
      primaryPackKey: "full_buyer_problem",
    },
    {
      key: "alternatives_inadequate",
      statement: `Existing alternatives are inadequate for ${segment} in the ${brief.workflowChanged} workflow.`,
      buyerSegment: segment,
      factorIds: ["competitionGap", "differentiationPotential"],
      primaryPackKey: "full_alternatives_competitors",
    },
    {
      key: "budget_control",
      statement: `${segment} controls or materially influences budget for this outcome.`,
      buyerSegment: segment,
      factorIds: ["willingnessToPay"],
      primaryPackKey: "full_pricing_wtp_procurement",
    },
    {
      key: "economic_reachability",
      statement: `${segment} can be reached through identifiable, economically plausible acquisition channels.`,
      buyerSegment: segment,
      factorIds: ["buyerReachability", "goToMarketEase"],
      primaryPackKey: "full_reachability_acquisition",
    },
    {
      key: "switching_friction",
      statement: `Switching friction from current alternatives is manageable for ${segment}.`,
      buyerSegment: segment,
      factorIds: ["switchingFriction"],
      primaryPackKey: "full_alternatives_competitors",
    },
    {
      key: "operational_feasibility",
      statement: `${brief.exactProductProposition} can be built and operated with manageable dependencies and complexity.`,
      buyerSegment: segment,
      factorIds: ["technicalFeasibility", "buildComplexity", "operationalComplexity"],
      primaryPackKey: "full_feasibility_operations",
    },
  ];
}

export function buildFullValidationPacks(
  brief: CanonicalResearchBrief,
): ResearchPack[] {
  const anchor = `"${brief.targetBuyer}" "${brief.workflowChanged}"`;
  return [
    {
      key: "full_buyer_problem",
      purpose: "buyer_problem",
      query: `${anchor} pain frequency severity repeated workflow buyer interview complaint workaround`,
      focus: "buyer segments, direct buyer voice, problem frequency, severity, consequences, behavioural demand, and current workflow",
    },
    {
      key: "full_alternatives_competitors",
      purpose: "alternatives_competitors",
      query: `${anchor} alternatives competitors official product positioning features complaints switching barriers`,
      focus: "active alternatives and competitors, verified positioning and features, complaints, switching barriers, and category gaps",
    },
    {
      key: "full_pricing_wtp_procurement",
      purpose: "pricing_wtp",
      query: `${anchor} official pricing plan paid pilot purchase procurement budget owner contract willingness pay`,
      focus: "verified pricing, direct willingness-to-pay or purchase behaviour, procurement, budget ownership, and payment constraints",
    },
    {
      key: "full_reachability_acquisition",
      purpose: "reachability",
      query: `${anchor} association community directory conference channel acquisition sales buyer reach`,
      focus: "identifiable buyer populations, acquisition channels, sales motion, channel economics, and practical reachability",
    },
    {
      key: "full_feasibility_operations",
      purpose: "feasibility",
      query: `"${brief.exactProductProposition}" technical documentation integration dependency operations implementation`,
      focus: "build feasibility, operational complexity, integrations, dependencies, reliability, support, and implementation constraints",
    },
    {
      key: "full_adversarial",
      purpose: "adversarial",
      query: `${anchor} failed abandoned low priority unnecessary free workaround resistance churn regulation reason not build`,
      focus: "proposition-specific challenging evidence, failure patterns, low urgency, invalidating conditions, and reasons not to build",
    },
  ];
}

export function evaluateFullValidationCoverage(
  sources: RetrievedSource[],
  brief: CanonicalResearchBrief,
): FullValidationCoverage {
  const families = unique(sources.map((source) =>
    source.sourceClass || source.authority.pageType
  ));
  const groups = unique(sources.map(independenceGroup));
  const primaryOfficial = sources.filter((source) =>
    source.sourceClass === "primary" || source.sourceClass === "official" ||
    /^official_/.test(source.authority.pageType)
  );
  const buyerVoice = sources.filter((source) =>
    ["buyer_review", "community_discussion"].includes(source.authority.pageType)
  );
  const competitors = sources.filter((source) =>
    source.queryFamily === "full_alternatives_competitors" &&
    ["official_product", "official_documentation", "official_pricing"].includes(
      source.authority.pageType,
    )
  );
  const pricing = sources.filter((source) =>
    source.queryFamily === "full_pricing_wtp_procurement" &&
    source.authority.pageType === "official_pricing" &&
    hasPrice(source.text)
  );
  const wtp = sources.filter((source) =>
    source.queryFamily === "full_pricing_wtp_procurement" &&
    /\b(?:paid|purchased|contract|renewed|budget|procure|pilot)\b/i.test(source.text) &&
    !/pricing (?:page|plan|starts)|list price/i.test(source.text)
  );
  const demand = sources.filter((source) =>
    source.queryFamily === "full_buyer_problem" &&
    /\b(?:repeated|daily|weekly|monthly|hired|bought|adopted|uses|workaround)\b/i.test(source.text)
  );
  const challenging = sources.filter((source) =>
    source.queryFamily === "full_adversarial" &&
    /\b(?:failed|abandoned|low priority|unnecessary|resistan|churn|free alternative|good enough|rarely)\b/i.test(source.text)
  );
  const domainShare = concentration(sources.map((source) =>
    canonicalDomain(source.domain)
  ));
  const presentPacks = new Set(sources.map((source) => source.queryFamily));
  const assumptions: string[] = [];
  const gaps: string[] = [];
  if (!buyerVoice.length) gaps.push("direct buyer voice");
  if (!competitors.length) gaps.push("live-verified competitor");
  if (!pricing.length) gaps.push("verified pricing");
  if (!wtp.length) gaps.push("direct WTP or purchase behaviour");
  if (!demand.length) gaps.push("behavioural demand");
  if (!challenging.length) gaps.push("proposition-specific challenging evidence");
  for (const pack of FULL_VALIDATION_PACKS) {
    if (!presentPacks.has(pack)) gaps.push(`coverage for ${pack}`);
  }
  if (!pricing.length) assumptions.push("Pricing remains an assumption until an official page is validated.");
  if (!wtp.length) assumptions.push("Willingness to pay remains an assumption until purchase behaviour is found.");

  const input = [
    brief.exactProductProposition,
    brief.industry,
    brief.businessModel,
    brief.geography,
  ].join(" ");
  const triggers: FullValidationConditionalTrigger[] = [];
  if (/\b(?:regulated|regulation|legal|health|medical|finance|financial|insurance|children|privacy|biometric|employment)\b/i.test(input)) {
    triggers.push("regulatory_legal_exposure");
  }
  if (/\b(?:ai|api|developer|software|model|automation|integration|technical|security|data)\b/i.test(input) &&
      !hasPackEvidence(sources, "full_feasibility_operations")) {
    triggers.push("technical_feasibility");
  }
  if (/\b(?:marketplace|two-sided|buyers and sellers|supply and demand)\b/i.test(input)) {
    triggers.push("marketplace_liquidity");
  }
  if (brief.geography && !/global|unspecified|not specified/i.test(brief.geography) &&
      !sources.some((source) =>
        brief.geography.toLowerCase().split(/[^a-z0-9]+/)
          .filter((term) => term.length > 2)
          .some((term) => source.text.toLowerCase().includes(term))
      )) {
    triggers.push("geographic_differences");
  }
  if (segmentDisagreement(sources)) triggers.push("segment_disagreement");
  if (!pricing.length || !wtp.length) triggers.push("missing_pricing_wtp");
  if (domainShare > 0.5 || families.length < 2) triggers.push("source_concentration");
  if (!challenging.length) triggers.push("unresolved_contradictions");
  if (gaps.some((gap) => gap.startsWith("coverage for"))) triggers.push("coverage_repair");
  return {
    independentEvidenceGroups: groups,
    sourceFamilies: families,
    primaryOfficialCount: primaryOfficial.length,
    directBuyerVoiceCount: buyerVoice.length,
    verifiedCompetitorCount: competitors.length,
    verifiedPricingCount: pricing.length,
    directWtpCount: wtp.length,
    behavioralDemandCount: demand.length,
    challengingEvidenceCount: challenging.length,
    assumptions,
    unresolvedGaps: unique(gaps),
    sourceConcentration: domainShare,
    triggers: unique(triggers),
  };
}

export function selectConditionalPacks(
  brief: CanonicalResearchBrief,
  coverage: FullValidationCoverage,
): ResearchPack[] {
  const priorities: FullValidationConditionalTrigger[] = [
    "regulatory_legal_exposure",
    "marketplace_liquidity",
    "technical_feasibility",
    "missing_pricing_wtp",
    "segment_disagreement",
    "geographic_differences",
    "source_concentration",
    "unresolved_contradictions",
    "coverage_repair",
  ];
  return priorities
    .filter((trigger) => coverage.triggers.includes(trigger))
    .slice(0, FULL_VALIDATION_REPAIR_CALL_LIMIT)
    .map((trigger) => ({
      key: `full_repair_${trigger}`,
      purpose: "coverage_repair" as const,
      query: conditionalQuery(trigger, brief, coverage.unresolvedGaps),
      focus: `conditional specialist pass for ${trigger}; only unresolved evidence may be added`,
      conditionalTrigger: trigger,
    }));
}

export function evidenceAppliesToProposition(
  proposition: TestableProposition,
  evidence: { buyerSegment: string; researchPack: string; factorIds?: string[] },
) {
  if (normalize(evidence.buyerSegment) !== normalize(proposition.buyerSegment)) {
    return false;
  }
  return evidence.researchPack === proposition.primaryPackKey ||
    (evidence.factorIds || []).some((factor) =>
      proposition.factorIds.includes(factor)
    );
}

export function contradictionMatchesProposition(
  proposition: TestableProposition,
  support: { propositionKey: string; buyerSegment: string },
  challenge: { propositionKey: string; buyerSegment: string },
) {
  return support.propositionKey === proposition.key &&
    challenge.propositionKey === proposition.key &&
    normalize(support.buyerSegment) === normalize(proposition.buyerSegment) &&
    normalize(challenge.buyerSegment) === normalize(proposition.buyerSegment);
}

function conditionalQuery(
  trigger: FullValidationConditionalTrigger,
  brief: CanonicalResearchBrief,
  gaps: string[],
) {
  const base = `"${brief.targetBuyer}" "${brief.workflowChanged}"`;
  const angle: Record<FullValidationConditionalTrigger, string> = {
    regulatory_legal_exposure: "official regulator law compliance licensing enforcement",
    technical_feasibility: "official technical documentation limits reliability integration dependency benchmark",
    marketplace_liquidity: "marketplace cold start liquidity supply demand fill rate disintermediation",
    geographic_differences: `"${brief.geography}" local regulation pricing adoption channel`,
    segment_disagreement: "buyer segment comparison different needs frequency budget objections",
    missing_pricing_wtp: "official pricing paid pilot procurement contract budget purchase renewal",
    source_concentration: "independent buyer interview industry association government dataset",
    unresolved_contradictions: "failed abandoned low priority switching resistance free workaround",
    coverage_repair: gaps.join(" "),
  };
  return `${base} ${angle[trigger]}`;
}

function hasPackEvidence(sources: RetrievedSource[], pack: FullValidationPackKey) {
  return sources.some((source) => source.queryFamily === pack);
}

function segmentDisagreement(sources: RetrievedSource[]) {
  const segmentMentions = sources.filter((source) =>
    source.queryFamily === "full_buyer_problem" &&
    /\b(?:enterprise|small business|smb|consumer|freelancer|agency|local)\b/i.test(source.text)
  );
  return new Set(segmentMentions.map((source) =>
    source.text.match(/\b(?:enterprise|small business|smb|consumer|freelancer|agency|local)\b/i)?.[0].toLowerCase()
  ).filter(Boolean)).size > 1;
}

function hasPrice(value: string) {
  return /(?:[$€£₹]\s?\d|\d\s?(?:USD|EUR|GBP|INR))/.test(value);
}

function independenceGroup(source: RetrievedSource) {
  const normalized = source.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const claim = normalized.split(" ").slice(0, 60).join(" ");
  // Independence is claim-origin based, not URL based. Syndicated or copied
  // pages with the same underlying claim therefore remain one group.
  return simpleHash(claim);
}

function concentration(values: string[]) {
  if (!values.length) return 0;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return Math.max(...counts.values()) / values.length;
}

function canonicalDomain(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
