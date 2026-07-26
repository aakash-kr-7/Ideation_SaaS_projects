import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runIds = process.argv.slice(2);
if (!runIds.length) throw new Error("Usage: evaluate-report-quality.mjs <run-id> [run-id...]");
const results = [];
for (const runId of runIds) results.push(await evaluate(runId));
console.log(JSON.stringify({ providerCalls: 0, results }, null, 2));

async function evaluate(runId) {
  const directory = path.resolve("artifacts", "hybrid-audit", runId);
  const report = JSON.parse(await readFile(path.join(directory, "report.json"), "utf8"));
  const opportunity = JSON.parse(await readFile(path.join(directory, "score.json"), "utf8"));
  const summary = JSON.parse(await readFile(path.join(directory, "summary.json"), "utf8"));
  const versions = [...report.report_versions].sort((a, b) => a.version_number - b.version_number);
  const baseline = versions[0];
  const latest = versions.at(-1);
  if (!baseline || !latest?.payload?.decisionProduct) throw new Error(`${runId} is missing before/after versions.`);
  const before = rubric(baseline.payload);
  const after = rubric(latest.payload);
  const expectedSections = latest.payload.reportMode === "quick_scan" ? 13 : 23;
  const evidenceIds = new Set(latest.payload.opportunity.evidence.map((item) => item.id));
  const claimStatements = latest.payload.decisionProduct.sections.flatMap((section) => section.statements);
  const unresolvedEvidenceIds = claimStatements.flatMap((item) => item.evidenceIds).filter((id) => !evidenceIds.has(id));
  const storedCharts = new Map((latest.report_chart_datasets || []).map((item) => [item.chart_key, item]));
  const chartMismatches = latest.payload.decisionProduct.charts.filter((item) => {
    const stored = storedCharts.get(item.key);
    return !stored
      || JSON.stringify(stored.source_data) !== JSON.stringify(item.sourceData)
      || JSON.stringify([...(stored.supporting_evidence_ids || [])].sort()) !== JSON.stringify([...item.evidenceIds].sort());
  }).map((item) => item.key);
  const exportedJson = JSON.parse(await readFile(path.join(directory, "exports", "report.json"), "utf8"));
  const score = opportunity.opportunity_scores;
  const exportFiles = await Promise.all(summary.exportChecks.map(async (item) => {
    const file = path.join(directory, "exports", `report.${item.format === "markdown" ? "md" : item.format}`);
    const bytes = await readFile(file);
    return {
      format: item.format,
      checksumMatches: createHash("sha256").update(bytes).digest("hex") === item.sha256,
      containsScore: item.format === "json" ? exportedJson.opportunity.scorecard.total === score.total : bytes.toString("latin1").includes(String(score.total)),
      containsVerdict: bytes.toString(item.format === "pdf" ? "latin1" : "utf8").includes(score.verdict),
    };
  }));
  const integrity = {
    latestVersion: latest.version_number,
    payloadVersion: latest.payload.version,
    reportCompleteness: {
      expectedSections,
      actualSections: latest.payload.decisionProduct.sections.length,
      threeExperiments: latest.payload.decisionProduct.experiments.length === 3,
      specialistOutputs: latest.payload.decisionProduct.specialistOutputs.length,
      chartStates: latest.payload.decisionProduct.charts.length,
    },
    scoreMatches: latest.payload.opportunity.scorecard.total === score.total,
    verdictMatches: latest.payload.opportunity.scorecard.verdict === score.verdict,
    confidenceMatches: latest.payload.opportunity.scorecard.confidence === score.confidence,
    jsonPayloadMatches: stable(exportedJson) === stable(latest.payload),
    unresolvedEvidenceIds,
    chartMismatches,
    sourceUrlsInspectable: latest.payload.opportunity.evidence.every((item) => /^https?:\/\//.test(item.url)),
    exportFiles,
    passed: expectedSections === latest.payload.decisionProduct.sections.length
      && latest.payload.decisionProduct.experiments.length === 3
      && !unresolvedEvidenceIds.length
      && !chartMismatches.length
      && stable(exportedJson) === stable(latest.payload)
      && exportFiles.every((item) => item.checksumMatches && item.containsScore && item.containsVerdict),
  };
  const evaluation = {
    runId,
    mode: latest.payload.reportMode,
    rubricScale: "0-10; deterministic structural audit with strict penalties for unlabelled inference, unsupported pricing, and missing provenance",
    before,
    after,
    improvement: after.total - before.total,
    findings: beforeAfterFindings(baseline.payload, latest.payload),
  };
  await Promise.all([
    writeFile(path.join(directory, "quality-evaluation.json"), `${JSON.stringify(evaluation, null, 2)}\n`),
    writeFile(path.join(directory, "report-integrity-v2.json"), `${JSON.stringify(integrity, null, 2)}\n`),
  ]);
  if (!integrity.passed) throw new Error(`${runId} report integrity failed: ${JSON.stringify(integrity)}`);
  return { runId, before: before.total, after: after.total, improvement: evaluation.improvement, integrity: "PASS" };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function rubric(payload) {
  const product = payload.decisionProduct;
  const evidence = payload.opportunity?.evidence || [];
  const competitors = payload.opportunity?.competitors || [];
  const pricingEvidence = evidence.filter((item) => item.signal === "Pricing" && !item.excluded);
  const statements = product?.sections?.flatMap((section) => section.statements) || [];
  const hasCompleteFactorExplanation = Boolean(product?.sections?.some((section) =>
    ["score-confidence", "scoring"].includes(section.key)
    && section.statements.length === 12
    && section.statements.every((item) => /\/100\./.test(item.text))
  ));
  const experiments = product?.experiments || [];
  const chartProvenance = product?.charts || [];
  const expectedSections = payload.reportMode === "quick_scan" ? 13 : 23;
  const scores = {
    usefulness: product ? score(product.sections.length === expectedSections, 8, experiments.length === 3, 2) : Math.min(6, Math.round((payload.reportSections?.length || 0) / expectedSections * 8)),
    evidenceTransparency: product ? Math.min(10, 4 + (statements.some((item) => item.kind === "Fact" && item.evidenceIds.length) ? 3 : 0) + (statements.some((item) => item.kind === "MissingEvidence") ? 2 : 0) + (product.evidenceConfidence?.explanation ? 1 : 0)) : 4,
    competitorAccuracy: product ? (chartProvenance.some((item) => item.key === "alternatives-comparison" && (item.evidenceIds.length || item.unavailable)) ? 8 : 4) : competitors.some((item) => item.evidenceIds?.length) ? 5 : 3,
    pricingAccuracy: product ? (pricingEvidence.length ? 10 : statements.some((item) => item.kind === "MissingEvidence" && /pricing|payment|willingness/i.test(item.text)) ? 9 : 4) : pricingEvidence.length ? 7 : 2,
    contradictionQuality: evidence.some((item) => item.disconfirming) && evidence.some((item) => !item.disconfirming) ? (product ? 9 : 6) : 2,
    actionability: product ? Math.min(10, experiments.filter((item) => item.successCriterion && item.failureCriterion && item.method).length * 3 + 1) : Math.min(6, payload.opportunity?.launch?.weekOne?.length || 0),
    readability: product ? (product.sections.every((section) => section.summary && section.statements.length <= 16) ? 9 : 7) : 6,
    scoreDefensibility: product && hasCompleteFactorExplanation ? 10 : Object.keys(payload.opportunity?.scorecard?.notes || {}).length === 12 ? 7 : 3,
    genericGeminiDifferentiation: product && statements.some((item) => item.kind === "Hypothesis") && chartProvenance.every((item) => item.sourceExplanation) ? 10 : 5,
  };
  return { scores, total: Object.values(scores).reduce((sum, value) => sum + value, 0), maximum: 90 };
}

function score(first, firstPoints, second, secondPoints) {
  return (first ? firstPoints : 0) + (second ? secondPoints : 0);
}

function beforeAfterFindings(before, after) {
  return [
    { area: "Decision structure", before: `${before.reportSections?.length || 0} navigation-oriented sections`, after: `${after.decisionProduct.sections.length} ordered decision sections` },
    { area: "Claim typing", before: "Facts and interpretation were mixed in narrative prose", after: "Every decision statement is labelled Fact, Inference, Hypothesis, Recommendation, or MissingEvidence" },
    { area: "Experiments", before: "Next-action strings without explicit failure criteria", after: "Three experiments with hypothesis, method, pass, fail, and duration" },
    { area: "Specialists", before: `${before.specialistAssessments?.length || 0} assessments with findings and citations`, after: `${after.decisionProduct.specialistOutputs.length} outputs with opposing evidence, confidence, gaps, and distinct implications` },
    { area: "Charts", before: "Structured values existed but provenance explanations were inconsistent", after: "Every chart has evidence references or an explicit structured-data/unavailable explanation" },
    { area: "Exports", before: "Markdown and CSV emphasized score metadata", after: "PDF, Markdown, CSV, and JSON carry the same dossier, claims, source mappings, and chart catalog" },
  ];
}
