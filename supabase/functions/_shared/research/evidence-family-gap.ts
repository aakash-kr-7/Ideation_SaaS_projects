export const FULL_EVIDENCE_TOPICS = [
  "customer_pain", "behavior_demand", "segments", "alternatives", "competitors", "pricing",
  "willingness_to_pay", "market_context", "gtm", "risks", "contradiction",
] as const;

type EvidenceTopic = typeof FULL_EVIDENCE_TOPICS[number];

export type GapSource = {
  sourceId: string;
  url: string;
  title: string;
  sourceTier: number;
  domain: string;
  relevanceScore: number;
  relevanceClass: string;
  matchedBriefDimensions: string[];
  acceptanceDecision: string;
  retrievedText: string;
  queryFamily: string;
};

const TOPIC_FAMILIES: Partial<Record<EvidenceTopic, string[]>> = {
  customer_pain: ["customer_pain"],
  behavior_demand: ["buyer_behavior", "case_studies"],
  segments: ["segments"],
  alternatives: ["alternatives", "reviews_complaints"],
  competitors: ["competitor_official", "documentation"],
  pricing: ["pricing_official"],
  market_context: ["market_regulatory_gtm"],
  gtm: ["market_regulatory_gtm", "case_studies"],
  risks: ["reviews_complaints", "market_regulatory_gtm"],
};

const SIGNAL_BY_TOPIC: Record<string, "Pain" | "Demand" | "Pricing" | "Risk"> = {
  customer_pain: "Pain",
  behavior_demand: "Demand",
  segments: "Demand",
  alternatives: "Risk",
  competitors: "Risk",
  pricing: "Pricing",
  market_context: "Demand",
  gtm: "Demand",
  risks: "Risk",
};

function exactNonNumericExcerpt(text: string) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const candidates = sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 70 && sentence.length <= 520 && !/\d/.test(sentence));
  const anchored = candidates.find((sentence) =>
    /\b(approval|approve|sign[- ]?off|audit trail|decision history|client|customer|agency|service team)\b/i.test(sentence)
  );
  return anchored || candidates[0] || "";
}

/**
 * The model gets one bounded targeted gap pass. This deterministic acceptance
 * step then preserves exact excerpts from already-retrieved, accepted-core
 * pages that the model omitted. It never manufactures willingness-to-pay or
 * contradiction evidence: those require their own stronger semantic tests.
 */
export function materializeAcceptedFamilyGaps(
  sources: GapSource[],
  existingClaims: Array<{ evidenceTopic?: string; sourceId?: string }>,
) {
  const covered = new Set(existingClaims.map((claim) => claim.evidenceTopic).filter(Boolean));
  const usedSources = new Set(existingClaims.map((claim) => claim.sourceId).filter(Boolean));
  const usedDomains = new Set(
    sources.filter((source) => usedSources.has(source.sourceId)).map((source) => source.domain),
  );
  const additions: any[] = [];

  for (const topic of FULL_EVIDENCE_TOPICS) {
    if (covered.has(topic) || topic === "willingness_to_pay" || topic === "contradiction") continue;
    const families = TOPIC_FAMILIES[topic] || [];
    const ranked = sources
      .filter((source) =>
        source.acceptanceDecision === "accepted_core" &&
        ["directly_relevant", "contextually_relevant"].includes(source.relevanceClass) &&
        families.includes(source.queryFamily) &&
        !usedSources.has(source.sourceId)
      )
      .sort((left, right) =>
        Number(usedDomains.has(left.domain)) - Number(usedDomains.has(right.domain)) ||
        left.sourceTier - right.sourceTier ||
        right.relevanceScore - left.relevanceScore
      );
    const selected = ranked
      .map((source) => ({ source, excerpt: exactNonNumericExcerpt(source.retrievedText) }))
      .find((candidate) => candidate.excerpt);
    if (!selected) continue;

    const { source, excerpt } = selected;
    additions.push({
      sourceId: source.sourceId,
      sourceUrl: source.url,
      title: source.title,
      excerpt,
      family: ["customer_pain", "risks"].includes(topic) ? "problem" : "solution",
      signalType: SIGNAL_BY_TOPIC[topic],
      strength: source.sourceTier === 1 ? "High" : source.sourceTier === 2 ? "Medium" : "Low",
      disconfirming: false,
      sourceTier: source.sourceTier,
      numericValue: "",
      evidenceTopic: topic,
      relevanceClassification: source.relevanceClass,
      relevanceScore: source.relevanceScore,
      matchedBriefDimensions: source.matchedBriefDimensions,
      mismatchReasons: [],
    });
    covered.add(topic);
    usedSources.add(source.sourceId);
    usedDomains.add(source.domain);
  }
  return additions;
}
