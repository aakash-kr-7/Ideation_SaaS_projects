import { z } from "zod";
import type { ResearchStatus } from "./status.ts";

export const REPORT_MODES = ["quick_scan", "full_validation"] as const;
export const reportModeSchema = z.enum(REPORT_MODES);
export type ReportMode = z.infer<typeof reportModeSchema>;
export type ReportExportFormat = "pdf" | "markdown" | "csv" | "json";

export interface EvidenceSufficiencyRules {
  minimumUsableEvidence: number;
  minimumProblemSources: number;
  minimumSolutionSources: number;
  minimumDisconfirmingEvidence: number;
  requireTierOneEvidence: boolean;
  requireTierOneOrTwoEvidence: boolean;
}
export interface ModeProgressStep {
  key: "queued" | "grounded_research" | "evidence_boosters" | "validate_normalize" | "analyze_score" | "generate_report" | "generate_exports" | "complete";
  status: ResearchStatus;
  label: string;
}
export interface ReportModeConfig {
  mode: ReportMode;
  label: string;
  customerDescription: string;
  purpose: string;
  creditCost: 1 | 3;
  exports: readonly ReportExportFormat[];
  progress: readonly ModeProgressStep[];
  evidenceSufficiency: EvidenceSufficiencyRules;
  costLimits: { readonly totalUsd: number };
  maxJobsPerRun: number;
}

const commonProgress = (reportLabel: string, exportLabel: string): readonly ModeProgressStep[] => [
  { key: "queued", status: "Queued", label: "Preparing your research brief" },
  { key: "grounded_research", status: "Searching", label: "Searching public sources for market signals" },
  { key: "evidence_boosters", status: "Searching", label: "Gathering and reviewing additional evidence" },
  { key: "validate_normalize", status: "Normalizing", label: "Verifying and organising evidence" },
  { key: "analyze_score", status: "Scoring", label: "Scoring across 12 decision factors" },
  { key: "generate_report", status: "Generating", label: `Writing your ${reportLabel}` },
  { key: "generate_exports", status: "Generating", label: exportLabel },
  { key: "complete", status: "Completed", label: `${reportLabel} ready to view` },
];

export const REPORT_MODE_CONFIG = {
  quick_scan: {
    mode: "quick_scan", label: "Quick Scan",
    customerDescription: "A rapid evidence screen to decide whether your idea deserves deeper investigation.",
    purpose: "Does this idea show enough evidence to deserve deeper validation?", creditCost: 1,
    exports: ["pdf", "markdown", "csv", "json"], progress: commonProgress("Quick Scan", "Preparing your PDF, Markdown, CSV, and JSON exports"),
    evidenceSufficiency: { minimumUsableEvidence: 4, minimumProblemSources: 2, minimumSolutionSources: 2, minimumDisconfirmingEvidence: 1, requireTierOneEvidence: false, requireTierOneOrTwoEvidence: true },
    costLimits: { totalUsd: 0.50 }, maxJobsPerRun: 12,
  },
  full_validation: {
    mode: "full_validation", label: "Full Validation",
    customerDescription: "Complete evidence-backed research to decide whether to build, narrow, validate further, or walk away.",
    purpose: "Should this idea be built, narrowed, validated further, or abandoned?", creditCost: 3,
    exports: ["pdf", "markdown", "csv", "json"], progress: commonProgress("Full Validation", "Preparing your PDF, Markdown, CSV, and JSON exports"),
    evidenceSufficiency: { minimumUsableEvidence: 10, minimumProblemSources: 4, minimumSolutionSources: 6, minimumDisconfirmingEvidence: 2, requireTierOneEvidence: true, requireTierOneOrTwoEvidence: true },
    costLimits: { totalUsd: 2.00 }, maxJobsPerRun: 12,
  },
} as const satisfies Record<ReportMode, ReportModeConfig>;

export function getReportModeConfig(value: unknown): ReportModeConfig { return REPORT_MODE_CONFIG[reportModeSchema.parse(value)]; }
export function reportModeLabel(mode: ReportMode) { return REPORT_MODE_CONFIG[mode].label; }
export function isExportAllowed(mode: ReportMode, format: ReportExportFormat) { return REPORT_MODE_CONFIG[mode].exports.includes(format as never); }
export function canLaunchReport(mode: ReportMode, paidCredits: number, freeQuickScans: number) {
  const paid = Math.max(0, Math.floor(paidCredits)); const free = Math.max(0, Math.floor(freeQuickScans));
  return mode === "quick_scan" ? free > 0 || paid >= 1 : paid >= 3;
}
