import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState, costBudgetForRun } from "../../pipeline-utils.ts";

export async function executeHybridGroundedResearch(ctx: StageContext): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta } = ctx;
  const opportunityId = String(inputMeta.opportunityId || "");
  const mode = String(inputMeta.mode || "quick_scan");
  try {
    await updateState(runId, "Searching", 30, "Running Gemini grounded research", db);
    const { data: run, error } = await db.from("research_runs").select("idea_name,idea_description,target_customer,market_type,target_region,assumptions").eq("id", runId).single();
    if (error || !run) return stageFailed("permanent", `Run not found: ${error?.message || "missing"}`);
    const depth = mode === "full_validation"
      ? "Cover customer pain and behavior, demand, alternatives and competitors, pricing and willingness to pay, market context, GTM patterns, platform/regulatory/execution risk, failed approaches, and strong disconfirming evidence."
      : "Cover problem severity, demand, alternatives and competitors, pricing or willingness to pay, and at least one serious disconfirming signal.";
    const result = await ctx.dependencies.createGemini().generate({
      runId, taskType: "grounded_research", useGrounding: true,
      budget: await costBudgetForRun(runId, db, config), db,
      systemInstruction: "Act as a skeptical market researcher. Use Google Search grounding, distinguish observations from inference, and include both supporting and disconfirming evidence.",
      prompt: `Research this startup idea at ${mode === "full_validation" ? "comprehensive" : "screening"} depth.\nName: ${run.idea_name}\nDescription: ${run.idea_description}\nTarget customer: ${run.target_customer}\nMarket: ${run.market_type}\nRegion: ${run.target_region}\nAssumptions: ${JSON.stringify(run.assumptions || {})}\n\n${depth}`,
    });
    if (!result.groundingSources.length) return stageFailed("permanent", "Gemini grounding returned no attributable web sources.");
    return stageCompleted("evidence_boosters", {
      research_summary: result.text, sources_count: result.groundingSources.length,
    }, {
      candidates_discovered: result.groundingSources.length, sources_accepted: result.groundingSources.length,
      duration_ms: Date.now() - startedAt,
    }, { nextInputMeta: {
      opportunityId, mode, rawGeminiText: result.text, groundingSources: result.groundingSources,
      targetCustomer: run.target_customer, marketType: run.market_type, ideaName: run.idea_name,
    } });
  } catch (error) {
    return stageFailed("transient", `Grounded research failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
