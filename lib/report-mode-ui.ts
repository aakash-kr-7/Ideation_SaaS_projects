import type { ReportMode, ReportModeConfig } from "./report-modes";
import type { ResearchStatus } from "../supabase/functions/_shared/research/status";

export const REPORT_TABS = {
  quick_scan: ["Conclusion", "Evidence", "Competition", "Score breakdown", "Pricing", "Next actions", "Risks", "Exports"],
  full_validation: ["Conclusion", "Evidence", "Demand", "Competition", "Market", "Pricing", "MVP scope", "Go-to-market", "Risks", "Adversarial", "Score breakdown", "Sources", "Exports"],
} as const;

export type ReportTab = (typeof REPORT_TABS)[ReportMode][number];
export type HistoryFilter = "all" | "quick" | "full" | "completed" | "failed" | "progress";
export type HistoryFilterableRun = { mode: ReportMode; status: string };

export function countEvidenceSources(evidence: readonly { url?: string | null }[]): number {
  return new Set(evidence.map((item) => item.url?.trim()).filter((url): url is string => Boolean(url))).size;
}

export function filterReportHistory<T extends HistoryFilterableRun>(runs: readonly T[], filter: HistoryFilter): T[] {
  return runs.filter((run) =>
    filter === "all" ||
    (filter === "quick" && run.mode === "quick_scan") ||
    (filter === "full" && run.mode === "full_validation") ||
    (filter === "completed" && run.status === "Completed") ||
    (filter === "failed" && run.status === "Failed") ||
    (filter === "progress" && !["Completed", "Failed", "Cancelled"].includes(run.status))
  );
}

export function hasMixedResearchDepth(reports: readonly { reportMode: ReportMode }[]) {
  return new Set(reports.map((report) => report.reportMode)).size > 1;
}

export type ProgressFacts = {
  stage: ResearchStatus;
  stageDetails: readonly string[];
  passes: readonly { passNumber: number; status: "Running" | "Complete" | "BudgetLimited" }[];
  checkerCount: number;
};

export type ProgressStepState = "complete" | "active" | "pending";

const STATUS_ORDER: ResearchStatus[] = ["Queued", "Searching", "Extracting", "Normalizing", "Scoring", "Generating", "Completed"];

export function deriveProgressSteps(config: ReportModeConfig, facts: ProgressFacts) {
  const currentIndex = STATUS_ORDER.indexOf(facts.stage);
  const isAfter = (status: ResearchStatus) => currentIndex > STATUS_ORDER.indexOf(status) || facts.stage === "Completed";
  const details = facts.stageDetails.join(" ").toLowerCase();
  const passState = (passNumber: number): ProgressStepState => {
    const pass = facts.passes.find((item) => item.passNumber === passNumber);
    if (pass?.status === "Complete" || pass?.status === "BudgetLimited") return "complete";
    if (pass?.status === "Running") return "active";
    return isAfter("Extracting") ? "complete" : "pending";
  };
  const expectedPassesComplete = config.passes.every((number) => {
    const pass = facts.passes.find((item) => item.passNumber === number);
    return pass?.status === "Complete" || pass?.status === "BudgetLimited";
  });

  return config.progress.map((step): typeof step & { state: ProgressStepState } => {
    let state: ProgressStepState = "pending";
    if (step.key === "queued") state = facts.stage === "Queued" ? "active" : "complete";
    else if (step.key === "broad_research") state = passState(1);
    else if (step.key === "targeted_research") state = passState(2);
    else if (step.key === "adversarial_research") state = passState(3);
    else if (step.key === "extraction") state = expectedPassesComplete || isAfter("Extracting") ? "complete" : facts.stage === "Extracting" ? "active" : "pending";
    else if (step.key === "normalization") state = isAfter("Normalizing") ? "complete" : facts.stage === "Normalizing" ? "active" : "pending";
    else if (step.key === "specialist_analysis") state = isAfter("Scoring") || details.includes("computing 12-factor") ? "complete" : facts.stage === "Scoring" ? "active" : "pending";
    else if (step.key === "independent_checks") state = isAfter("Scoring") || facts.checkerCount >= config.checkers.length ? "complete" : facts.stage === "Scoring" ? "active" : "pending";
    else if (step.key === "deterministic_scoring") state = isAfter("Scoring") ? "complete" : details.includes("computing 12-factor") ? "active" : "pending";
    else if (step.key === "report_generation") state = isAfter("Generating") || details.includes("creating pdf") || details.includes("creating all exports") ? "complete" : facts.stage === "Generating" ? "active" : "pending";
    else if (step.key === "exports") state = facts.stage === "Completed" ? "complete" : details.includes("creating pdf") || details.includes("creating all exports") ? "active" : "pending";
    else if (step.key === "completed") state = facts.stage === "Completed" ? "complete" : "pending";
    return { ...step, state };
  });
}
