import { PipelineRun } from "./types";
import { validationReports } from "@/lib/report-mocks";
import { ValidationReport } from "../report-schema";

const globalStore = globalThis as typeof globalThis & { __buildsignalRuns?: Map<string, PipelineRun> };
const runs = globalStore.__buildsignalRuns ?? new Map<string, PipelineRun>();
globalStore.__buildsignalRuns = runs;

// Helper to convert ValidationReport to PipelineRun
function reportToPipelineRun(report: ValidationReport, idOverride?: string): PipelineRun {
  const o = report.opportunity;
  const request = {
    ideaName: o.name,
    ideaDescription: o.oneLiner,
    targetCustomer: o.targetCustomer,
    marketType: o.market,
    targetRegion: "United States",
    depth: "deep" as const
  };

  const evidence = o.evidence.map(e => ({
    id: e.id,
    sourceId: `src-${e.id}`,
    kind: (e.signal === "Pain" ? "workaround" : e.signal === "Pricing" ? "competitor pricing" : e.signal === "Risk" ? "risk" : "market trend") as any,
    confidence: e.strength === "High" ? 90 : e.strength === "Medium" ? 70 : 50,
    title: e.title,
    snippet: e.snippet,
    url: e.url,
    source: e.source,
    verified: true
  }));

  const sources = o.evidence.map(e => ({
    id: `src-${e.id}`,
    title: e.title,
    url: e.url,
    source: e.source,
    snippet: e.snippet,
    sourceType: e.sourceType,
    text: e.snippet,
    date: e.date
  }));

  return {
    id: idOverride ?? o.id,
    request,
    mode: "Deep Validation",
    stage: "complete",
    progress: 100,
    message: "Report ready",
    queries: [],
    sources,
    evidence,
    report,
    createdAt: report.generatedAt,
    updatedAt: report.generatedAt
  };
}

// Seed mock items if the map is empty
if (runs.size === 0) {
  // Seed the 5 standard sample reports
  validationReports.forEach(report => {
    const run = reportToPipelineRun(report);
    runs.set(run.id, run);
  });

  // Seed standard research runs from dashboard history
  // CloseSignal (run_104) is based on validationReports[2] (Stripe Recovery / or we can map it directly)
  const recoveryReport = validationReports.find(r => r.opportunity.id === "recovery");
  if (recoveryReport) {
    // Clone and customize for CloseSignal
    const closeSignalReport: ValidationReport = JSON.parse(JSON.stringify(recoveryReport));
    closeSignalReport.opportunity.id = "run_104";
    closeSignalReport.opportunity.name = "CloseSignal";
    closeSignalReport.opportunity.oneLiner = "A client-request command center for boutique bookkeeping firms during month-end close.";
    closeSignalReport.opportunity.targetCustomer = "Owner-operators at 5–30 person bookkeeping firms";
    closeSignalReport.opportunity.market = "B2B";
    closeSignalReport.opportunity.corePain = "manually chasing client documents and answers during close week";
    const run104 = reportToPipelineRun(closeSignalReport, "run_104");
    runs.set("run_104", run104);
  }

  // ProposalOS (run_103)
  const proposalReport = validationReports.find(r => r.opportunity.id === "approval"); // designer portal as base
  if (proposalReport) {
    const proposalOSReport: ValidationReport = JSON.parse(JSON.stringify(proposalReport));
    proposalOSReport.opportunity.id = "run_103";
    proposalOSReport.opportunity.name = "ProposalOS";
    proposalOSReport.opportunity.oneLiner = "A proposal follow-up assistant for independent agencies.";
    proposalOSReport.opportunity.targetCustomer = "Boutique creative agencies";
    proposalOSReport.opportunity.market = "Agency Tool";
    proposalOSReport.opportunity.corePain = "losing agency deals due to late, manual proposal follow-ups";
    proposalOSReport.opportunity.scorecard.total = 73;
    proposalOSReport.opportunity.scorecard.verdict = "Validate First";
    const run103 = reportToPipelineRun(proposalOSReport, "run_103");
    runs.set("run_103", run103);
  }

  // LessonLoop (run_102)
  const lessonReport = validationReports.find(r => r.opportunity.id === "geo"); // GEO as base
  if (lessonReport) {
    const lessonLoopReport: ValidationReport = JSON.parse(JSON.stringify(lessonReport));
    lessonLoopReport.opportunity.id = "run_102";
    lessonLoopReport.opportunity.name = "LessonLoop";
    lessonLoopReport.opportunity.oneLiner = "A retention dashboard for cohort course creators.";
    lessonLoopReport.opportunity.targetCustomer = "Cohort course creators";
    lessonLoopReport.opportunity.market = "Creator";
    lessonLoopReport.opportunity.corePain = "high student drop-off rates and lack of early engagement signals";
    lessonLoopReport.opportunity.scorecard.total = 63;
    lessonLoopReport.opportunity.scorecard.verdict = "Validate First";
    const run102 = reportToPipelineRun(lessonLoopReport, "run_102");
    runs.set("run_102", run102);
  }
}

export const researchStore = {
  create(run: PipelineRun) {
    runs.set(run.id, run);
    return run;
  },
  get(id: string) {
    return runs.get(id);
  },
  update(id: string, patch: Partial<PipelineRun>) {
    const current = runs.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    runs.set(id, next);
    return next;
  },
  list() {
    return [...runs.values()];
  }
};

