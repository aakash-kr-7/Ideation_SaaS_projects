import { ValidationReport } from "./report-schema";

const list = (items: readonly string[]) => items.length ? items.map(item => `- ${item}`).join("\n") : "Unavailable in this report.";
const numbered = (items: readonly string[]) => items.length ? items.map((item, index) => `${index + 1}. ${item}`).join("\n") : "Unavailable in this report.";
const cell = (value: string) => value.replaceAll("|", "/").replaceAll("\n", " ");

export function reportToMarkdown(report: ValidationReport) {
  const o = report.opportunity;
  const scoreRows = Object.entries(o.scorecard.scores).map(([key, value]) =>
    `| ${key.replace(/([A-Z])/g, " $1")} | ${value} | ${cell(o.scorecard.notes[key as keyof typeof o.scorecard.notes])} |`
  ).join("\n");
  const evidenceRows = o.evidence.map(e =>
    `| [${cell(e.source)}](${e.url}) | ${e.sourceType} | ${e.strength} | ${cell(e.snippet)} |`
  ).join("\n");
  const competitorRows = o.competitors.map(c =>
    `| ${cell(c.name)} | ${cell(c.target)} | ${cell(c.pricing)} | ${cell(c.strength)} | ${cell(c.gap)} |`
  ).join("\n");

  return `# ${o.name}

> ShouldBuild ${report.reportMode === "quick_scan" ? "Quick Scan" : "Full Validation"} — decision support, not a revenue guarantee.

**Report date:** ${report.generatedAt}  
**Verdict:** ${o.scorecard.verdict}  
**Weighted score:** ${o.scorecard.total}/100  
**Evidence confidence:** ${o.scorecard.confidence}%

## Executive summary

${report.executiveSummary}

## Problem and buyer

**Target customer:** ${o.targetCustomer}  
**Core pain:** ${o.corePain}  
**Current workaround:** ${o.currentWorkaround ?? "Not verified in this report."}

## 12-factor score

| Criterion | Score | Persisted reasoning |
|---|---:|---|
${scoreRows}

## Evidence

| Source | Type | Strength | Extracted insight |
|---|---|---|---|
${evidenceRows || "| Unavailable | — | — | No evidence was persisted. |"}

## Competitors

| Competitor | Target customer | Pricing | Strength | Gap |
|---|---|---|---|---|
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
  const headers = ["Opportunity", "Report mode", "Target customer", "Score", "Confidence", "Verdict", "Pricing", "Build complexity", "First customer channel", "Top risk"];
  const row = [o.name, report.reportMode, o.targetCustomer, o.scorecard.total, o.scorecard.confidence, o.scorecard.verdict, o.pricing.pricePoint, o.mvp.buildComplexity, o.launch.firstCustomerChannel, o.risks[0]?.description ?? "Unavailable"];
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
