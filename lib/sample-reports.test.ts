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
