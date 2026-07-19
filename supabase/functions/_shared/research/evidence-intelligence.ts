/** Run-scoped evidence intelligence. Pure functions keep graph, confidence, reports and charts code-owned. */
export type ConfidenceBand = "High" | "Moderate" | "Low" | "Insufficient";
export interface EvidenceLike { id: string; source_id?: string | null; source_domain?: string | null; source_tier?: number | null; snippet: string; title?: string; signal_type: string; strength?: string; pain_point?: string | null; named_entities?: string[] | null; disconfirming?: boolean; research_pass?: number; created_at?: string; }
export interface EvidenceCluster { key: string; kind: string; representativeClaim: string; supportingEvidenceIds: string[]; contradictingEvidenceIds: string[]; independentSourceCount: number; independentDomainCount: number; tierDistribution: Record<string, number>; dateRange: { earliest?: string; latest?: string }; confidence: number; unresolvedDisagreement: boolean; }
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function normalizeCurrency(value: string) { const match = value.match(/([$€£₹])\s?([\d,.]+)/); if (!match) return null; return { amount: Number(match[2].replace(/,/g, "")), currency: ({ "$": "USD", "€": "EUR", "£": "GBP", "₹": "INR" } as Record<string, string>)[match[1]] }; }
export function normalizeBillingPeriod(value: string) { return /annual|year/i.test(value) ? "year" : /month|monthly/i.test(value) ? "month" : /week/i.test(value) ? "week" : "unknown"; }
export function normalizeEntity(value: string) { return normalize(value).replace(/\b(inc|llc|ltd|company|app)\b/g, "").trim(); }
export function claimKey(e: EvidenceLike) { return normalize(e.pain_point || e.title || e.snippet.slice(0, 100)) || "unclassified"; }
export function clusterEvidence(evidence: EvidenceLike[]): EvidenceCluster[] {
  const groups = new Map<string, EvidenceLike[]>();
  for (const item of evidence.filter((e) => e.id)) { const key = `${item.signal_type}:${claimKey(item)}`; groups.set(key, [...(groups.get(key) || []), item]); }
  return [...groups.entries()].map(([key, items]) => {
    const supporting = items.filter((i) => !i.disconfirming), contradicting = items.filter((i) => i.disconfirming);
    const sources = new Set(items.map((i) => i.source_id).filter(Boolean)), domains = new Set(items.map((i) => i.source_domain).filter(Boolean));
    const tiers = items.reduce((a, i) => ({ ...a, [`tier_${i.source_tier || 3}`]: (a[`tier_${i.source_tier || 3}`] || 0) + 1 }), {} as Record<string, number>);
    const dates = items.map((i) => i.created_at).filter(Boolean).sort() as string[];
    const quality = items.reduce((sum, i) => sum + (5 - (i.source_tier || 3)) / 4, 0) / items.length;
    return { key, kind: items[0].signal_type, representativeClaim: supporting[0]?.snippet || items[0].snippet, supportingEvidenceIds: supporting.map((i) => i.id), contradictingEvidenceIds: contradicting.map((i) => i.id), independentSourceCount: sources.size, independentDomainCount: domains.size, tierDistribution: tiers, dateRange: { earliest: dates[0], latest: dates.at(-1) }, confidence: Number((quality * .5 + Math.min(1, domains.size / 3) * .5).toFixed(2)), unresolvedDisagreement: supporting.length > 0 && contradicting.length > 0 };
  });
}
export function evidenceConfidence(evidence: EvidenceLike[], clusters = clusterEvidence(evidence)) {
  const usable = evidence.length; if (!usable) return { band: "Insufficient" as ConfidenceBand, score: 0, reasons: ["No attributable evidence was extracted."] };
  const authority = evidence.reduce((a, e) => a + (5 - (e.source_tier || 3)) / 4, 0) / usable;
  const independent = Math.min(1, new Set(evidence.map((e) => e.source_domain).filter(Boolean)).size / 6);
  const directness = evidence.filter((e) => /\$|price|manual|hours|customer|revenue|failed/i.test(e.snippet)).length / usable;
  const contradiction = clusters.filter((c) => c.unresolvedDisagreement).length / Math.max(1, clusters.length);
  const score = authority * .3 + independent * .25 + directness * .2 + Math.min(1, usable / 12) * .2 + (1 - contradiction) * .05;
  const band: ConfidenceBand = score >= .75 ? "High" : score >= .5 ? "Moderate" : score >= .3 ? "Low" : "Insufficient";
  const reasons = [`${new Set(evidence.map((e) => e.source_domain).filter(Boolean)).size} independent domains`, `${clusters.filter((c) => c.unresolvedDisagreement).length} unresolved evidence disagreements`, `average source authority ${(authority * 100).toFixed(0)}%`];
  return { band, score: Number(score.toFixed(2)), reasons };
}
export function buildSpecialistPack(name: string, clusters: EvidenceCluster[], gaps: string[]) {
  const types: Record<string, string[]> = { demand: ["Pain", "Demand"], competition: ["Pricing"], market: ["Demand"], pricing: ["Pricing"], risk: ["Risk"], gtm: ["Demand", "Pain"] };
  const relevant = clusters.filter((c) => (types[name] || []).includes(c.kind));
  return { specialist: name, clusters: relevant, strongestSupportingEvidenceIds: relevant.flatMap((c) => c.supportingEvidenceIds).slice(0, 12), strongestContradictingEvidenceIds: relevant.flatMap((c) => c.contradictingEvidenceIds).slice(0, 12), unresolvedDisputes: relevant.filter((c) => c.unresolvedDisagreement).map((c) => c.key), evidenceGaps: gaps };
}
export function reportCompleteness(mode: "quick_scan" | "full_validation", input: { evidenceCount: number; confidenceBand: ConfidenceBand; hasPositive: boolean; hasNegative: boolean; hasPricing: boolean; hasCompetitor: boolean; citationsValid: boolean; }) {
  const required = mode === "quick_scan" ? ["idea summary", "score", "verdict", "confidence", "problem", "demand", "competitor", "pricing", "positive", "negative", "risks", "actions", "citations", "methodology"] : ["executive", "problem", "demand", "segment", "alternatives", "competition", "pricing", "market", "wtp", "mvp", "gtm", "risks", "adversarial", "confidence", "gaps", "methodology", "sources", "exports"];
  const missing = [ ...(input.evidenceCount ? [] : ["evidence"]), ...(input.hasPositive ? [] : ["positive evidence"]), ...(input.hasNegative ? [] : ["contradictory evidence"]), ...(input.hasPricing ? [] : ["pricing or willingness-to-pay evidence"]), ...(input.hasCompetitor ? [] : ["competitor evidence"]), ...(input.citationsValid ? [] : ["valid citations"]) ];
  return { complete: missing.length === 0 && input.confidenceBand !== "Insufficient", required, missing };
}
