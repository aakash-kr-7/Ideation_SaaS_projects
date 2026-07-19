import { canLaunchReport, getReportModeConfig, isExportAllowed, reportModeSchema } from "./mode-config.ts";

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
function assertEquals(actual: unknown, expected: unknown, message: string) { if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

Deno.test("report mode schema accepts only canonical modes", () => {
  assert(reportModeSchema.safeParse("quick_scan").success, "Quick Scan mode must parse");
  assert(reportModeSchema.safeParse("full_validation").success, "Full Validation mode must parse");
  assert(!reportModeSchema.safeParse("Fast Scan").success, "legacy customer label must be rejected");
  assert(!reportModeSchema.safeParse("deep").success, "untrusted legacy mode must be rejected");
});
Deno.test("Quick Scan contract is bounded and costs one credit", () => {
  const mode = getReportModeConfig("quick_scan");
  assertEquals(mode.creditCost, 1, "credit cost");
  assertEquals(mode.searchQueryLimit, 3, "query cap");
  assertEquals(mode.extractionLimit, 3, "source cap");
  assertEquals(mode.passes, [1, 3], "pass selection");
  assertEquals(mode.checkers, [], "checker selection");
  assertEquals(mode.exports, ["pdf"], "exports");
  assert(mode.evidenceSufficiency.requireDisconfirmingAttempt, "disconfirming search must be attempted");
});

Deno.test("Full Validation contract enables complete depth and costs three credits", () => {
  const mode = getReportModeConfig("full_validation");
  assertEquals(mode.creditCost, 3, "credit cost");
  assertEquals(mode.searchQueryLimit, 5, "query cap");
  assertEquals(mode.extractionLimit, 6, "source cap");
  assertEquals(mode.passes, [1, 2, 3], "pass selection");
  assertEquals(mode.specialists.length, 6, "specialists");
  assertEquals(mode.checkers.length, 6, "checkers");
  assert(mode.useAdversarialGate, "adversarial gate must run");
  assert(isExportAllowed("full_validation", "json"), "JSON export should be allowed");
  assert(!isExportAllowed("quick_scan", "json"), "Quick Scan JSON export should be denied");
});

Deno.test("mode progress labels name the selected product", () => {
  assert(getReportModeConfig("quick_scan").progress.some(step => step.label === "Generating Quick Scan"), "Quick Scan generation label");
  assert(getReportModeConfig("full_validation").progress.some(step => step.label === "Generating Full Validation"), "Full Validation generation label");
});

Deno.test("entitlement preview rejects unaffordable modes", () => {
  assert(canLaunchReport("quick_scan", 0, 1), "monthly Quick Scan should be available");
  assert(!canLaunchReport("full_validation", 2, 1), "free entitlement cannot fund Full Validation");
  assert(canLaunchReport("full_validation", 3, 0), "three paid credits should fund Full Validation");
  assert(!canLaunchReport("quick_scan", 0, 0), "empty balance should reject Quick Scan");
});

// ---------------------------------------------------------------------------
// New: Source-target operating parameters
// ---------------------------------------------------------------------------

Deno.test("Quick Scan source-target operating ranges", () => {
  const mode = getReportModeConfig("quick_scan");
  // Candidate discovery
  assertEquals(mode.candidateDiscoveryTarget.min, 60, "QS min candidates");
  assertEquals(mode.candidateDiscoveryTarget.max, 100, "QS max candidates");
  // Page attempts
  assertEquals(mode.pageAttemptRange.min, 25, "QS min page attempts");
  assertEquals(mode.pageAttemptRange.max, 35, "QS max page attempts");
  // Accepted sources
  assertEquals(mode.acceptedSourceTarget, 18, "QS accepted source target");
  assertEquals(mode.acceptedSourceMinimum, 12, "QS accepted source minimum");
  // Domain targets
  assertEquals(mode.independentDomainTarget, 8, "QS independent domain target");
  // Gap research
  assertEquals(mode.maxGapResearchIterations, 2, "QS max gap research iterations");
  // Max jobs
  assertEquals(mode.maxJobsPerRun, 80, "QS max jobs per run");
});

Deno.test("Full Validation source-target operating ranges", () => {
  const mode = getReportModeConfig("full_validation");
  // Candidate discovery
  assertEquals(mode.candidateDiscoveryTarget.min, 250, "FV min candidates");
  assertEquals(mode.candidateDiscoveryTarget.max, 400, "FV max candidates");
  // Page attempts
  assertEquals(mode.pageAttemptRange.min, 80, "FV min page attempts");
  assertEquals(mode.pageAttemptRange.max, 120, "FV max page attempts");
  // Accepted sources
  assertEquals(mode.acceptedSourceTarget, 55, "FV accepted source target");
  assertEquals(mode.acceptedSourceMinimum, 40, "FV accepted source minimum");
  // Domain targets
  assertEquals(mode.independentDomainTarget, 20, "FV independent domain target");
  // Gap research
  assertEquals(mode.maxGapResearchIterations, 3, "FV max gap research iterations");
  // Max jobs
  assertEquals(mode.maxJobsPerRun, 200, "FV max jobs per run");
});

Deno.test("Full Validation requires broader source quality", () => {
  const qs = getReportModeConfig("quick_scan");
  const fv = getReportModeConfig("full_validation");
  assert(fv.sourceQualityThresholds.minTier1or2Ratio > qs.sourceQualityThresholds.minTier1or2Ratio,
    "FV should require higher Tier 1/2 ratio");
  assert(fv.sourceQualityThresholds.maxTier4Ratio < qs.sourceQualityThresholds.maxTier4Ratio,
    "FV should allow fewer Tier 4 sources");
  assert(fv.officialSourceExpectation.requireTierOne,
    "FV should require Tier 1 sources");
  assert(!qs.officialSourceExpectation.requireTierOne,
    "QS should not require Tier 1 sources");
});

Deno.test("Time and cost limits are bounded", () => {
  const qs = getReportModeConfig("quick_scan");
  const fv = getReportModeConfig("full_validation");
  // Quick Scan is faster and cheaper
  assert(qs.timeLimits.totalMs < fv.timeLimits.totalMs, "QS total time < FV total time");
  assert(qs.costLimits.totalUsd < fv.costLimits.totalUsd, "QS total cost < FV total cost");
  // Stage defaults are reasonable
  assert(qs.timeLimits.stageDefaultMs > 0, "QS stage default > 0");
  assert(fv.timeLimits.stageDefaultMs > 0, "FV stage default > 0");
  // Reserve budgets exist
  assert(qs.costLimits.reasoningReserveUsd > 0, "QS reasoning reserve > 0");
  assert(fv.costLimits.reasoningReserveUsd > 0, "FV reasoning reserve > 0");
});

Deno.test("Batch defaults are within reasonable limits", () => {
  const qs = getReportModeConfig("quick_scan");
  const fv = getReportModeConfig("full_validation");
  // Fetch sources batch
  assert(qs.batchDefaults.fetchSources > 0 && qs.batchDefaults.fetchSources <= 20, "QS fetch batch");
  assert(fv.batchDefaults.fetchSources > 0 && fv.batchDefaults.fetchSources <= 20, "FV fetch batch");
  // Extract evidence batch
  assert(qs.batchDefaults.extractEvidence > 0 && qs.batchDefaults.extractEvidence <= 10, "QS extract batch");
  assert(fv.batchDefaults.extractEvidence > 0 && fv.batchDefaults.extractEvidence <= 10, "FV extract batch");
  // Evidence extraction should use smaller batches than source fetching
  assert(qs.batchDefaults.extractEvidence < qs.batchDefaults.fetchSources, "extract < fetch for QS");
  assert(fv.batchDefaults.extractEvidence < fv.batchDefaults.fetchSources, "extract < fetch for FV");
});

Deno.test("Chart availability grows with mode depth", () => {
  const qs = getReportModeConfig("quick_scan");
  const fv = getReportModeConfig("full_validation");
  assert(fv.chartAvailability.length > qs.chartAvailability.length, "FV should have more charts than QS");
  assert(qs.chartAvailability.includes("score_radar"), "QS must have score_radar");
  assert(fv.chartAvailability.includes("score_radar"), "FV must have score_radar");
  assert(fv.chartAvailability.includes("competitor_matrix"), "FV must have competitor_matrix");
});

Deno.test("Contradictory evidence requirements scale with mode", () => {
  const qs = getReportModeConfig("quick_scan");
  const fv = getReportModeConfig("full_validation");
  assert(fv.contradictoryEvidenceRequirement.minSources > qs.contradictoryEvidenceRequirement.minSources,
    "FV should require more contradictory sources");
  assert(qs.contradictoryEvidenceRequirement.requireDisconfirmingPass,
    "QS should require disconfirming pass");
  assert(fv.contradictoryEvidenceRequirement.requireDisconfirmingPass,
    "FV should require disconfirming pass");
});

Deno.test("Query family requirements scale with mode", () => {
  const qs = getReportModeConfig("quick_scan");
  const fv = getReportModeConfig("full_validation");
  assert(fv.queryFamilyRequirements.problem.minQueries > qs.queryFamilyRequirements.problem.minQueries,
    "FV should require more problem queries");
  assert(fv.queryFamilyRequirements.solution.minSources > qs.queryFamilyRequirements.solution.minSources,
    "FV should require more solution sources");
});
