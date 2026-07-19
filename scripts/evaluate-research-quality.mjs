import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const resultsDir = resolve(root, process.argv[2] || "evaluation/results");
const outputPath = resolve(root, process.argv[3] || "evaluation/latest-summary.json");
const files = (await readdir(resultsDir, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isFile() && entry.name.endsWith(".json"));
const reports = await Promise.all(files.map(async (entry) => JSON.parse(await readFile(resolve(resultsDir, entry.name), "utf8"))));
const score = (report) => {
  const evidence = report.opportunity?.evidence?.filter((item) => !item.excluded) || [];
  const urls = new Set(evidence.map((item) => item.url).filter(Boolean));
  const domains = new Set([...urls].map((url) => { try { return new URL(url).hostname; } catch { return url; } }));
  const checks = {
    citationAccuracy: evidence.every((item) => Boolean(item.url && item.title)),
    contradictionDiscovery: evidence.some((item) => item.disconfirming),
    sourceDiversity: domains.size >= 2,
    fieldCompleteness: Boolean(report.executiveSummary && report.methodology && report.opportunity?.scorecard?.verdict),
    scoreConsistency: typeof report.opportunity?.scorecard?.total === "number" && report.opportunity.scorecard.total >= 0 && report.opportunity.scorecard.total <= 100,
    chartIntegrity: Array.isArray(report.chartDatasets) ? report.chartDatasets.every((chart) => chart.chartKey && chart.sourceData) : "not-recorded",
  };
  return { id: report.id, mode: report.reportMode, acceptedSources: urls.size, independentDomains: domains.size, evidenceItems: evidence.length, checks };
};
const summary = { generatedAt: new Date().toISOString(), reportCount: reports.length, results: reports.map(score) };
await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
