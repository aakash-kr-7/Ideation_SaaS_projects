import { getReportModeConfig } from "./report-modes.ts";
import { countEvidenceSources, deriveProgressSteps, filterReportHistory, hasMixedResearchDepth, REPORT_TABS } from "./report-mode-ui.ts";

declare const Deno: { test(name: string, fn: () => void | Promise<void>): void };

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }

Deno.test("report layouts expose concise and comprehensive navigation", () => {
  assert(!REPORT_TABS.quick_scan.includes("MVP scope" as never), "Quick Scan must stay concise");
  assert(REPORT_TABS.full_validation.includes("MVP scope"), "Full Validation must include MVP scope");
  assert(REPORT_TABS.full_validation.includes("Adversarial"), "Full Validation must include adversarial findings");
});

Deno.test("dashboard filters separate report modes and terminal states", () => {
  const runs = [
    { id: "quick", mode: "quick_scan" as const, status: "Completed" },
    { id: "full", mode: "full_validation" as const, status: "Scoring" },
    { id: "failed", mode: "quick_scan" as const, status: "Failed" },
  ];
  assert(filterReportHistory(runs, "quick").length === 2, "Quick Scan filter mismatch");
  assert(filterReportHistory(runs, "full")[0]?.id === "full", "Full Validation filter mismatch");
  assert(filterReportHistory(runs, "progress")[0]?.id === "full", "In-progress filter mismatch");
});

Deno.test("comparison flags unequal research scopes", () => {
  assert(hasMixedResearchDepth([{ reportMode: "quick_scan" }, { reportMode: "full_validation" }]), "mixed depths must be explained");
  assert(!hasMixedResearchDepth([{ reportMode: "quick_scan" }, { reportMode: "quick_scan" }]), "same depths must not warn");
});

Deno.test("source counts use distinct persisted citation URLs", () => {
  assert(countEvidenceSources([{ url: "https://example.test/a" }, { url: "https://example.test/a" }, { url: "https://example.test/b" }, { url: "" }]) === 2, "duplicate evidence rows must not inflate source counts");
});

Deno.test("progress derives one current step from persisted passes and logs", () => {
  const steps = deriveProgressSteps(getReportModeConfig("full_validation"), {
    stage: "Scoring",
    stageDetails: ["Running Demand Agent with an isolated independent checker"],
    passes: [1, 2, 3].map((passNumber) => ({ passNumber, status: "Complete" as const })),
    checkerCount: 2,
  });
  assert(steps.filter((step) => step.state === "active").length === 2, "specialist and checker work should reflect simultaneous persisted work");
  assert(steps.find((step) => step.key === "deterministic_scoring")?.state === "pending", "deterministic scoring must not start early");
  const scoring = deriveProgressSteps(getReportModeConfig("full_validation"), {
    stage: "Scoring",
    stageDetails: ["Computing 12-factor score without provider access"],
    passes: [1, 2, 3].map((passNumber) => ({ passNumber, status: "Complete" as const })),
    checkerCount: 6,
  });
  assert(scoring.find((step) => step.key === "deterministic_scoring")?.state === "active", "persisted scoring log should activate deterministic scoring");
});
