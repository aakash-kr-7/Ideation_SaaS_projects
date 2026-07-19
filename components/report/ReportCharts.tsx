"use client";

import type { ValidationReport } from "@/lib/report-schema";

export type ReportChartDataset = {
  chartKey: string;
  chartType: string;
  sourceData: Record<string, unknown>;
  chartConfig: Record<string, unknown>;
  supportingEvidenceIds: string[];
};

type Datum = { label: string; value: number; note?: string };

function titleFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function objectData(value: unknown): Datum[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => typeof entry === "number")
    .map(([label, entry]) => ({ label: titleFor(label.replace(/^tier_/, "Tier ")), value: finite(entry) }));
}

function fallbackCharts(report: ValidationReport): ReportChartDataset[] {
  const evidence = report.opportunity.evidence.filter((item) => !item.excluded);
  const byTier = evidence.reduce<Record<string, number>>((all, item) => {
    const tier = `tier_${item.sourceTier ?? 4}`;
    all[tier] = (all[tier] ?? 0) + 1;
    return all;
  }, {});
  const byFamily = evidence.reduce<Record<string, number>>((all, item) => {
    const family = item.evidenceFamily ?? "unclassified";
    all[family] = (all[family] ?? 0) + 1;
    return all;
  }, {});
  const bySignal = evidence.reduce<Record<string, number>>((all, item) => {
    all[item.signal] = (all[item.signal] ?? 0) + 1;
    return all;
  }, {});
  return [
    { chartKey: "score_breakdown", chartType: "bar", sourceData: { values: report.opportunity.scorecard.scores }, chartConfig: { title: "Score contribution by criterion", maxValue: 100 }, supportingEvidenceIds: [] },
    { chartKey: "evidence_balance", chartType: "bar", sourceData: { supporting: evidence.filter((item) => !item.disconfirming).length, contradictory: evidence.filter((item) => item.disconfirming).length }, chartConfig: { title: "Evidence balance" }, supportingEvidenceIds: evidence.map((item) => item.id) },
    { chartKey: "source_quality_distribution", chartType: "bar", sourceData: { byTier }, chartConfig: { title: "Source quality distribution" }, supportingEvidenceIds: evidence.map((item) => item.id) },
    { chartKey: "evidence_coverage", chartType: "bar", sourceData: { byFamily, bySignal }, chartConfig: { title: "Evidence coverage" }, supportingEvidenceIds: evidence.map((item) => item.id) },
  ];
}

function chartData(chart: ReportChartDataset): Datum[] {
  const data = chart.sourceData;
  if (Array.isArray(data.labels) && Array.isArray(data.values)) {
    const values = data.values as unknown[];
    return data.labels.map((label, index) => ({ label: String(label), value: finite(values[index]) }));
  }
  if (chart.chartKey === "source_selection_funnel") return objectData(data);
  if (chart.chartKey === "evidence_coverage") return objectData(data.byFamily).concat(objectData(data.bySignal));
  return objectData(data.byTier).length ? objectData(data.byTier) : objectData(data.values).length ? objectData(data.values) : objectData(data);
}

export function ReportCharts({ report, datasets = [] }: { report: ValidationReport; datasets?: ReportChartDataset[] }) {
  const charts = datasets.length ? datasets : fallbackCharts(report);
  return <section className="report-charts" aria-label="Evidence-based charts">
    <header><p className="eyebrow">Chart desk</p><h3>What the evidence distribution says</h3><p>Each chart is rendered from the persisted report dataset{datasets.length ? "" : " or this frozen sample report's schema-backed evidence"}.</p></header>
    <div className="report-chart-grid">
      {charts.slice(0, report.reportMode === "quick_scan" ? 4 : 6).map((chart) => {
        const data = chartData(chart);
        const max = Math.max(...data.map((item) => item.value), 1);
        return <figure className="report-chart" key={chart.chartKey}>
          <figcaption><span>{chart.chartType}</span><b>{String(chart.chartConfig.title ?? titleFor(chart.chartKey))}</b><small>{chart.supportingEvidenceIds.length ? `${chart.supportingEvidenceIds.length} linked evidence item${chart.supportingEvidenceIds.length === 1 ? "" : "s"}` : "Deterministic score inputs"}</small></figcaption>
          {data.length ? <div className="chart-bars" role="img" aria-label={`${titleFor(chart.chartKey)} chart: ${data.map((item) => `${item.label}, ${item.value}`).join("; ")}`}>
            {data.slice(0, 12).map((item) => <div className="chart-bar" key={item.label}>
              <span title={item.label}>{titleFor(item.label)}</span><i><b style={{ width: `${Math.max(4, (item.value / max) * 100)}%` }} /></i><strong>{item.value}</strong>
            </div>)}
          </div> : <p className="chart-empty">No chartable evidence was persisted for this report.</p>}
          {data.length > 0 && <details><summary>Accessible values</summary><table><tbody>{data.map((item) => <tr key={item.label}><th>{titleFor(item.label)}</th><td>{item.value}</td></tr>)}</tbody></table></details>}
        </figure>;
      })}
    </div>
  </section>;
}
