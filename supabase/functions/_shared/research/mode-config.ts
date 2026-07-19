import { z } from "zod";
import type { ResearchStatus } from "./status.ts";
import type { SpecialistName } from "./reasoning.ts";

export const REPORT_MODES = ["quick_scan", "full_validation"] as const;
export const reportModeSchema = z.enum(REPORT_MODES);
export type ReportMode = z.infer<typeof reportModeSchema>;

export const REPORT_MODE_LABELS: Record<ReportMode, string> = {
  quick_scan: "Quick Scan",
  full_validation: "Full Validation",
};

export type ReportExportFormat = "pdf" | "markdown" | "csv" | "json";
export type OutputDepth = "concise" | "comprehensive";

export interface EvidenceSufficiencyRules {
  minimumUsableEvidence: number;
  minimumProblemSources: number;
  minimumSolutionSources: number;
  minimumDisconfirmingEvidence: number;
  requireDisconfirmingAttempt: boolean;
  requireTierOneEvidence: boolean;
  requireTierOneOrTwoEvidence: boolean;
  minimumIndependentCorroboration: number;
}

export interface ModeProgressStep {
  key:
    | "queued"
    | "broad_research"
    | "targeted_research"
    | "adversarial_research"
    | "extraction"
    | "normalization"
    | "specialist_analysis"
    | "independent_checks"
    | "deterministic_scoring"
    | "report_generation"
    | "exports"
    | "completed";
  status: ResearchStatus;
  label: string;
}

// ---------------------------------------------------------------------------
// Operating target interfaces — internal budgets, not marketing promises
// ---------------------------------------------------------------------------

export interface OperatingRange {
  readonly min: number;
  readonly max: number;
}

export interface FamilyRequirement {
  readonly minQueries: number;
  readonly minSources: number;
}

export interface SourceQualityThresholds {
  readonly maxTier4Ratio: number;
  readonly minTier1or2Ratio: number;
}

export interface BatchDefaults {
  readonly fetchSources: number;
  readonly extractEvidence: number;
  readonly discoverCandidates: number;
}

export interface TimeLimits {
  readonly totalMs: number;
  readonly retrievalMs: number;
  readonly reasoningMs: number;
  readonly stageDefaultMs: number;
}

export interface CostLimits {
  readonly totalUsd: number;
  readonly retrievalReserveUsd: number;
  readonly reasoningReserveUsd: number;
}

export interface ReportModeConfig {
  mode: ReportMode;
  label: string;
  customerDescription: string;
  purpose: string;
  creditCost: 1 | 3;
  searchQueryLimit: 3 | 5;
  extractionLimit: 3 | 6;
  passes: readonly (1 | 2 | 3)[];
  queriesPerPass: Readonly<Record<1 | 2 | 3, number>>;
  sourcesPerPass: Readonly<Record<1 | 2 | 3, number>>;
  specialists: readonly SpecialistName[];
  checkers: readonly SpecialistName[];
  useAdversarialGate: boolean;
  outputDepth: OutputDepth;
  exports: readonly ReportExportFormat[];
  providerCostCapUsd: number;
  reasoningCostReserveUsd: number;
  retrievalTimeBudgetMs: number;
  reasoningTimeBudgetMs: number;
  evidenceSufficiency: EvidenceSufficiencyRules;
  reportSections: readonly string[];
  progress: readonly ModeProgressStep[];

  // --- New: source-target operating parameters ---
  candidateDiscoveryTarget: OperatingRange;
  pageAttemptRange: OperatingRange;
  acceptedSourceTarget: number;
  acceptedSourceMinimum: number;
  independentDomainTarget: number;
  queryFamilyRequirements: {
    problem: FamilyRequirement;
    solution: FamilyRequirement;
  };
  contradictoryEvidenceRequirement: {
    minSources: number;
    requireDisconfirmingPass: boolean;
  };
  officialSourceExpectation: {
    requireTierOne: boolean;
    requireTierOneOrTwo: boolean;
  };
  sourceQualityThresholds: SourceQualityThresholds;
  batchDefaults: BatchDefaults;
  specialistDepth: OutputDepth;
  timeLimits: TimeLimits;
  costLimits: CostLimits;
  chartAvailability: readonly string[];
  maxGapResearchIterations: number;
  maxJobsPerRun: number;
}

