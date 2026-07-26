/**
 * Stage: complete
 *
 * Terminal stage. Finalizes the research run, consumes credits,
 * updates the run to Completed status.
 * Idempotent — duplicate calls are harmless.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { reconcileUsageMetrics } from "../pipeline-utils.ts";

export async function executeComplete(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, startedAt } = ctx;

  // --- Check if already completed ---
  const { data: run } = await db
    .from("research_runs")
    .select("status, terminal_at")
    .eq("id", runId)
    .single();

  if (run?.status === "Completed") {
    return stageCompleted(null, { alreadyCompleted: true }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  if (run?.status === "Failed" || run?.status === "Cancelled") {
    return stageFailed("permanent", `Run is already terminal: ${run.status}`);
  }

  // "Completed" is a customer-facing readiness guarantee, not merely a queue
  // state. Refuse to finalize until the immutable report, charts, and every
  // mode-required export are visible in the production database.
  const { data: report, error: reportError } = await db
    .from("reports")
    .select("id,report_versions(id,version_number,report_exports(format),report_chart_datasets(id))")
    .eq("run_id", runId)
    .maybeSingle();
  if (reportError) return stageFailed("transient", `Report readiness check failed: ${reportError.message}`);
  const versions = Array.isArray(report?.report_versions)
    ? report.report_versions
    : report?.report_versions ? [report.report_versions] : [];
  const latest = [...versions].sort((a: any, b: any) =>
    Number(b.version_number || 0) - Number(a.version_number || 0)
  )[0] as any;
  const persistedFormats = new Set(
    (Array.isArray(latest?.report_exports) ? latest.report_exports : [])
      .map((item: any) => item.format),
  );
  const missingFormats = config.exports.filter((format) => !persistedFormats.has(format));
  const chartCount = Array.isArray(latest?.report_chart_datasets)
    ? latest.report_chart_datasets.length
    : 0;
  if (!report || !latest || missingFormats.length || chartCount < 4) {
    return stageFailed(
      "transient",
      `Report is not publication-ready: report=${Boolean(report)}, version=${Boolean(latest)}, charts=${chartCount}, missing_exports=${missingFormats.join(",") || "none"}`,
    );
  }

  // Rebuild run-level observability from immutable provider usage rows before
  // the terminal job and credit finalization commit atomically.
  const reconciled = await reconcileUsageMetrics(runId, db);

  // The complete_research_job transaction atomically commits this final job and
  // calls finalize_research_run. Compute terminal totals before that transaction.
  const { data: usageTotals } = await db
    .from("api_usage_logs")
    .select("cost")
    .eq("run_id", runId);

  const totalCost = (usageTotals || []).reduce(
    (sum: number, row: any) => sum + Number(row.cost || 0),
    0,
  );

  const { count: sourcesAccepted } = await db
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("excluded", false);

  const { count: evidenceCount } = await db
    .from("evidence_items")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("excluded", false);

  await db
    .from("research_pipeline_metrics")
    .update({
      sources_accepted: sourcesAccepted ?? 0,
      evidence_items_extracted: evidenceCount ?? 0,
      total_provider_cost_usd: totalCost,
      cost_per_accepted_source: sourcesAccepted ? totalCost / sourcesAccepted : null,
      cost_per_accepted_evidence: evidenceCount ? totalCost / evidenceCount : null,
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId);

  // --- Update run with final cost ---
  await db
    .from("research_runs")
    .update({
      total_provider_cost_usd: totalCost,
    })
    .eq("id", runId);

  return stageCompleted(
    null, // Terminal — no next stage
    {
      totalCost,
      sourcesAccepted: sourcesAccepted ?? 0,
      evidenceCount: evidenceCount ?? 0,
      providerCalls: reconciled.providerCalls,
      groundedCallsAttempted: reconciled.groundedCallsAttempted,
      groundedCallsCompleted: reconciled.groundedCallsCompleted,
      groundedCallsQuotaBlocked: reconciled.groundedCallsQuotaBlocked,
      externalSearchCalls: reconciled.externalSearchCalls,
      synthesisCalls: reconciled.synthesisCalls,
    },
    { duration_ms: Date.now() - startedAt },
  );
}
