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
  { key: "queued", status: "Queued", label: "Preparing research" },
  { key: "grounded_research", status: "Searching", label: "Gemini grounded research" },
  { key: "evidence_boosters", status: "Searching", label: "Selective evidence boosters" },
  { key: "validate_normalize", status: "Normalizing", label: "Validating attributable evidence" },
  { key: "analyze_score", status: "Scoring", label: "Computing the 12-factor score and charts" },
  { key: "generate_report", status: "Generating", label: `Generating ${reportLabel}` },
  { key: "generate_exports", status: "Generating", label: exportLabel },
  { key: "complete", status: "Completed", label: `${reportLabel} ready` },
];

export const REPORT_MODE_CONFIG = {
  quick_scan: {
    mode: "quick_scan", label: "Quick Scan",
    customerDescription: "A rapid evidence-backed screen to decide whether an idea deserves deeper validation.",
    purpose: "Does this idea show enough evidence to deserve deeper validation?", creditCost: 1,
    exports: ["pdf"], progress: commonProgress("Quick Scan", "Creating PDF export"),
    evidenceSufficiency: { minimumUsableEvidence: 2, minimumProblemSources: 1, minimumSolutionSources: 1, minimumDisconfirmingEvidence: 0, requireTierOneEvidence: false, requireTierOneOrTwoEvidence: true },
    costLimits: { totalUsd: 0.50 }, maxJobsPerRun: 12,
  },
  full_validation: {
    mode: "full_validation", label: "Full Validation",
    customerDescription: "A deeper grounded validation with disconfirming research and complete export coverage.",
    purpose: "Should this idea be built, narrowed, validated further, or abandoned?", creditCost: 3,
    exports: ["pdf", "markdown", "csv", "json"], progress: commonProgress("Full Validation", "Creating PDF, Markdown, CSV, and JSON exports"),
    evidenceSufficiency: { minimumUsableEvidence: 4, minimumProblemSources: 2, minimumSolutionSources: 2, minimumDisconfirmingEvidence: 1, requireTierOneEvidence: true, requireTierOneOrTwoEvidence: true },
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
