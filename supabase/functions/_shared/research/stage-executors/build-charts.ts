/**
 * Stage: build_charts
 *
 * Builds structured chart datasets from scored evidence.
 * Persists to report_chart_datasets table. Creates clean interfaces
 * for later chart rendering phases.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted } from "../stages.ts";

export async function executeBuildCharts(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, startedAt, inputMeta, config } = ctx;

  const opportunityId = inputMeta.opportunityId as string;
  const scoreId = inputMeta.scoreId as string;
  const total = inputMeta.total as number;
  const verdict = inputMeta.verdict as string;

  // --- Chart datasets are only built after report version exists ---
  // In this phase, we pre-compute the chart source data and persist
  // the structured datasets. The actual SVG rendering is deferred.

  // --- Load score breakdowns for radar chart ---
  const { data: breakdowns } = await db
    .from("score_breakdowns")
    .select("criterion, score, weight, notes")
    .eq("score_id", scoreId)
    .order("criterion");

  // --- Load evidence distribution for evidence chart ---
  const { data: evidence } = await db
    .from("evidence_items")
    .select("id, signal_type, strength, evidence_family, source_tier, excluded, disconfirming")
    .eq("run_id", runId)
    .eq("excluded", false);

  // --- Build chart source data ---
  const chartDatasets: Array<{
    chart_key: string;
    chart_type: string;
    source_data: any;
    chart_config: any;
    supporting_evidence_ids: string[];
  }> = [];

  // Score radar chart
  if (breakdowns?.length) {
    chartDatasets.push({
      chart_key: "score_radar",
      chart_type: "radar",
      source_data: {
        labels: breakdowns.map((b: any) => b.criterion),
        values: breakdowns.map((b: any) => b.score),
        weights: breakdowns.map((b: any) => b.weight),
        total,
        verdict,
      },
      chart_config: {
        title: "12-Factor Score Breakdown",
        maxValue: 100,
        showWeights: true,
      },
      supporting_evidence_ids: [],
    });
  }

  // Evidence distribution chart
  if (evidence?.length) {
    const bySignalType = evidence.reduce((acc: any, e: any) => {
      acc[e.signal_type] = (acc[e.signal_type] || 0) + 1;
      return acc;
    }, {});

    const byFamily = evidence.reduce((acc: any, e: any) => {
      acc[e.evidence_family] = (acc[e.evidence_family] || 0) + 1;
      return acc;
    }, {});

    const byTier = evidence.reduce((acc: any, e: any) => {
      acc[`tier_${e.source_tier}`] = (acc[`tier_${e.source_tier}`] || 0) + 1;
      return acc;
    }, {});

    chartDatasets.push({
      chart_key: "evidence_distribution",
      chart_type: "bar",
      source_data: {
        bySignalType,
        byFamily,
        byTier,
        total: evidence.length,
        disconfirming: evidence.filter((e: any) => e.disconfirming).length,
      },
      chart_config: {
        title: "Evidence Distribution",
        showTiers: true,
      },
      supporting_evidence_ids: evidence.map((e: any) => e.id),
    });
    chartDatasets.push({
      chart_key: "source_quality_distribution", chart_type: "bar",
      source_data: { byTier, total: evidence.length },
      chart_config: { title: "Source Quality Distribution", unavailable: evidence.length === 0 },
      supporting_evidence_ids: evidence.map((e: any) => e.id),
    });
  }

  if (config.mode === "full_validation") {
    const { data: metrics } = await db.from("research_pipeline_metrics").select("candidates_discovered,pages_attempted,pages_fetched,sources_accepted,evidence_items_extracted").eq("run_id", runId).maybeSingle();
    if (metrics) chartDatasets.push({ chart_key: "source_selection_funnel", chart_type: "funnel", source_data: { candidates: metrics.candidates_discovered, attempted: metrics.pages_attempted, fetched: metrics.pages_fetched, accepted: metrics.sources_accepted, evidence: metrics.evidence_items_extracted }, chart_config: { title: "Research Source-Selection Funnel" }, supporting_evidence_ids: evidence?.map((e: any) => e.id) || [] });
  }

  // Note: competitor_matrix, risk_heatmap, demand_timeline are available
  // in full_validation mode but deferred to the report/chart UX phase.

  return stageCompleted(
    "generate_report",
    {
      chartsBuilt: chartDatasets.length,
      chartKeys: chartDatasets.map((c) => c.chart_key),
    },
    { duration_ms: Date.now() - startedAt },
    {
      nextInputMeta: {
        opportunityId,
        scoreId,
        total,
        verdict,
        chartDatasets,
      },
    },
  );
}