export const REPORT_MODE_CONFIG = {
  quick_scan: {
    mode: "quick_scan",
    label: "Quick Scan",
    customerDescription:
      "A rapid evidence-backed screen to determine whether an idea deserves deeper research.",
    purpose: "Does this idea show enough evidence to deserve deeper validation?",
    creditCost: 1,
    searchQueryLimit: 3,
    extractionLimit: 3,
    passes: [1, 3],
    queriesPerPass: { 1: 2, 2: 0, 3: 1 },
    sourcesPerPass: { 1: 2, 2: 0, 3: 1 },
    specialists: ["demand", "competition", "pricing", "risk"],
    checkers: [],
    useAdversarialGate: true,
    outputDepth: "concise",
    exports: ["pdf"],
    providerCostCapUsd: 0.32,
    reasoningCostReserveUsd: 0.13,
    retrievalTimeBudgetMs: 55_000,
    reasoningTimeBudgetMs: 70_000,
    evidenceSufficiency: {
      minimumUsableEvidence: 2,
      minimumProblemSources: 1,
      minimumSolutionSources: 1,
      minimumDisconfirmingEvidence: 0,
      requireDisconfirmingAttempt: true,
      requireTierOneEvidence: false,
      requireTierOneOrTwoEvidence: true,
      minimumIndependentCorroboration: 1,
    },
    reportSections: [
      "executive_conclusion",
      "problem_signals",
      "demand_signals",
      "competitor_snapshot",
      "willingness_to_pay",
      "supporting_evidence",
      "contradictory_evidence",
      "risks",
      "pricing_direction",
      "next_actions",
      "sources",
      "limitations",
    ],
    progress: [
      { key: "queued", status: "Queued", label: "Preparing research" },
      { key: "broad_research", status: "Searching", label: "Broad evidence search" },
      { key: "adversarial_research", status: "Searching", label: "Contradictory evidence search" },
      { key: "extraction", status: "Extracting", label: "Extracting evidence" },
      { key: "normalization", status: "Normalizing", label: "Normalizing findings" },
      { key: "specialist_analysis", status: "Scoring", label: "Running concise specialist analysis" },
      { key: "deterministic_scoring", status: "Scoring", label: "Computing the 12-factor score" },
      { key: "report_generation", status: "Generating", label: "Generating Quick Scan" },
      { key: "exports", status: "Generating", label: "Creating PDF export" },
      { key: "completed", status: "Completed", label: "Quick Scan ready" },
    ],
    // --- Operating targets ---
    candidateDiscoveryTarget: { min: 60, max: 100 },
    pageAttemptRange: { min: 25, max: 35 },
    acceptedSourceTarget: 18,
    acceptedSourceMinimum: 12,
    independentDomainTarget: 8,
    queryFamilyRequirements: {
      problem: { minQueries: 2, minSources: 4 },
      solution: { minQueries: 2, minSources: 4 },
    },
    contradictoryEvidenceRequirement: { minSources: 1, requireDisconfirmingPass: true },
    officialSourceExpectation: { requireTierOne: false, requireTierOneOrTwo: true },
    sourceQualityThresholds: { maxTier4Ratio: 0.3, minTier1or2Ratio: 0.15 },
    batchDefaults: { fetchSources: 10, extractEvidence: 5, discoverCandidates: 20 },
    specialistDepth: "concise",
    timeLimits: { totalMs: 180_000, retrievalMs: 90_000, reasoningMs: 70_000, stageDefaultMs: 60_000 },
    costLimits: { totalUsd: 0.50, retrievalReserveUsd: 0.25, reasoningReserveUsd: 0.15 },
    chartAvailability: ["score_radar", "evidence_distribution"],
    maxGapResearchIterations: 1,
    maxJobsPerRun: 80,
  },
  full_validation: {
    mode: "full_validation",
    label: "Full Validation",
    customerDescription:
      "Multi-pass adversarial research and complete specialist analysis before committing meaningful time or money.",
    purpose:
      "Should I build this, narrow it, validate it further, or abandon it before committing meaningful time and money?",
    creditCost: 3,
    searchQueryLimit: 5,
    extractionLimit: 6,
    passes: [1, 2, 3],
    queriesPerPass: { 1: 2, 2: 1, 3: 2 },
    sourcesPerPass: { 1: 2, 2: 2, 3: 2 },
    specialists: ["competition", "market", "pricing", "risk", "demand", "gtm"],
    checkers: ["competition", "market", "pricing", "risk", "demand", "gtm"],
    useAdversarialGate: true,
    outputDepth: "comprehensive",
    exports: ["pdf", "markdown", "csv", "json"],
    providerCostCapUsd: 1,
    reasoningCostReserveUsd: 0.36,
    retrievalTimeBudgetMs: 85_000,
    reasoningTimeBudgetMs: 115_000,
    evidenceSufficiency: {
      minimumUsableEvidence: 4,
      minimumProblemSources: 2,
      minimumSolutionSources: 2,
      minimumDisconfirmingEvidence: 1,
      requireDisconfirmingAttempt: true,
      requireTierOneEvidence: true,
      requireTierOneOrTwoEvidence: true,
      minimumIndependentCorroboration: 2,
    },
    reportSections: [
      "executive_conclusion",
      "evidence",
      "demand",
      "competition",
      "market",
      "pricing",
      "mvp_scope",
      "go_to_market",
      "risks",
      "adversarial_findings",
      "score_breakdown",
      "sources",
      "exports",
    ],
    progress: [
      { key: "queued", status: "Queued", label: "Preparing research" },
      { key: "broad_research", status: "Searching", label: "Broad market search" },
      { key: "targeted_research", status: "Searching", label: "Targeted follow-up search" },
      { key: "adversarial_research", status: "Searching", label: "Adversarial research" },
      { key: "extraction", status: "Extracting", label: "Extracting evidence" },
      { key: "normalization", status: "Normalizing", label: "Normalizing findings" },
      { key: "specialist_analysis", status: "Scoring", label: "Running specialist analysis" },
      { key: "independent_checks", status: "Scoring", label: "Running independent checks" },
      { key: "deterministic_scoring", status: "Scoring", label: "Computing the 12-factor score" },
      { key: "report_generation", status: "Generating", label: "Generating Full Validation" },
      { key: "exports", status: "Generating", label: "Creating all exports" },
      { key: "completed", status: "Completed", label: "Full Validation ready" },
    ],
    // --- Operating targets ---
    candidateDiscoveryTarget: { min: 250, max: 400 },
    pageAttemptRange: { min: 80, max: 120 },
    acceptedSourceTarget: 55,
    acceptedSourceMinimum: 40,
    independentDomainTarget: 20,
    queryFamilyRequirements: {
      problem: { minQueries: 4, minSources: 10 },
      solution: { minQueries: 4, minSources: 10 },
    },
    contradictoryEvidenceRequirement: { minSources: 3, requireDisconfirmingPass: true },
    officialSourceExpectation: { requireTierOne: true, requireTierOneOrTwo: true },
    sourceQualityThresholds: { maxTier4Ratio: 0.15, minTier1or2Ratio: 0.25 },
    batchDefaults: { fetchSources: 10, extractEvidence: 5, discoverCandidates: 25 },
    specialistDepth: "comprehensive",
    timeLimits: { totalMs: 600_000, retrievalMs: 300_000, reasoningMs: 200_000, stageDefaultMs: 120_000 },
    costLimits: { totalUsd: 2.00, retrievalReserveUsd: 1.20, reasoningReserveUsd: 0.50 },
    chartAvailability: ["score_radar", "evidence_distribution", "competitor_matrix", "risk_heatmap", "demand_timeline"],
    maxGapResearchIterations: 3,
    maxJobsPerRun: 200,
  },
} as const satisfies Record<ReportMode, ReportModeConfig>;

export function getReportModeConfig(value: unknown): ReportModeConfig {
  const mode = reportModeSchema.parse(value);
  return REPORT_MODE_CONFIG[mode];
}

export function reportModeLabel(mode: ReportMode) {
  return REPORT_MODE_LABELS[mode];
}

export function isExportAllowed(mode: ReportMode, format: ReportExportFormat) {
  return REPORT_MODE_CONFIG[mode].exports.includes(format as never);
}

export function canLaunchReport(mode: ReportMode, paidCredits: number, freeQuickScans: number) {
  const safePaid = Math.max(0, Math.floor(paidCredits));
  const safeFree = Math.max(0, Math.floor(freeQuickScans));
  return mode === "quick_scan" ? safeFree > 0 || safePaid >= 1 : safePaid >= 3;
}
