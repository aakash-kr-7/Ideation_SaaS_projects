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
  status: ResearchStatus;
  label: string;
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
      { status: "Queued", label: "Preparing research" },
      { status: "Searching", label: "Searching market signals" },
      { status: "Extracting", label: "Extracting evidence" },
      { status: "Normalizing", label: "Normalizing findings" },
      { status: "Scoring", label: "Scoring the opportunity" },
      { status: "Generating", label: "Generating Quick Scan" },
      { status: "Completed", label: "Quick Scan ready" },
    ],
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
      { status: "Queued", label: "Preparing research" },
      { status: "Searching", label: "Broad market search" },
      { status: "Searching", label: "Targeted follow-up search" },
      { status: "Searching", label: "Adversarial research" },
      { status: "Extracting", label: "Extracting evidence" },
      { status: "Normalizing", label: "Normalizing findings" },
      { status: "Scoring", label: "Running specialist analysis" },
      { status: "Scoring", label: "Scoring the opportunity" },
      { status: "Generating", label: "Generating Full Validation" },
      { status: "Generating", label: "Creating exports" },
      { status: "Completed", label: "Full Validation ready" },
    ],
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
