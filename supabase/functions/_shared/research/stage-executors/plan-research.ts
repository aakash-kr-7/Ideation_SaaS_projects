/**
 * Stage: plan_research
 *
 * Creates the opportunity row and generates the initial query plan.
 * Idempotent: checks for existing opportunity before creating.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { buildIdeaAwareQueries } from "../retrieval-strategy.ts";
import { ensureMetrics } from "../pipeline-utils.ts";

export async function executePlanResearch(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db } = ctx;

  // --- Load the research run input ---
  const { data: run, error: runError } = await db
    .from("research_runs")
    .select("idea_name, idea_description, target_customer, market_type, target_region, mode")
    .eq("id", runId)
    .single();

  if (runError || !run) {
    return stageFailed("permanent", `Run not found: ${runError?.message ?? "missing"}`);
  }

  // --- Idempotency: check if opportunity already exists ---
  const { data: existingOpp } = await db
    .from("opportunities")
    .select("id")
    .eq("run_id", runId)
    .maybeSingle();

  let opportunityId: string;

  if (existingOpp?.id) {
    opportunityId = existingOpp.id;
  } else {
    const { data: opp, error: oppError } = await db
      .from("opportunities")
      .insert({
        run_id: runId,
        name: run.idea_name,
        one_liner: run.idea_description.slice(0, 240),
        target_customer: run.target_customer,
        core_pain: run.idea_description.slice(0, 240),
        market: run.market_type,
      })
      .select("id")
      .single();

    if (oppError || !opp) {
      return stageFailed("permanent", `Opportunity insert failed: ${oppError?.message}`);
    }
    opportunityId = opp.id;
  }

  // --- Generate query plan ---
  const input = {
    ideaName: run.idea_name,
    ideaDescription: run.idea_description,
    targetCustomer: run.target_customer,
    marketType: run.market_type,
    targetRegion: run.target_region,
    mode: run.mode,
  };

  const broadQueries = buildIdeaAwareQueries(input);

  // Persist planned queries (idempotent via ON CONFLICT on unique fields)
  for (const query of broadQueries) {
    await db.from("research_queries").upsert(
      {
        run_id: runId,
        pass_number: 1,
        evidence_family: query.family,
        query_family: query.queryFamily || null,
        objective: query.objective,
        query: query.query,
        triggered_by_evidence_ids: query.triggeredByEvidenceIds,
        status: "Running",
        result_count: 0,
      },
      { onConflict: "run_id,pass_number,query", ignoreDuplicates: true },
    );
  }

  // --- Initialize pipeline metrics ---
  await ensureMetrics(runId, db);

  // --- Update run state ---
  await db
    .from("research_runs")
    .update({
      status: "Researching",
      progress: 5,
      progress_detail: "Research plan created",
      current_stage: "plan_research",
      current_stage_started_at: new Date().toISOString(),
      last_progress_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return stageCompleted(
    "discover_candidates",
    {
      opportunityId,
      queryCount: broadQueries.length,
      input,
    },
    { duration_ms: Date.now() - ctx.startedAt },
    { nextInputMeta: { opportunityId, queryPlanGenerated: true } },
  );
}
