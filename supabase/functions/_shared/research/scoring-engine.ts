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
}
export interface ScoringContext {
  evidence: ScoringEvidence[];
  risks: ScoringRisk[];
  competitors: ScoringCompetitor[];
  hasPricingModel: boolean;
  launchStrategyCount: number;
}
export interface WeightRow {
  criterion: string;
  weight: number;
}
export interface FactorResult {
  criterion: Criterion;
  score: number;
  evidenceIds: string[];
  note: string;
}

const STRENGTH = { High: 1, Medium: 0.65, Low: 0.35 } as const;
const clamp = (n: number) =>
  Math.max(0, Math.min(100, Math.round(n * 10) / 10));
const lexicon = (text: string, words: string[]) =>
  words.some((w) => text.toLowerCase().includes(w));
const refs = (items: ScoringEvidence[]) => [...new Set(items.map((e) => e.id))];
function evidenceScore(items: ScoringEvidence[], baseline = 20): number {
  const usable = items.filter((e) => !e.excluded && (e.source_tier ?? 3) < 4);
  if (!usable.length) return baseline;
  const total = usable.reduce((sum, e) => {
    const support = Math.max(1, e.supporting_count ?? 1);
    const contradictions = Math.max(0, e.contradicting_count ?? 0);
    const consistency = support / (support + contradictions);
    const tierWeight = ({ 1: 1, 2: .8, 3: .25, 4: 0 } as const)[e.source_tier ?? 3];
    const independent = Math.min(1.5, 1 + .1 * Math.max(0, (e.independent_source_count ?? 1) - 1));
    return sum + STRENGTH[e.strength] * (e.confidence ?? 0.5) * consistency * tierWeight * independent;
  }, 0);
  return clamp(
    20 + 65 * Math.min(1, total / 3) + 15 * Math.min(1, usable.length / 6),
  );
}

export function computeFactors(ctx: ScoringContext): FactorResult[] {
  const usableEvidence = ctx.evidence.filter((e) => !e.excluded && (e.source_tier ?? 3) < 4);
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
  const explicitGaps = ctx.competitors.filter((c) => c.gap.trim().length >= 12);
  const gapEvidence = [...pain, ...demand].filter((e) =>
    lexicon(`${e.title} ${e.snippet}`, [
      "alternative",
      "missing",
      "expensive",
      "frustrat",
      "complex",
    ])
  );
  const independentSources = Math.max(0, ...demand.map((e) => e.independent_source_count ?? 1));
  const tierOnePricing = pricing.filter((e) => e.source_tier === 1);
  const executionRisks = ctx.risks.filter((r) =>
    r.category === "Execution" && r.severity !== "Low"
  );
  const mk = (
    criterion: Criterion,
    score: number,
    items: ScoringEvidence[],
    note: string,
  ): FactorResult => ({
    criterion,
    score: clamp(score),
    evidenceIds: refs(items),
    note,
  });
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
      evidenceScore(tierOnePricing, tierOnePricing.length ? 25 : 10),
      tierOnePricing,
      tierOnePricing.length ? "Tier 1 willingness-to-pay signals, weighted by independent corroboration." : "No Tier 1 willingness-to-pay evidence; recommendations do not substitute for paid-demand proof.",
    ),
    mk(
      "buyerReachability",
      20 + Math.min(65, demand.length * 5 + independentSources * 10),
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
      65 - ctx.competitors.length * 8 + explicitGaps.length * 10 +
        Math.min(15, gapEvidence.length * 5),
      gapEvidence,
      "Competitive density adjusted by explicit normalized gaps and gap-language evidence.",
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
      25 + Math.min(45, usableEvidence.filter((e) => (e.source_tier ?? 3) <= 2).length * 7),
      usableEvidence,
      "Run-specific evidence access and domain signal coverage; no unsupported founder biography is inferred.",
    ),
    mk(
      "distributionClarity",
      20 + Math.min(65, demand.length * 7 + ctx.launchStrategyCount * 6),
      demand,
      "Demand evidence plus persisted launch-channel specificity.",
    ),
    mk(
      "speedToFirstRevenue",
      (evidenceScore([...tierOnePricing, ...urgent], 10) +
        (tierOnePricing.length ? 10 : 0)) * 0.87,
      [...tierOnePricing, ...urgent],
      "Pricing proof and purchase urgency combined deterministically.",
    ),
  ];
}

export function calculateDeterministicScore(
  factors: FactorResult[],
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
    const effective = factor.criterion === "platformDependencyRisk" ||
        factor.criterion === "regulatoryRisk"
      ? 100 - factor.score
      : factor.score;
    return sum + effective * (weights.get(factor.criterion) ?? 0) / totalWeight;
  }, 0);
  return Math.round(raw * 10) / 10;
}

export function verdictFor(score: number) {
  if (score >= 85) return "Build Now" as const;
  if (score >= 70) return "Validate First" as const;
  if (score >= 55) return "Niche Down" as const;
  if (score >= 40) return "Weak Signal" as const;
  return "Avoid" as const;
}
