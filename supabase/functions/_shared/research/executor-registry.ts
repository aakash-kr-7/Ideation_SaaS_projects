/**
 * Stage executor registry — maps pipeline stages to their executor functions.
 *
 * Each executor is a standalone module that:
 * 1. Checks for already-persisted output (idempotency)
 * 2. Executes the stage-specific business logic
 * 3. Returns a StageResult with the next stage transition
 *
 * Executors reuse validated business logic from the existing pipeline modules.
 */

import type { PipelineStage, StageContext, StageExecutor, StageResult } from "./stages.ts";
import { stageFailed } from "./stages.ts";
import { executePlanResearch } from "./stage-executors/plan-research.ts";
import { executeDiscoverCandidates } from "./stage-executors/discover-candidates.ts";
import { executeRankCandidates } from "./stage-executors/rank-candidates.ts";
import { executeFetchSources } from "./stage-executors/fetch-sources.ts";
import { executeExtractEvidence } from "./stage-executors/extract-evidence.ts";
import { executeDeduplicateCluster } from "./stage-executors/deduplicate-cluster.ts";
import { executeCheckCoverage } from "./stage-executors/check-coverage.ts";
import { executeGapResearch } from "./stage-executors/gap-research.ts";
import { executeBuildSpecialistPacks } from "./stage-executors/build-specialist-packs.ts";
import { executeRunSpecialists } from "./stage-executors/run-specialists.ts";
import { executeComputeScoring } from "./stage-executors/compute-scoring.ts";
import { executeBuildCharts } from "./stage-executors/build-charts.ts";
import { executeGenerateReport } from "./stage-executors/generate-report.ts";
import { executeGenerateExports } from "./stage-executors/generate-exports.ts";
import { executeComplete } from "./stage-executors/complete.ts";

/**
 * Registry mapping each pipeline stage to its executor function.
 */
export const STAGE_EXECUTORS: Record<PipelineStage, StageExecutor> = {
  plan_research: executePlanResearch,
  discover_candidates: executeDiscoverCandidates,
  rank_candidates: executeRankCandidates,
  fetch_sources: executeFetchSources,
  extract_evidence: executeExtractEvidence,
  deduplicate_cluster: executeDeduplicateCluster,
  check_coverage: executeCheckCoverage,
  gap_research: executeGapResearch,
  build_specialist_packs: executeBuildSpecialistPacks,
  run_specialists: executeRunSpecialists,
  compute_scoring: executeComputeScoring,
  build_charts: executeBuildCharts,
  generate_report: executeGenerateReport,
  generate_exports: executeGenerateExports,
  complete: executeComplete,
};

/**
 * Execute a stage with standardized error handling.
 * Catches exceptions and converts them to StageResult failures.
 */
export async function executeStage(
  stage: PipelineStage,
  ctx: StageContext,
): Promise<StageResult> {
  const executor = STAGE_EXECUTORS[stage];
  if (!executor) {
    return stageFailed("permanent", `No executor found for stage: ${stage}`);
  }

  try {
    return await executor(ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Classify the error
    if (/cost cap|budget/i.test(message)) {
      return stageFailed("budget", message, {
        duration_ms: Date.now() - ctx.startedAt,
      });
    }
    if (/timeout|timed out|deadline/i.test(message)) {
      return stageFailed("timeout", message, {
        duration_ms: Date.now() - ctx.startedAt,
      });
    }
    if (/429|too many requests|rate limit/i.test(message)) {
      return stageFailed("transient", message, {
        duration_ms: Date.now() - ctx.startedAt,
      });
    }
    if (
      /network|fetch|ECONNREFUSED|ENOTFOUND|socket/i.test(message)
    ) {
      return stageFailed("transient", message, {
        duration_ms: Date.now() - ctx.startedAt,
      });
    }

    // Default to transient for unknown errors (allows retry)
    return stageFailed("transient", message, {
      duration_ms: Date.now() - ctx.startedAt,
    });
  }
}
