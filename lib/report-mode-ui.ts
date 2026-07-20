import type { ReportMode, ReportModeConfig } from "./report-modes";
import type { ResearchStatus } from "../supabase/functions/_shared/research/status";

export const REPORT_TABS = {
  quick_scan: ["Conclusion", "Evidence", "Competition", "Score breakdown", "Pricing", "Next actions", "Risks", "Exports"],
  full_validation: ["Conclusion", "Evidence", "Demand", "Competition", "Market", "Pricing", "MVP scope", "Go-to-market", "Risks", "Adversarial", "Score breakdown", "Sources", "Exports"],
} as const;
export type ReportTab = (typeof REPORT_TABS)[ReportMode][number];
export type HistoryFilter = "all" | "quick" | "full" | "completed" | "failed" | "progress";
export type HistoryFilterableRun = { mode: ReportMode; status: string };
export function countEvidenceSources(evidence: readonly { url?: string | null }[]) { return new Set(evidence.map((item) => item.url?.trim()).filter(Boolean)).size; }
export function filterReportHistory<T extends HistoryFilterableRun>(runs: readonly T[], filter: HistoryFilter): T[] {
  return runs.filter((run) => filter === "all" || (filter === "quick" && run.mode === "quick_scan") || (filter === "full" && run.mode === "full_validation") || (filter === "completed" && run.status === "Completed") || (filter === "failed" && run.status === "Failed") || (filter === "progress" && !["Completed", "Failed", "Cancelled"].includes(run.status)));
}
export function hasMixedResearchDepth(reports: readonly { reportMode: ReportMode }[]) { return new Set(reports.map((report) => report.reportMode)).size > 1; }
export type ProgressStepState = "complete" | "active" | "pending";
export function deriveProgressSteps(config: ReportModeConfig, facts: { stage: ResearchStatus; progress: number }) {
  const thresholds = [0, 5, 30, 50, 65, 85, 93, 100];
  return config.progress.map((step, index) => {
    const threshold = thresholds[index]; const nextThreshold = thresholds[index + 1] ?? 101;
    const state: ProgressStepState = facts.stage === "Completed" || facts.progress >= nextThreshold ? "complete" : facts.progress >= threshold ? "active" : "pending";
    return { ...step, state };
  });
}
