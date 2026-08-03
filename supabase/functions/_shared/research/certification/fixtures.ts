import type {
  FactorResult,
  ScoringCompetitor,
  ScoringEvidence,
  ScoringRisk,
} from "../scoring-engine.ts";

export type CertificationMode = "quick_scan" | "full_validation";

export interface ReplayFixture {
  id: string;
  title: string;
  mode: CertificationMode;
  provenance: {
    immutableReportVersion: string;
    acceptedEvidenceSnapshot: string;
    providerSnapshot: {
      provider: "sanitized_replay" | "mock";
      recordedAt: string;
      containsSecrets: false;
      containsPersonalData: false;
      response: Record<string, unknown>;
    };
  };
  evidence: ScoringEvidence[];
  risks: ScoringRisk[];
  competitors: ScoringCompetitor[];
  hasPricingModel: boolean;
  launchStrategyCount: number;
  unresolvedContradictionCount?: number;
  founderFitFactor?: FactorResult;
  expected: {
    researchOutcome: "research_completed" | "research_unavailable";
    scoreRange?: [number, number];
    verdictPolarity?: "positive" | "negative";
    concentrated?: boolean;
    missingWtp?: boolean;
    weakFounderFit?: boolean;
    contradiction?: boolean;
    stalePricing?: boolean;
    creditState: "consumed" | "restored";
  };
}

const recordedAt = "2026-07-01T00:00:00.000Z";
const ev = (
  id: string,
  signal_type: ScoringEvidence["signal_type"],
  topic: string,
  text: string,
  domain: string,
  overrides: Partial<ScoringEvidence> = {},
): ScoringEvidence => ({
  id,
  signal_type,
  strength: "High",
  title: text,
  snippet: text,
  source_id: `source:${id}`,
  confidence: 0.9,
  source_tier: 1,
  independent_source_count: 1,
  independent_domain_count: 1,
  evidence_topic: topic,
  canonical_source_id: `canonical:${domain}:${id}`,
  canonical_domain: domain,
  source_family: "synthetic_primary",
  source_authority: 0.9,
  evidence_directness: 0.9,
  semantic_relevance: 0.9,
  independence_key: `group:${domain}`,
  evidence_role: "supporting",
  extraction_confidence: 0.95,
  numeric_validation_state: "verified",
  ...overrides,
});

const provenance = (id: string, response: Record<string, unknown>) => ({
  immutableReportVersion: `immutable-report-version/${id}/v1`,
  acceptedEvidenceSnapshot: `accepted-evidence/${id}/v1`,
  providerSnapshot: {
    provider: "sanitized_replay" as const,
    recordedAt,
    containsSecrets: false as const,
    containsPersonalData: false as const,
    response,
  },
});

const founder = (score: number, note: string): FactorResult => ({
  criterion: "founderFit",
  score,
  rawScore: score,
  evidenceCoefficient: 1,
  effectiveScore: score,
  evidenceState: "EVIDENCED",
  evidenceIds: [],
  supportingEvidenceIds: [],
  challengingEvidenceIds: [],
  confidenceDeductions: [],
  unresolvedGaps: [],
  note,
});

const strongEvidence = (prefix: string) => [
  ev(`${prefix}-pain-a`, "Pain", "customer_pain", "Teams lose hours every week to this expensive manual workflow.", "buyers-a.test"),
  ev(`${prefix}-pain-b`, "Pain", "customer_pain", "The recurring workflow causes costly delays and urgent rework.", "buyers-b.test"),
  ev(`${prefix}-demand-a`, "Demand", "behavioral_demand", "Buyer teams actively seek an alternative for the daily workflow.", "demand-a.test"),
  ev(`${prefix}-demand-b`, "Demand", "reachability", "A trade directory identifies reachable budget owners.", "demand-b.test"),
  ev(`${prefix}-wtp-a`, "Pricing", "willingness_to_pay", "Buyer teams signed a paid pilot purchase commitment.", "payments-a.test"),
  ev(`${prefix}-wtp-b`, "Pricing", "willingness_to_pay", "Customers renewed a paid subscription after the pilot.", "payments-b.test"),
  ev(`${prefix}-gap-a`, "Demand", "competitors", "Buyers report the current alternative is expensive and missing workflow controls.", "competitor-gap.test"),
];

