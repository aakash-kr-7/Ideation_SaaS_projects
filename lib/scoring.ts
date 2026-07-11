import { CriterionScores, EngineVerdict, OpportunityScorecard, ScoringCriterion, ScoringWeights } from "./types";

export const scoringCriteria: Array<{ key: ScoringCriterion; label: string; description: string; risk?: boolean }> = [
  { key: "painSeverity", label: "Pain severity", description: "How costly or frustrating is the problem today?" },
  { key: "purchaseUrgency", label: "Purchase urgency", description: "How soon does the buyer need to act?" },
  { key: "willingnessToPay", label: "Willingness to pay", description: "Is budget already attached to this problem?" },
  { key: "buyerReachability", label: "Buyer reachability", description: "Can the first buyers be found directly?" },
  { key: "mvpSpeed", label: "MVP speed", description: "Can a valuable first version ship quickly?" },
  { key: "competitionGap", label: "Competition gap", description: "Is there a focused wedge competitors leave open?" },
  { key: "retentionPotential", label: "Retention potential", description: "Does it recur in a durable workflow?" },
  { key: "platformDependencyRisk", label: "Platform dependency risk", description: "How exposed is the idea to a platform owner?", risk: true },
  { key: "regulatoryRisk", label: "Regulatory risk", description: "How much regulatory burden must be cleared?", risk: true },
  { key: "founderFit", label: "Founder fit", description: "Do you have meaningful access or expertise?" },
  { key: "distributionClarity", label: "Distribution clarity", description: "Is there a believable path to demand?" },
  { key: "speedToFirstRevenue", label: "Speed to first revenue", description: "How quickly can a buyer pay?" },
];

export const defaultWeights: ScoringWeights = { painSeverity: 12, purchaseUrgency: 10, willingnessToPay: 11, buyerReachability: 8, mvpSpeed: 8, competitionGap: 8, retentionPotential: 9, platformDependencyRisk: 7, regulatoryRisk: 5, founderFit: 7, distributionClarity: 8, speedToFirstRevenue: 7 };

export const weightPresets: Record<string, ScoringWeights> = {
  "Fast Revenue": { ...defaultWeights, willingnessToPay: 15, purchaseUrgency: 13, speedToFirstRevenue: 15, buyerReachability: 10, retentionPotential: 6, regulatoryRisk: 4 },
  "Low Build Risk": { ...defaultWeights, mvpSpeed: 15, platformDependencyRisk: 12, regulatoryRisk: 10, competitionGap: 9, painSeverity: 10 },
  "B2B Recurring Revenue": { ...defaultWeights, retentionPotential: 15, willingnessToPay: 14, painSeverity: 13, purchaseUrgency: 11, buyerReachability: 6 },
  "D2C Viral Potential": { ...defaultWeights, distributionClarity: 15, buyerReachability: 13, mvpSpeed: 10, speedToFirstRevenue: 9, retentionPotential: 6 },
  "Solo Builder Friendly": { ...defaultWeights, mvpSpeed: 15, founderFit: 12, platformDependencyRisk: 10, regulatoryRisk: 10, buyerReachability: 10 },
};

export function normalizeWeights(weights: Partial<ScoringWeights>): ScoringWeights {
  const merged = { ...defaultWeights, ...weights };
  const total = Object.values(merged).reduce((sum, weight) => sum + Math.max(0, weight), 0) || 1;
  return Object.fromEntries(Object.entries(merged).map(([key, weight]) => [key, Number((Math.max(0, weight) / total * 100).toFixed(2))])) as ScoringWeights;
}

export function calculateWeightedScore(scores: CriterionScores, weights: Partial<ScoringWeights> = defaultWeights): number {
  const normalized = normalizeWeights(weights);
  const weighted = scoringCriteria.reduce((total, criterion) => {
    const raw = Math.min(100, Math.max(0, scores[criterion.key] ?? 0));
    const effective = criterion.risk ? 100 - raw : raw;
    return total + effective * normalized[criterion.key] / 100;
  }, 0);
  return Math.round(weighted * 10) / 10;
}

export function getVerdictFromScore(score: number): EngineVerdict { if (score >= 85) return "Build Now"; if (score >= 70) return "Validate First"; if (score >= 55) return "Niche Down"; if (score >= 40) return "Weak Signal"; return "Avoid"; }

export function calculateConfidenceScore(card: Pick<OpportunityScorecard, "evidenceRefs" | "scores">): number {
  const references = Object.values(card.evidenceRefs).reduce((sum, refs) => sum + (refs?.length ?? 0), 0);
  const coverage = Object.keys(card.evidenceRefs).length / scoringCriteria.length;
  const scoreCompleteness = Object.values(card.scores).filter(v => Number.isFinite(v)).length / scoringCriteria.length;
  return Math.min(100, Math.round((Math.min(references / 18, 1) * .55 + coverage * .25 + scoreCompleteness * .2) * 100));
}

export function rankOpportunities<T extends { scorecard: OpportunityScorecard }>(opportunities: T[]): T[] { return [...opportunities].sort((a, b) => b.scorecard.total - a.scorecard.total); }
export function compareOpportunities<T extends { id: string; name: string; scorecard: OpportunityScorecard }>(opportunities: T[]) { return opportunities.slice(0, 4).map(opportunity => ({ id: opportunity.id, name: opportunity.name, score: opportunity.scorecard.total, confidence: opportunity.scorecard.confidence, verdict: opportunity.scorecard.verdict, strongest: rankCriteria(opportunity.scorecard.scores, false)[0], weakest: rankCriteria(opportunity.scorecard.scores, true)[0] })); }
function rankCriteria(scores: CriterionScores, lowest: boolean) { return [...scoringCriteria].sort((a, b) => { const aValue = a.risk ? 100 - scores[a.key] : scores[a.key]; const bValue = b.risk ? 100 - scores[b.key] : scores[b.key]; return lowest ? aValue - bValue : bValue - aValue; }); }

// Legacy exports retained while the original dashboard transitions to the new report engine.
export const scoreLabels = { pain: "Pain intensity", urgency: "Purchase urgency", willingnessToPay: "Willingness to pay", reachability: "Buyer reachability", competition: "Competitive whitespace", complexity: "MVP feasibility", platformRisk: "Platform independence", founderFit: "Founder advantage" };
export function calculateScore(score: Record<string, number>): number { return Math.round(Object.values(score).reduce((sum, value) => sum + value, 0) / Object.values(score).length * 10); }
export function getVerdict(score: number) { return score >= 75 ? "Build now" as const : score >= 52 ? "Validate first" as const : "Avoid for now" as const; }
