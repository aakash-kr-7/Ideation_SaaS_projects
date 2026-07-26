import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState, costBudgetForRun } from "../../pipeline-utils.ts";
import { GeminiRequestError, getGeminiGroundingMode } from "../../gemini.ts";
import { buildResearchPacks } from "../../external-retrieval.ts";
import { groundedCallLimit, groundingFailureAction } from "../../grounding-policy.ts";
import type { CanonicalResearchBrief } from "../../research-brief.ts";

export async function executeHybridGroundedResearch(ctx: StageContext): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta } = ctx;
  const opportunityId = String(inputMeta.opportunityId || "");
  const mode = String(inputMeta.mode || "quick_scan");
  const researchBrief = inputMeta.researchBrief as CanonicalResearchBrief | undefined;
  const groundingMode = String(inputMeta.groundingMode || getGeminiGroundingMode());
  try {
    await updateState(
      runId,
      "Searching",
      30,
      groundingMode === "disabled" ? "Preparing external source discovery" : "Attempting optional Gemini grounding booster",
      db,
    );
    const { data: registry, error: registryError } = await db.from("source_registry")
      .select("domain,evidence_families,quality_tier,source_class")
      .eq("enabled", true)
      .order("quality_tier", { ascending: true })
      .limit(24);
    if (registryError) return stageFailed("permanent", `Source Registry unavailable: ${registryError.message}`);
    if (!registry?.length) return stageFailed("permanent", "Source Registry is empty; fresh-reset seed data is required.");
    const { data: run, error } = await db.from("research_runs")
      .select("idea_name,idea_description,target_customer,market_type,target_region,assumptions")
      .eq("id", runId)
      .single();
    if (error || !run) return stageFailed("permanent", `Run not found: ${error?.message || "missing"}`);

    if (!researchBrief) return stageFailed("permanent", "Canonical research brief is missing before discovery.");
    const externalPacks = buildResearchPacks(run, mode, researchBrief);
    const groundedPacks = externalPacks.slice(
      0,
      groundedCallLimit(groundingMode as "required" | "optional" | "disabled", mode, externalPacks.length),
    );
    const budget = await costBudgetForRun(runId, db, config);
    const gemini = ctx.dependencies.createGemini();
    const results: Array<{ taskType: string; text: string; groundingSources: Array<{ url: string; title: string }> }> = [];
    let groundingDegraded = false;
    let quotaBlocked = false;

    for (const pack of groundedPacks) {
      try {
        const result = await gemini.generate({
          runId,
          taskType: `grounded_${pack.key}`,
          useGrounding: true,
          budget,
          db,
          systemInstruction: "Act as a skeptical research booster. Use Google Search grounding and preserve source attribution. Do not invent sources.",
          prompt: `Research this startup idea for ${pack.focus}.
Canonical research brief (the semantic boundary; do not drift): ${JSON.stringify(researchBrief)}
Name: ${run.idea_name}
Description: ${run.idea_description}
Target customer: ${run.target_customer}
Market: ${run.market_type}
Region: ${run.target_region}
Preferred registry domains: ${registry.map((entry: any) => entry.domain).join(", ")}`,
        });
        if (result.groundingSources.length) {
          results.push({ taskType: pack.key, text: result.text, groundingSources: result.groundingSources });
        } else if (groundingMode === "required") {
          return stageFailed("permanent", `${pack.key} returned no attributable Google Search grounding metadata.`);
        } else {
          groundingDegraded = true;
          break;
        }
      } catch (error) {
        const quota = error instanceof GeminiRequestError ? error.quota : null;
        const action = groundingFailureAction(
          groundingMode as "required" | "optional" | "disabled",
          quota,
          error instanceof Error ? error.message : String(error),
        );
        if (action === "degrade") {
          groundingDegraded = true;
          quotaBlocked = true;
          break;
        }
        if (action === "fail") {
          return stageFailed("permanent", `Required Google Search grounding is unavailable for the current run.`);
        }
        throw error;
      }
    }

    const groundingSources = [...new Map(
      results.flatMap((result) => result.groundingSources).map((source) => [source.url, source]),
    ).values()];
    const combinedResearch = results.map((result) => `## Grounding booster: ${result.taskType}\n${result.text}`).join("\n\n");
    await persistGroundingState(db, runId, {
      mode: groundingMode,
      degraded: groundingDegraded,
      quotaBlocked,
    });
    return stageCompleted("evidence_boosters", {
      research_summary: combinedResearch,
      sources_count: groundingSources.length,
      groundingMode,
      groundingDegraded,
      groundedPacks: results.map((result) => ({ taskType: result.taskType, sourceCount: result.groundingSources.length })),
      registryRowsRead: registry.length,
      registryDomainsUsed: registry.map((entry: any) => entry.domain),
    }, {
      candidates_discovered: groundingSources.length,
      sources_accepted: 0,
      provider_fallbacks: groundingDegraded ? 1 : 0,
      duration_ms: Date.now() - startedAt,
    }, {
      nextInputMeta: {
        opportunityId,
        mode,
        groundingMode,
        groundingDegraded,
        rawGroundingText: combinedResearch,
        groundingSources,
        researchPacks: externalPacks,
        targetCustomer: run.target_customer,
        targetRegion: run.target_region,
        marketType: run.market_type,
        ideaName: run.idea_name,
        runInput: run,
        researchBrief,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const dailyQuota = error instanceof GeminiRequestError && error.quota?.dailyExhausted;
    return stageFailed(dailyQuota ? "permanent" : "transient", `Research discovery failed: ${message}`);
  }
}

async function persistGroundingState(
  db: any,
  runId: string,
  state: { mode: string; degraded: boolean; quotaBlocked: boolean },
) {
  const { data: logs } = await db.from("api_usage_logs")
    .select("status,grounded_search_requested,grounding_metadata_present,quota_metric")
    .eq("run_id", runId)
    .eq("grounded_search_requested", true);
  const rows = logs || [];
  await db.from("research_pipeline_metrics").update({
    grounding_mode: state.mode,
    grounding_degraded: state.degraded,
    grounded_calls_attempted: rows.length,
    grounded_calls_completed: rows.filter((row: any) => row.status === "success" && row.grounding_metadata_present).length,
    grounded_calls_quota_blocked: rows.filter((row: any) => row.quota_metric).length,
    provider_fallback_count: state.degraded ? 1 : 0,
    degraded_providers: state.degraded ? ["gemini_search_grounding"] : [],
    updated_at: new Date().toISOString(),
  }).eq("run_id", runId);
}