export const REPLAY_FIXTURES: ReplayFixture[] = [
  {
    id: "strong-multi-source",
    title: "Strong multi-source opportunity",
    mode: "full_validation",
    provenance: provenance("strong-multi-source", { packs: 6, disposition: "accepted", sanitized: true }),
    evidence: strongEvidence("sms"),
    risks: [],
    competitors: [{ id: "c1", gap: "Missing focused workflow controls", strength: "Medium", pricing: "$49 verified", classification: "direct" }],
    hasPricingModel: true,
    launchStrategyCount: 3,
    founderFitFactor: founder(78, "Confirmed domain access and relevant delivery experience."),
    expected: { researchOutcome: "research_completed", scoreRange: [55, 90], verdictPolarity: "positive", creditState: "consumed" },
  },
  {
    id: "strong-concentrated",
    title: "Strong raw opportunity with concentrated sources",
    mode: "quick_scan",
    provenance: provenance("strong-concentrated", { packs: 3, disposition: "accepted_with_concentration_warning", sanitized: true }),
    evidence: strongEvidence("sc").map((item) => ({ ...item, canonical_domain: "single-domain.test", independence_key: "group:single-domain" })),
    risks: [],
    competitors: [{ id: "c1", gap: "A narrow workflow gap is described", strength: "Medium", pricing: "$49 verified", classification: "direct" }],
    hasPricingModel: true,
    launchStrategyCount: 2,
    expected: { researchOutcome: "research_completed", scoreRange: [45, 78], concentrated: true, creditState: "consumed" },
  },
  {
    id: "demand-without-wtp",
    title: "Demand evidence without WTP",
    mode: "quick_scan",
    provenance: provenance("demand-without-wtp", { packs: 3, wtp: "not_found", sanitized: true }),
    evidence: strongEvidence("dww").filter((item) => item.evidence_topic !== "willingness_to_pay"),
    risks: [],
    competitors: [],
    hasPricingModel: false,
    launchStrategyCount: 2,
    expected: { researchOutcome: "research_completed", scoreRange: [42, 75], missingWtp: true, creditState: "consumed" },
  },
  {
    id: "poor-founder-fit",
    title: "Good market with poor founder fit",
    mode: "full_validation",
    provenance: provenance("poor-founder-fit", { packs: 6, founderInputs: "confirmed_no_access", sanitized: true }),
    evidence: strongEvidence("pff"),
    risks: [],
    competitors: [],
    hasPricingModel: true,
    launchStrategyCount: 3,
    founderFitFactor: founder(18, "Confirmed founder inputs show no buyer access or relevant operating experience."),
    expected: { researchOutcome: "research_completed", scoreRange: [48, 82], weakFounderFit: true, creditState: "consumed" },
  },
  {
    id: "adversarial-contradiction",
    title: "Meaningful adversarial contradiction",
    mode: "full_validation",
    provenance: provenance("adversarial-contradiction", { packs: 6, adversarial: "material_conflict", sanitized: true }),
    evidence: [
      ...strongEvidence("ac"),
      ev("ac-challenge", "Demand", "behavioral_demand", "Independent buyers report the existing free workflow is sufficient and switching is unnecessary.", "challenge.test", {
        evidence_role: "challenging",
        disconfirming: true,
        associated_factor_ids: ["buyerReachability", "distributionClarity"],
      }),
    ],
    risks: [],
    competitors: [],
    hasPricingModel: true,
    launchStrategyCount: 2,
    unresolvedContradictionCount: 1,
    expected: { researchOutcome: "research_completed", scoreRange: [42, 80], contradiction: true, creditState: "consumed" },
  },
  {
    id: "stale-competitor-pricing",
    title: "Stale or changed competitor pricing",
    mode: "full_validation",
    provenance: provenance("stale-competitor-pricing", { packs: 6, pricingPage: "changed_since_capture", sanitized: true }),
    evidence: [
      ...strongEvidence("scp").filter((item) => item.signal_type !== "Pricing"),
      ev("scp-price", "Pricing", "competitors", "Archived competitor plan listed a price that is no longer present.", "official-price.test", {
        numeric_validation_state: "flagged",
        model_classification_metadata: { freshness: "stale", pricingVerification: "changed" },
      }),
    ],
    risks: [],
    competitors: [{ id: "c1", gap: "Pricing requires reverification", strength: "Medium", pricing: "Unavailable — changed", classification: "direct" }],
    hasPricingModel: false,
    launchStrategyCount: 2,
    expected: { researchOutcome: "research_completed", scoreRange: [40, 75], stalePricing: true, missingWtp: true, creditState: "consumed" },
  },
  {
    id: "provider-unavailable",
    title: "Research provider unavailable",
    mode: "quick_scan",
    provenance: {
      immutableReportVersion: "none",
      acceptedEvidenceSnapshot: "none",
      providerSnapshot: {
        provider: "mock",
        recordedAt,
        containsSecrets: false,
        containsPersonalData: false,
        response: { error: "provider_unavailable", retryable: true },
      },
    },
    evidence: [],
    risks: [],
    competitors: [],
    hasPricingModel: false,
    launchStrategyCount: 0,
    expected: { researchOutcome: "research_unavailable", creditState: "restored" },
  },
  {
    id: "completed-weak-research",
    title: "Weak idea after successfully completed research",
    mode: "full_validation",
    provenance: provenance("completed-weak-research", { packs: 6, disposition: "completed_low_signal", sanitized: true }),
    evidence: [
      ev("weak-demand-a", "Demand", "behavioral_demand", "Buyers say the workflow is occasional and the free alternative is sufficient.", "weak-a.test", { strength: "Low", confidence: 0.55 }),
      ev("weak-demand-b", "Demand", "behavioral_demand", "Independent buyers report no urgency and no budget for change.", "weak-b.test", { strength: "Low", confidence: 0.55 }),
      ev("weak-risk-a", "Risk", "platform_dependency", "The product requires a fragile vendor API dependency.", "risk-a.test", { strength: "High" }),
      ev("weak-risk-b", "Risk", "regulatory", "The workflow has material privacy compliance and licensing risk.", "risk-b.test", { strength: "High" }),
    ],
    risks: [
      { id: "r1", category: "Execution", severity: "High" },
      { id: "r2", category: "Platform", severity: "High" },
      { id: "r3", category: "Regulatory", severity: "High" },
    ],
    competitors: [
      { id: "c1", gap: "No defensible gap is established", strength: "High", pricing: "Free", classification: "direct" },
      { id: "c2", gap: "Bundled incumbent covers the workflow", strength: "High", pricing: "Bundled", classification: "direct" },
      { id: "c3", gap: "Manual workaround remains sufficient", strength: "High", pricing: "Free", classification: "workflow_workaround" },
    ],
    hasPricingModel: false,
    launchStrategyCount: 0,
    founderFitFactor: founder(25, "Confirmed founder inputs show no special access or advantage."),
    expected: { researchOutcome: "research_completed", scoreRange: [20, 58], verdictPolarity: "negative", missingWtp: true, creditState: "consumed" },
  },
];
