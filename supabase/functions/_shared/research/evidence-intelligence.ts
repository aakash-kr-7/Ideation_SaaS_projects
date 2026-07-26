export type ConfidenceBand = "High" | "Moderate" | "Low" | "Insufficient";
export interface EvidenceLike {
  id: string;
  source_id?: string | null;
  source_domain?: string | null;
  source_tier?: number | null;
  source_class?: string | null;
  snippet: string;
  title?: string;
  signal_type: string;
  strength?: string;
  pain_point?: string | null;
  disconfirming?: boolean;
  created_at?: string;
  relevance_score?: number | null;
  relevance_class?: string | null;
  matched_brief_dimensions?: string[] | null;
  acceptance_decision?: string | null;
  evidence_topic?: string | null;
  verified?: boolean | null;
  numeric_value?: number | null;
  structured_value?: Record<string, unknown> | null;
  relevant_excerpt?: string | null;
}
export interface EvidenceCluster { key: string; kind: string; representativeClaim: string; supportingEvidenceIds: string[]; contradictingEvidenceIds: string[]; independentSourceCount: number; independentDomainCount: number; tierDistribution: Record<string, number>; dateRange: { earliest?: string; latest?: string }; confidence: number; unresolvedDisagreement: boolean; }
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function normalizeCurrency(value: string) { const match = value.match(/([$€£₹])\s?([\d,.]+)/); if (!match) return null; return { amount: Number(match[2].replace(/,/g, "")), currency: ({ "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR" } as Record<string, string>)[match[1]] }; }
export function normalizeBillingPeriod(value: string) { return /annual|year/i.test(value) ? "year" : /month|monthly/i.test(value) ? "month" : /week/i.test(value) ? "week" : "unknown"; }
export function normalizeEntity(value: string) { return normalize(value).replace(/\b(inc|llc|ltd|company|app)\b/g, "").trim(); }
export function claimKey(evidence: EvidenceLike) { return normalize(evidence.pain_point || evidence.title || evidence.snippet.slice(0, 100)) || "unclassified"; }
export function clusterEvidence(evidence: EvidenceLike[]): EvidenceCluster[] {
  const groups = new Map<string, EvidenceLike[]>();
  for (const item of evidence.filter((entry) => entry.id)) { const key = `${item.signal_type}:${claimKey(item)}`; groups.set(key, [...(groups.get(key) || []), item]); }
  return [...groups.entries()].map(([key, items]) => {
    const supporting = items.filter((item) => !item.disconfirming); const contradicting = items.filter((item) => item.disconfirming);
    const sources = new Set(items.map((item) => item.source_id).filter(Boolean)); const domains = new Set(items.map((item) => item.source_domain).filter(Boolean));
    const tiers = items.reduce((result, item) => ({ ...result, [`tier_${item.source_tier || 3}`]: (result[`tier_${item.source_tier || 3}`] || 0) + 1 }), {} as Record<string, number>);
    const dates = items.map((item) => item.created_at).filter(Boolean).sort() as string[];
    const quality = items.reduce((sum, item) => sum + (5 - (item.source_tier || 3)) / 4, 0) / items.length;
    return { key, kind: items[0].signal_type, representativeClaim: supporting[0]?.snippet || items[0].snippet, supportingEvidenceIds: supporting.map((item) => item.id), contradictingEvidenceIds: contradicting.map((item) => item.id), independentSourceCount: sources.size, independentDomainCount: domains.size, tierDistribution: tiers, dateRange: { earliest: dates[0], latest: dates.at(-1) }, confidence: Number((quality * 0.5 + Math.min(1, domains.size / 3) * 0.5).toFixed(2)), unresolvedDisagreement: supporting.length > 0 && contradicting.length > 0 };
  });
}
export function evidenceConfidence(
  evidence: EvidenceLike[],
  clusters = clusterEvidence(evidence),
  explicitUnresolvedContradictions = 0,
  explicitContradictions = explicitUnresolvedContradictions,
) {
  const core = evidence.filter((item) => !item.acceptance_decision || item.acceptance_decision === "accepted_core");
  const usable = core.length;
  if (!usable) return {
    band: "Insufficient" as ConfidenceBand,
    score: 0,
    reasons: ["No attributable, semantically accepted evidence was extracted."],
    deductions: ["No grounded research supports the report."],
  };
  const authority = core.reduce((sum, item) => sum + (5 - (item.source_tier || 3)) / 4, 0) / usable;
  const domainCount = new Set(core.map((item) => item.source_domain).filter(Boolean)).size;
  const independent = Math.min(1, domainCount / 6);
  const directness = core.filter((item) => /\$|price|manual|hours|customer|client|sign-off|approval|dispute|failed/i.test(item.snippet)).length / usable;
  const relevance = core.reduce((sum, item) => sum + Number(item.relevance_score ?? 0.55), 0) / usable;
  const buyerSpecificity = core.filter((item) => item.matched_brief_dimensions?.includes("target_buyer")).length / usable;
  const familyCount = new Set(core.map((item) => item.evidence_topic).filter(Boolean)).size;
  const primaryCount = core.filter((item) => Number(item.source_tier || 4) === 1).length;
  const primaryCoverage = primaryCount / usable;
  const buyerPaymentEvidence = core.filter((item) => item.evidence_topic === "willingness_to_pay").length;
  const directlyRelevant = core.filter((item) => item.relevance_class === "directly_relevant").length / usable;
  const extractionIntegrity = core.filter((item) =>
    item.verified !== false
    && Boolean(item.source_id)
    && Boolean(item.relevant_excerpt || item.snippet)
    && (item.numeric_value == null || Boolean(item.structured_value))
  ).length / usable;
  const clusteredContradictions = clusters.filter((cluster) => cluster.unresolvedDisagreement).length;
  const contradiction = (clusteredContradictions + explicitUnresolvedContradictions) / Math.max(1, clusters.length + explicitUnresolvedContradictions);
  const contradictionQuality = Math.min(1, (explicitContradictions + clusteredContradictions) / 2);
  let score = authority * 0.16 + independent * 0.14 + directness * 0.1 + relevance * 0.13
    + buyerSpecificity * 0.08 + Math.min(1, familyCount / 9) * 0.12 + Math.min(1, primaryCoverage / 0.25) * 0.09
    + Math.min(1, buyerPaymentEvidence) * 0.06 + directlyRelevant * 0.05 + extractionIntegrity * 0.04
    + contradictionQuality * 0.03;
  const deductions: string[] = [];
  const tierCounts = core.reduce((result, item) => {
    const tier = Number(item.source_tier || 3);
    result[tier] = (result[tier] || 0) + 1;
    return result;
  }, {} as Record<number, number>);
  if (!core.some((item) => item.source_tier === 1)) {
    deductions.push("No Tier 1/primary page supports the dossier.");
    score = Math.min(score, 0.62);
  }
  if (primaryCoverage < 0.15) {
    deductions.push(`Primary-source coverage is weak (${primaryCount}/${usable} accepted items).`);
    score = Math.min(score, 0.59);
  }
  if (familyCount < 7) {
    deductions.push(`Only ${familyCount}/11 Full Validation evidence families are represented.`);
    score = Math.min(score, 0.59);
  }
  if (!buyerPaymentEvidence) {
    deductions.push("No direct buyer-payment, deposit, paid-pilot, or purchase-commitment evidence was accepted.");
    score = Math.min(score, 0.59);
  }
  if (explicitContradictions + clusteredContradictions === 0) {
    deductions.push("No strong proposition-specific contradictory evidence was found.");
    score = Math.min(score, 0.59);
  }
  if (core.every((item) => Number(item.source_tier || 3) >= 3)) {
    deductions.push("All accepted evidence is Tier 3; no official, primary, or stronger applicable page was accepted.");
    score = Math.min(score, usable >= 4 ? 0.39 : 0.24);
  }
  if (buyerSpecificity < 0.25) {
    deductions.push("Buyer specificity is weak across accepted evidence.");
    score = Math.min(score, 0.49);
  }
  if (contradiction > 0) {
    deductions.push(`${clusteredContradictions + explicitUnresolvedContradictions} major proposition-specific contradiction(s) remain unresolved.`);
    score = Math.min(score, 0.59);
  }
  if (usable < 4) {
    deductions.push("Fewer than four usable evidence items were accepted.");
    score = Math.min(score, 0.29);
  }
  if (directlyRelevant < 0.5) {
    deductions.push("Fewer than half of accepted items are directly relevant to the canonical proposition.");
    score = Math.min(score, 0.49);
  }
  if (extractionIntegrity < 1) {
    deductions.push(`Extraction integrity passed for ${Math.round(extractionIntegrity * 100)}% of accepted evidence.`);
    score = Math.min(score, 0.59);
  }
  score = Math.max(0, Math.min(1, score));
  const band: ConfidenceBand = score >= 0.75 ? "High" : score >= 0.5 ? "Moderate" : score >= 0.3 ? "Low" : "Insufficient";
  return {
    band,
    score: Number(score.toFixed(2)),
    reasons: [
      `${domainCount} independent domains`,
      `${usable} semantically accepted evidence items`,
      `${clusteredContradictions + explicitUnresolvedContradictions} unresolved evidence disagreements`,
      `average source authority ${(authority * 100).toFixed(0)}%`,
      `average semantic relevance ${(relevance * 100).toFixed(0)}%`,
      `buyer-specific evidence ${(buyerSpecificity * 100).toFixed(0)}%`,
      `${familyCount}/11 required evidence families represented`,
      `${primaryCount}/${usable} accepted items are primary evidence`,
      `${buyerPaymentEvidence} direct buyer/payment evidence items`,
      `${explicitContradictions + clusteredContradictions} proposition-specific contradiction pairs`,
      `direct relevance ${(directlyRelevant * 100).toFixed(0)}%`,
      `extraction integrity ${(extractionIntegrity * 100).toFixed(0)}%`,
      `tier distribution ${JSON.stringify(tierCounts)}`,
    ],
    deductions,
  };
}
export function reportCompleteness(mode: "quick_scan" | "full_validation", input: { evidenceCount: number; confidenceBand: ConfidenceBand; hasPositive: boolean; hasNegative: boolean; hasPricing: boolean; hasCompetitor: boolean; citationsValid: boolean; evidenceTopics?: string[]; }) {
  const missing = [...(input.evidenceCount ? [] : ["evidence"]), ...(input.hasPositive ? [] : ["positive evidence"]), ...(input.hasNegative ? [] : ["contradictory evidence"]), ...(input.hasPricing ? [] : ["pricing or willingness-to-pay evidence"]), ...(input.hasCompetitor ? [] : ["competitor evidence"]), ...(input.citationsValid ? [] : ["valid citations"])];
  const topics = new Set(input.evidenceTopics || []);
  const expected = mode === "full_validation"
    ? ["customer_pain", "behavior_demand", "segments", "alternatives", "competitors", "pricing", "willingness_to_pay", "market_context", "gtm", "risks", "contradiction"]
    : ["customer_pain", "behavior_demand", "competitors", "pricing", "contradiction"];
  const topicGaps = expected.filter((topic) => !topics.has(topic));
  missing.push(...topicGaps.map((topic) => `evidence family: ${topic.replaceAll("_", " ")}`));
  const structuralChecks = [
    input.evidenceCount > 0,
    input.hasPositive,
    input.hasNegative,
    input.hasPricing,
    input.hasCompetitor,
    input.citationsValid,
  ].filter(Boolean).length;
  const score = Math.round(((structuralChecks + (expected.length - topicGaps.length)) / (6 + expected.length)) * 100);
  return { complete: missing.length === 0 && input.confidenceBand !== "Insufficient", missing: [...new Set(missing)], score, reasons: [`${expected.length - topicGaps.length}/${expected.length} required evidence families covered`, `${structuralChecks}/6 structural report checks passed`] };
}

