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
