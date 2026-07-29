import { ValidationReport } from "./report-schema";

type ExportDecision = {
  verdictStructure?: {
    recommendedTargetSegment?: string | null; recommendedProductWedge?: string | null; scoreRange?: string;
    evidenceConfidence?: string; strongestAssumption?: string; upgradeCondition?: string; downgradeCondition?: string; killCondition?: string;
  };
  segmentRankings?: Array<{ segment: string; score: number; rankReason: string }>;
  economicsScenarios?: Array<{ name: string; price: number | null; currency: string | null; customersRequired: number | null; grossMarginRange: [number, number] | null; breakEvenCustomers: number | null }>;
  founderActionPlan?: { days: Array<{ days: string; action: string }> };
};

const list = (items: readonly string[]) => items.length ? items.map(item => `- ${item}`).join("\n") : "Unavailable in this report.";
const numbered = (items: readonly string[]) => items.length ? items.map((item, index) => `${index + 1}. ${item}`).join("\n") : "Unavailable in this report.";
const cell = (value: string) => value.replaceAll("|", "/").replaceAll("\n", " ");

export function reportToMarkdown(report: ValidationReport) {
  const o = report.opportunity;
  const full = report.fullValidationDecision as ExportDecision | undefined;
  const scoreRows = Object.entries(o.scorecard.scores).map(([key, value]) =>
    `| ${key.replace(/([A-Z])/g, " $1")} | ${o.scorecard.factorEvidence?.[key as keyof typeof o.scorecard.factorEvidence]?.rawScore ?? value} | ${o.scorecard.factorEvidence?.[key as keyof typeof o.scorecard.factorEvidence]?.evidenceCoefficient ?? "Legacy"} | ${o.scorecard.factorEvidence?.[key as keyof typeof o.scorecard.factorEvidence]?.effectiveScore ?? value} | ${o.scorecard.factorEvidence?.[key as keyof typeof o.scorecard.factorEvidence]?.evidenceState ?? "Legacy"} | ${cell(o.scorecard.notes[key as keyof typeof o.scorecard.notes])} |`
  ).join("\n");
  const evidenceRows = o.evidence.map(e =>
    `| [${cell(e.title)}](${e.url}) | ${cell(e.canonicalDomain ?? e.source)} | ${e.sourceType} | ${e.evidenceRole ?? (e.disconfirming ? "challenging" : "supporting")} | ${e.associatedFactorIds?.join(", ") || "None"} | ${cell(e.snippet)} |`
  ).join("\n");
  const competitorRows = o.competitors.map(c =>
    `| ${cell(c.name)} | ${cell(c.verificationStatus ?? (c.evidenceIds?.length ? "live_verified_competitor" : "unverified_seed"))} | ${cell(c.target)} | ${cell(c.verificationStatus === "unverified_seed" ? "Not live verified" : c.pricing)} | ${cell(c.strength)} | ${cell(c.verificationStatus === "unverified_seed" ? "Unavailable — evidence gap" : c.gap)} |`
  ).join("\n");
  const sufficiency = report.evidenceSufficiency;
  const researchState = report.researchAvailabilityState === "insufficient_evidence" ? "Insufficient Evidence" : report.researchAvailabilityState === "research_completed" ? "Research Completed" : "Legacy report";
  const packRows = report.researchExecution?.packStatuses.map((item) => `- ${item.packKey.replaceAll("_", " ")}: ${item.status.replaceAll("_", " ")} (${item.acceptedEvidenceCount} accepted)`).join("\n") || "Not persisted.";

  return `# ${o.name}

> ShouldBuild ${report.reportMode === "quick_scan" ? "Quick Scan" : "Full Validation"} — decision support, not a revenue guarantee.

**Report date:** ${report.generatedAt}  
**Verdict:** ${o.scorecard.verdict}  
**Displayed score:** ${o.scorecard.scoreBand?.display ?? `${o.scorecard.total}/100`}\
**Exact internal score:** ${o.scorecard.total}/100\
**Evidence confidence:** ${o.scorecard.confidence}%
**Research availability:** ${researchState}

## Evidence Sufficiency

${sufficiency ? `- Accepted evidence: ${sufficiency.acceptedEvidenceCount}
- Independent evidence groups: ${sufficiency.independentEvidenceGroups}
- Independent domains: ${sufficiency.independentDomains}
- Source-family coverage: ${sufficiency.sourceFamilyCoverage.join(", ") || "None"}
- Primary/direct evidence: ${sufficiency.primaryDirectEvidenceCount}
- Supporting / challenging: ${sufficiency.supportingEvidenceCount} / ${sufficiency.challengingEvidenceCount}
- Covered factors: ${sufficiency.coveredFactors.join(", ") || "None"}
- Assumed factors: ${sufficiency.assumedFactors.join(", ") || "None"}
- Missing evidence families: ${sufficiency.missingEvidenceFamilies.join(", ") || "None"}
- Source concentration: ${Math.round(sufficiency.sourceConcentration * 100)}%
- Overall Evidence Confidence: ${sufficiency.overallEvidenceConfidence}
- Main limitation: ${sufficiency.mostImportantLimitation}
${report.verdictChangeConditions ? `- Upgrade condition: ${report.verdictChangeConditions.upgradeCondition}
- Downgrade condition: ${report.verdictChangeConditions.downgradeCondition}` : ""}` : "Legacy report — factor-level sufficiency was not persisted."}

### Research packs

${packRows}

## Executive summary

${report.executiveSummary}

${full?.verdictStructure ? `## Full Validation decision

- Recommended segment: ${full.verdictStructure.recommendedTargetSegment ?? "Not supported yet"}
- Recommended wedge: ${full.verdictStructure.recommendedProductWedge ?? "Not supported yet"}
- Score range: ${full.verdictStructure.scoreRange}
- Evidence Confidence: ${full.verdictStructure.evidenceConfidence}
- Strongest assumption: ${full.verdictStructure.strongestAssumption}
- Upgrade condition: ${full.verdictStructure.upgradeCondition}
- Downgrade condition: ${full.verdictStructure.downgradeCondition}
- Kill condition: ${full.verdictStructure.killCondition}

### Segment rankings

${(full.segmentRankings ?? []).map((item, index) => `${index + 1}. ${item.segment}: ${item.score} — ${item.rankReason}`).join("\n") || "No supported segment ranking."}

### Scenario economics

${(full.economicsScenarios ?? []).map((item) => `- ${item.name}: price ${item.price ?? "unresolved"} ${item.currency ?? ""}; customers ${item.customersRequired ?? "unresolved"}; gross margin ${item.grossMarginRange?.join("–") ?? "unresolved"}; break-even ${item.breakEvenCustomers ?? "unresolved"}`).join("\n")}

### 30-day validation plan

${(full.founderActionPlan?.days ?? []).map((item) => `- Days ${item.days}: ${item.action}`).join("\n")}
` : ""}

## Problem and buyer

**Target customer:** ${o.targetCustomer}  
**Core pain:** ${o.corePain}  
**Current workaround:** ${o.currentWorkaround ?? "Not verified in this report."}

## 12-factor score

| Criterion | Raw | Coefficient | Effective | Evidence state | Persisted reasoning |
|---|---:|---:|---:|---|---|
${scoreRows}

## Evidence

| Source | Canonical domain | Type | Role | Linked factors | Extracted insight |
|---|---|---|---|---|---|
${evidenceRows || "| Unavailable | — | — | — | — | No evidence was persisted. |"}

## Competitors

| Competitor | Verification | Target customer | Pricing | Strength | Gap |
|---|---|---|---|---|---|
${competitorRows || "| Unavailable | — | — | — | No competitor record was persisted. |"}

## Pricing direction

**Model:** ${o.pricing.model}  
**Price point:** ${o.pricing.pricePoint}  
**First offer:** ${o.pricing.firstOffer}  
${o.pricing.rationale}

## MVP scope

${list(o.mvp.scope)}

### Do not build

${list(o.mvp.exclusions)}

## Risks and mitigations

${o.risks.length ? o.risks.map(r => `- **${r.severity} ${r.category}:** ${r.description}\n  - Mitigation: ${r.mitigation}`).join("\n") : "Unavailable in this report."}

## Launch plan

**First-customer channel:** ${o.launch.firstCustomerChannel}

${numbered(o.launch.firstTenStrategy)}

### Week one

${numbered(o.launch.weekOne)}

## Final recommendation

**${o.scorecard.verdict}**

${report.topRecommendation ?? o.launch.successMetric}
`;
}