export function semanticPublicationQuality(input: {
  mode: "quick_scan" | "full_validation";
  evidence: EvidenceLike[];
  competitors?: Array<{ classification?: string; evidence_ids?: string[] }>;
  contradictions?: Array<{ supporting_evidence_ids?: string[]; challenging_evidence_ids?: string[] }>;
  specialists?: Array<{ payload?: { evidence_ids?: string[]; confidence?: string } }>;
  charts?: Array<{ supportingEvidenceIds?: string[]; supporting_evidence_ids?: string[] }>;
  numericValidations?: Array<{ status?: string; claim_type?: string }>;
}) {
  const accepted = input.evidence.filter((item) =>
    (!item.acceptance_decision || item.acceptance_decision === "accepted_core") && item.source_tier !== 4
  );
  const families = new Set(accepted.map((item) => item.evidence_topic).filter(Boolean));
  const domains = new Set(accepted.map((item) => item.source_domain).filter(Boolean));
  const contradictions = input.contradictions || [];
  const meaningfulContradictions = contradictions.filter((item) =>
    (item.supporting_evidence_ids || []).length > 0 && (item.challenging_evidence_ids || []).length > 0
  );
  const directCompetitors = (input.competitors || []).filter((item) =>
    item.classification === "direct" && (item.evidence_ids || []).length > 0
  );
  const verifiedPrices = (input.numericValidations || []).filter((item) =>
    item.status === "verified" && ["price", "price_range"].includes(String(item.claim_type))
  );
  const buyerPayment = accepted.filter((item) => item.evidence_topic === "willingness_to_pay");
  const supportedCharts = (input.charts || []).filter((item) =>
    (item.supportingEvidenceIds || item.supporting_evidence_ids || []).length > 0
  );
  const specialistsWithEvidence = (input.specialists || []).filter((item) =>
    (item.payload?.evidence_ids || []).length > 0 || item.payload?.confidence === "Insufficient"
  );
  const gaps = input.mode === "full_validation" ? [
    ...(families.size >= 7 ? [] : [`Only ${families.size}/11 required evidence families are covered.`]),
    ...(domains.size >= 6 ? [] : [`Only ${domains.size} independent cited domains are represented.`]),
    ...(accepted.some((item) => item.source_tier === 1) ? [] : ["No authoritative primary evidence was accepted."]),
    ...(directCompetitors.length ? [] : ["No evidence-justified direct competitor was established."]),
    ...(verifiedPrices.length ? [] : ["No deterministic verified price claim was retained."]),
    ...(buyerPayment.length ? [] : ["No buyer/payment evidence was accepted."]),
    ...(meaningfulContradictions.length ? [] : ["No strong proposition-specific contradictory evidence was found"]),
    ...(specialistsWithEvidence.length >= 6 ? [] : [`Only ${specialistsWithEvidence.length}/6 specialist desks are evidence-safe.`]),
    ...(supportedCharts.length >= 4 ? [] : [`Only ${supportedCharts.length} charts have persisted supporting evidence.`]),
  ] : [
    ...(accepted.length ? [] : ["No attributable evidence was accepted."]),
    ...(domains.size >= 2 ? [] : ["Fewer than two independent cited domains are represented."]),
    ...(supportedCharts.length >= 4 ? [] : [`Only ${supportedCharts.length} charts have persisted supporting evidence.`]),
  ];
  return {
    met: gaps.length === 0,
    gaps,
    gapPassPerformed: input.mode === "full_validation",
    publishedWithReducedConfidence: input.mode === "full_validation" && gaps.length > 0,
    dimensions: {
      acceptedEvidence: accepted.length,
      independentDomains: domains.size,
      evidenceFamilies: families.size,
      primaryEvidence: accepted.filter((item) => item.source_tier === 1).length,
      directCompetitors: directCompetitors.length,
      verifiedPrices: verifiedPrices.length,
      buyerPaymentEvidence: buyerPayment.length,
      propositionContradictions: meaningfulContradictions.length,
      evidenceSafeSpecialists: specialistsWithEvidence.length,
      supportedCharts: supportedCharts.length,
    },
  };
}
