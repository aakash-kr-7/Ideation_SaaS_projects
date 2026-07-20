export type ConfidenceBand = "High" | "Moderate" | "Low" | "Insufficient";
export interface EvidenceLike { id: string; source_id?: string | null; source_domain?: string | null; source_tier?: number | null; snippet: string; title?: string; signal_type: string; strength?: string; pain_point?: string | null; disconfirming?: boolean; created_at?: string; }
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
export function evidenceConfidence(evidence: EvidenceLike[], clusters = clusterEvidence(evidence)) {
  const usable = evidence.length; if (!usable) return { band: "Insufficient" as ConfidenceBand, score: 0, reasons: ["No attributable evidence was extracted."] };
  const authority = evidence.reduce((sum, item) => sum + (5 - (item.source_tier || 3)) / 4, 0) / usable;
  const domainCount = new Set(evidence.map((item) => item.source_domain).filter(Boolean)).size;
  const independent = Math.min(1, domainCount / 6); const directness = evidence.filter((item) => /\$|price|manual|hours|customer|revenue|failed/i.test(item.snippet)).length / usable;
  const contradiction = clusters.filter((cluster) => cluster.unresolvedDisagreement).length / Math.max(1, clusters.length);
  const score = authority * 0.3 + independent * 0.25 + directness * 0.2 + Math.min(1, usable / 12) * 0.2 + (1 - contradiction) * 0.05;
  const band: ConfidenceBand = score >= 0.75 ? "High" : score >= 0.5 ? "Moderate" : score >= 0.3 ? "Low" : "Insufficient";
  return { band, score: Number(score.toFixed(2)), reasons: [`${domainCount} independent domains`, `${clusters.filter((cluster) => cluster.unresolvedDisagreement).length} unresolved evidence disagreements`, `average source authority ${(authority * 100).toFixed(0)}%`] };
}
export function reportCompleteness(_mode: "quick_scan" | "full_validation", input: { evidenceCount: number; confidenceBand: ConfidenceBand; hasPositive: boolean; hasNegative: boolean; hasPricing: boolean; hasCompetitor: boolean; citationsValid: boolean; }) {
  const missing = [...(input.evidenceCount ? [] : ["evidence"]), ...(input.hasPositive ? [] : ["positive evidence"]), ...(input.hasNegative ? [] : ["contradictory evidence"]), ...(input.hasPricing ? [] : ["pricing or willingness-to-pay evidence"]), ...(input.hasCompetitor ? [] : ["competitor evidence"]), ...(input.citationsValid ? [] : ["valid citations"])];
  return { complete: missing.length === 0 && input.confidenceBand !== "Insufficient", missing };
}