export function reportToCsv(report: ValidationReport) {
  const o = report.opportunity;
  const headers = ["Opportunity", "Report mode", "Report version", "Research availability", "Target customer", "Displayed score", "Exact score", "Confidence", "Verdict", "Evidence confidence", "Accepted evidence", "Independent evidence groups", "Assumed factors", "Evidence sufficiency JSON", "Factor evidence JSON", "Sources JSON", "Verdict change conditions JSON", "Research pack statuses JSON", "Full Validation decision JSON", "Pricing", "Build complexity", "First customer channel", "Top risk"];
  const row = [o.name, report.reportMode, report.version, report.researchAvailabilityState ?? "legacy", o.targetCustomer, o.scorecard.scoreBand?.display ?? `${o.scorecard.total}/100`, o.scorecard.total, o.scorecard.confidence, o.scorecard.verdict, report.evidenceSufficiency?.overallEvidenceConfidence ?? "Legacy", report.evidenceSufficiency?.acceptedEvidenceCount ?? "", report.evidenceSufficiency?.independentEvidenceGroups ?? "", report.evidenceSufficiency?.assumedFactors.join("|") ?? "", JSON.stringify(report.evidenceSufficiency ?? null), JSON.stringify(o.scorecard.factorEvidence ?? null), JSON.stringify(o.evidence), JSON.stringify(report.verdictChangeConditions ?? null), JSON.stringify(report.researchExecution?.packStatuses ?? []), JSON.stringify(report.fullValidationDecision ?? null), o.pricing.pricePoint, o.mvp.buildComplexity, o.launch.firstCustomerChannel, o.risks[0]?.description ?? "Unavailable"];
  return `\uFEFF${headers.join(",")}\r\n${row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")}\r\n`;
}

export function downloadExport(filename: string, content: BlobPart | Blob, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
