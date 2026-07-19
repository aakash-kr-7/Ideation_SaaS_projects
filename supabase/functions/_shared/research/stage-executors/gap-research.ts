/**
 * Stage: gap_research
 *
 * Addresses coverage gaps by building escalation and adversarial queries,
 * then loops back through discover → fetch → extract if needed.
 *
 * Bounded: respects maxGapResearchIterations from mode config.
 * Includes diminishing-return detection.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed, MAX_STAGE_ITERATIONS } from "../stages.ts";
import {
  buildTargetedQueries,
  buildAdversarialQueries,
  buildEscalationQueries,
  deriveFollowUpSeeds,
} from "../retrieval-strategy.ts";
import { costBudgetForRun } from "../pipeline-utils.ts";
import { hasCostBudget } from "../job-queue.ts";

export async function executeGapResearch(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, stageIteration, startedAt, inputMeta } = ctx;
  const maxIterations = config.maxGapResearchIterations ?? MAX_STAGE_ITERATIONS.gap_research ?? 3;

  // --- Check iteration limit ---
  if (stageIteration >= maxIterations) {
    return stageCompleted(
      "build_specialist_packs",
      { reason: "max_gap_iterations", iteration: stageIteration },
      { duration_ms: Date.now() - startedAt },
    );
  }

  // --- Check cost budget ---
  const budget = await costBudgetForRun(runId, db, config);
  if (!hasCostBudget(budget.spent(), config.costLimits.totalUsd, config.costLimits.reasoningReserveUsd)) {
    return stageCompleted(
      "build_specialist_packs",
      { reason: "budget_exhausted" },
      { duration_ms: Date.now() - startedAt },
    );
  }

  // --- Extract gaps from input ---
  const gaps = (inputMeta.gaps as string[]) || [];
  if (gaps.length === 0) {
    return stageCompleted(
      "build_specialist_packs",
      { reason: "no_gaps" },
      { duration_ms: Date.now() - startedAt },
    );
  }

  // --- Load run input and existing evidence ---
  const { data: run } = await db
    .from("research_runs")
    .select("idea_name, idea_description, target_customer, target_region, mode")
    .eq("id", runId)
    .single();

  if (!run) {
    return stageFailed("permanent", "Run not found for gap research");
  }

  const { data: evidence } = await db
    .from("evidence_items")
    .select("id, evidence_family, named_entities, pain_point")
    .eq("run_id", runId)
    .eq("excluded", false);

  // --- Derive follow-up seeds ---
  const seeds = deriveFollowUpSeeds(evidence || []);

  // --- Build escalation queries ---
  const input = {
    ideaName: run.idea_name,
    ideaDescription: run.idea_description,
    targetCustomer: run.target_customer,
    marketType: run.mode || "b2b",
    targetRegion: run.target_region,
    mode: run.mode,
  };

  const escalationQueries = buildEscalationQueries(input, gaps, seeds);

  // Also build targeted and adversarial if needed
  const needsTargeted = gaps.some(
    (g) => g.includes("problem-space") || g.includes("solution-space"),
  );
  const needsAdversarial = gaps.some(
    (g) => g.includes("disconfirming") || g.includes("disconfirmation"),
  );

  const additionalQueries = [
    ...(needsTargeted ? buildTargetedQueries(seeds) : []),
    ...(needsAdversarial ? buildAdversarialQueries(input, seeds) : []),
  ];

  const allNewQueries = [...escalationQueries, ...additionalQueries].slice(0, 6);

  if (allNewQueries.length === 0) {
    // No new queries to generate — diminishing returns
    return stageCompleted(
      "build_specialist_packs",
      { reason: "no_queries_generated", gaps },
      { duration_ms: Date.now() - startedAt },
    );
  }

  // --- Persist new queries ---
  const passNumber = stageIteration < 1 ? 2 : 3; // Use pass 2 for targeted, 3 for adversarial
  let queriesInserted = 0;

  for (const query of allNewQueries) {
    const { error } = await db.from("research_queries").upsert(
      {
        run_id: runId,
        pass_number: passNumber,
        evidence_family: query.family,
        objective: query.objective,
        query: query.query,
        triggered_by_evidence_ids: query.triggeredByEvidenceIds || [],
        status: "Running",
        result_count: 0,
      },
      { onConflict: "run_id,pass_number,query", ignoreDuplicates: true },
    );
    if (!error) queriesInserted++;
  }

  // --- Create a research_pass record for this iteration ---
  await db.from("research_passes").upsert(
    {
      run_id: runId,
      pass_number: passNumber,
      objective: passNumber === 2 ? "targeted" : "disconfirming",
      query_count: queriesInserted,
      status: "Running",
      started_at: new Date().toISOString(),
    },
    { onConflict: "run_id,pass_number" },
  );

  // --- Loop back to discover_candidates to execute the new queries ---
  // This triggers the discover → rank → fetch → extract → deduplicate → check_coverage cycle
  // After coverage is rechecked, gap_research will be called again if still insufficient
  return stageCompleted(
    "discover_candidates",
    { queriesInserted, gaps, passNumber, iteration: stageIteration },
    { duration_ms: Date.now() - startedAt },
    {
      nextStageIteration: 0, // Reset discover iteration for the new pass
      nextInputMeta: {
        gapResearchIteration: stageIteration + 1,
        fromGapResearch: true,
      },
    },
  );
}
