import type { PipelineStage, StageContext, StageExecutor, StageResult } from "./stages.ts";
import { stageFailed } from "./stages.ts";
import { executeHybridPlan } from "./stage-executors/gemini-hybrid/plan.ts";
import { executeHybridGroundedResearch } from "./stage-executors/gemini-hybrid/grounded-research.ts";
import { executeHybridEvidenceBoosters } from "./stage-executors/gemini-hybrid/evidence-boosters.ts";
import { executeHybridValidateNormalize } from "./stage-executors/gemini-hybrid/validate-normalize.ts";
import { executeHybridAnalyzeScore } from "./stage-executors/gemini-hybrid/analyze-score.ts";
import { executeGenerateReport } from "./stage-executors/generate-report.ts";
import { executeGenerateExports } from "./stage-executors/generate-exports.ts";
import { executeComplete } from "./stage-executors/complete.ts";

export const STAGE_EXECUTORS: Record<PipelineStage, StageExecutor> = {
  plan: executeHybridPlan,
  grounded_research: executeHybridGroundedResearch,
  evidence_boosters: executeHybridEvidenceBoosters,
  validate_normalize: executeHybridValidateNormalize,
  analyze_score: executeHybridAnalyzeScore,
  generate_report: executeGenerateReport,
  generate_exports: executeGenerateExports,
  complete: executeComplete,
};

export async function executeStage(stage: PipelineStage, ctx: StageContext): Promise<StageResult> {
  try {
    return await STAGE_EXECUTORS[stage](ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const metrics = { duration_ms: Date.now() - ctx.startedAt };
    if (/cost cap|budget/i.test(message)) return stageFailed("budget", message, metrics);
    if (/timeout|timed out|deadline/i.test(message)) return stageFailed("timeout", message, metrics);
    if (/401|403|api key|invalid request|schema|validation/i.test(message)) return stageFailed("permanent", message, metrics);
    return stageFailed("transient", message, metrics);
  }
}
