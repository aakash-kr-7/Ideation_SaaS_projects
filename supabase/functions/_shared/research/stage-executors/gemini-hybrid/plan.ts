import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState, ensureMetrics, costBudgetForRun } from "../../pipeline-utils.ts";
import { GeminiRequestError, getGeminiGroundingMode } from "../../gemini.ts";

export async function executeHybridPlan(ctx: StageContext): Promise<StageResult> {
  const { runId, db, startedAt, inputMeta } = ctx;
  const mode = (inputMeta.mode as string) || "quick_scan";

  try {
    // --- Load the research run input ---
    const { data: run, error: runError } = await db
      .from("research_runs")
      .select("idea_name, idea_description, target_customer, market_type")
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

    // --- Initialize pipeline metrics ---
    await ensureMetrics(runId, db);
    const groundingMode = getGeminiGroundingMode();
    await db.from("research_pipeline_metrics").update({
      grounding_mode: groundingMode,
      grounding_degraded: false,
      degraded_providers: [],
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    // Optional and disabled grounding verify only the synthesis dependency.
    // Required mode additionally verifies Google Search grounding.
    const gemini = ctx.dependencies.createGemini();
    const budget = await costBudgetForRun(runId, db, ctx.config);
    const configuredModels = groundingMode === "required"
      ? (await gemini.verifyConfiguration({
        runId,
        budget,
        db,
      })).configuredModels
      : await gemini.verifySynthesisConfiguration({
      runId,
      budget,
      db,
    });

    // --- Update run state ---
    await updateState(runId, "Searching", 5, "Initializing hybrid Gemini pipeline...", db);

    return stageCompleted(
      "grounded_research",
      { opportunityId, planned: true, geminiConfigurationVerified: true, configuredModels, groundingMode },
      { duration_ms: Date.now() - startedAt },
      { nextInputMeta: { opportunityId, mode, groundingMode } }
    );
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const dailyQuota = error instanceof GeminiRequestError && error.quota?.dailyExhausted;
    const transient = !dailyQuota && /429|quota|resource_exhausted|timeout|temporar|unavailable|5\d\d/i.test(message);
    return stageFailed(transient ? "transient" : "permanent", `Failed to plan: ${message}`);
  }
}
