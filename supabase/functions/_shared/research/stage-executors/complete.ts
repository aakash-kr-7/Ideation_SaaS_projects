/**
 * Stage: complete
 *
 * Terminal stage. Finalizes the research run, consumes credits,
 * updates the run to Completed status.
 * Idempotent — duplicate calls are harmless.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";

export async function executeComplete(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, startedAt } = ctx;

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

  // --- Finalize the run via the DB function (idempotent) ---
  const { error: finalizeError } = await db.rpc(
    "finalize_research_run",
    { p_run_id: runId },
  );

  if (finalizeError) {
    return stageFailed("permanent", `Run finalization failed: ${finalizeError.message}`);
  }

  // --- Update pipeline metrics with final totals ---
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
    },
    { duration_ms: Date.now() - startedAt },
  );
}
