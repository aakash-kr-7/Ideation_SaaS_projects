import { sampleFullValidation, sampleQuickScan } from "./sample-reports.ts";
import { calculateWeightedScore } from "./scoring.ts";
import { validationReportSchema } from "./report-schema.ts";
import { countEvidenceSources } from "./report-mode-ui.ts";

declare const Deno: { test(name: string, fn: () => void | Promise<void>): void };

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
function verify(report: typeof sampleQuickScan, expectedSources: number) {
  assert(validationReportSchema.safeParse(report).success, `${report.reportMode} payload must validate`);
  assert(countEvidenceSources(report.opportunity.evidence) === expectedSources, `${report.reportMode} source count mismatch`);
  assert(report.opportunity.scorecard.total === calculateWeightedScore(report.opportunity.scorecard.scores, report.opportunity.scorecard.weights), `${report.reportMode} score was not deterministic`);
  assert(Object.keys(report.opportunity.scorecard.factorEvidence || {}).length === 12, `${report.reportMode} does not expose all factor evidence states`);
  assert(Object.values(report.opportunity.scorecard.factorEvidence || {}).every((factor) => factor && ["EVIDENCED", "SUGGESTIVE", "ASSUMED"].includes(factor.evidenceState)), `${report.reportMode} has an invalid factor evidence state`);
  assert(Boolean(report.opportunity.scorecard.scoreBand?.display), `${report.reportMode} has no evidence-derived score display`);
  assert(Boolean(report.evidenceSufficiency), `${report.reportMode} has no Evidence Sufficiency summary`);
  const ids = new Set(report.opportunity.evidence.map(item => item.id));
  Object.values(report.opportunity.scorecard.evidenceRefs).flat().forEach(id => assert(ids.has(id), `${report.reportMode} score references missing evidence ${id}`));
  assert(report.marketSizing?.reason === "No verifiable market-size figure was used in this report.", "unsupported market size disclaimer missing");
}

Deno.test("public Quick Scan is schema-valid and internally consistent", () => verify(sampleQuickScan, 3));
Deno.test("public Full Validation is schema-valid and internally consistent", () => verify(sampleFullValidation, 6));
Deno.test("sample modes use the same idea and expose different depth", () => {
  assert(sampleQuickScan.opportunity.oneLiner === sampleFullValidation.opportunity.oneLiner, "sample idea changed between modes");
  assert(sampleQuickScan.availableExports.length < sampleFullValidation.availableExports.length, "Full Validation did not expose additional exports");
  assert(sampleQuickScan.reportSections.length < sampleFullValidation.reportSections.length, "Full Validation did not expose additional sections");
});

Deno.test("immutable reports without evidence-integrity extensions remain compatible", () => {
  const legacy = structuredClone(sampleQuickScan);
  delete legacy.evidenceSufficiency;
  delete legacy.researchAvailabilityState;
  delete legacy.verdictChangeConditions;
  delete legacy.opportunity.scorecard.factorEvidence;
  delete legacy.opportunity.scorecard.scoreBand;
  for (const item of legacy.opportunity.evidence) {
    delete item.claimId;
    delete item.independenceKey;
    delete item.numericValidationState;
  }
  for (const item of legacy.opportunity.competitors) {
    delete item.verificationStatus;
    delete item.verifiedAt;
  }
  assert(validationReportSchema.safeParse(legacy).success, "legacy immutable report became unreadable");
});
