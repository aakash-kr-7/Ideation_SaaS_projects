import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState, costBudgetForRun } from "../../pipeline-utils.ts";
import {
  GeminiRequestError,
  type GeminiGenerator,
  getGeminiGroundingMode,
} from "../../gemini.ts";
import {
  buildResearchPacks,
  type ResearchPack,
} from "../../external-retrieval.ts";
import { groundedCallLimit, groundingFailureAction } from "../../grounding-policy.ts";
import type { CanonicalResearchBrief } from "../../research-brief.ts";
import { persistResearchCallMetric } from "../../research-call-metrics.ts";
import {
  classifyPackFailure,
  initializeQuickScanPackStatuses,
  knownDailyGroundingQuotaFailure,
  persistQuickScanPackStatus,
  researchUnavailableMessage,
} from "../../quick-scan-reliability.ts";
import {
  initializeFullValidationPackStatuses,
  persistFullValidationPackStatus,
} from "../../full-validation-reliability.ts";

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
    if (mode === "quick_scan") {
      await initializeQuickScanPackStatuses(db, runId);
      if (groundingMode === "disabled") {
        await persistQuickScanPackStatus(db, {
          runId,
          packKey: externalPacks[0]?.key || "quick_primary_problem_buyer_demand",
          status: "provider_failed",
          failureReason: "Grounded research is disabled.",
        });
        return stageFailed(
          "research_unavailable",
          researchUnavailableMessage("provider_failed"),
        );
      }
      if (await knownDailyGroundingQuotaFailure(db)) {
        await persistQuickScanPackStatus(db, {
          runId,
          packKey: externalPacks[0]?.key || "quick_primary_problem_buyer_demand",
          status: "quota_blocked",
          failureReason: "Known daily quota failure; provider call suppressed.",
          metadata: { circuitBreaker: true },
        });
        return stageFailed(
          "research_unavailable",
          researchUnavailableMessage("quota_blocked"),
        );
      }
    }
    if (mode === "full_validation") {
      await initializeFullValidationPackStatuses(db, runId);
      if (groundingMode === "disabled") {
        await persistFullValidationPackStatus(db, {
          runId,
          packKey: externalPacks[0]?.key || "full_buyer_problem",
          status: "provider_failed",
          failureReason: "Grounded research is disabled.",
        });
        return stageFailed(
          "research_unavailable",
          researchUnavailableMessage("provider_failed"),
        );
      }
      if (await knownDailyGroundingQuotaFailure(db)) {
        await persistFullValidationPackStatus(db, {
          runId,
          packKey: externalPacks[0]?.key || "full_buyer_problem",
          status: "quota_blocked",
          failureReason: "Known daily quota failure; provider call suppressed.",
          metadata: { circuitBreaker: true },
        });
        return stageFailed(
          "research_unavailable",
          researchUnavailableMessage("quota_blocked"),
        );
      }
    }
    const groundedPacks = externalPacks.slice(
      0,
      groundedCallLimit(groundingMode as "required" | "optional" | "disabled", mode, externalPacks.length),
    );
    const budget = await costBudgetForRun(runId, db, config);
    let gemini: GeminiGenerator;
    try {
      gemini = ctx.dependencies.createGemini();
    } catch (error) {
      if (mode !== "quick_scan") throw error;
      await persistQuickScanPackStatus(db, {
        runId,
        packKey: externalPacks[0]?.key || "quick_primary_problem_buyer_demand",
        status: "provider_failed",
        failureReason: error instanceof Error ? error.message : String(error),
      });
      return stageFailed(
        "research_unavailable",
        researchUnavailableMessage("provider_failed"),
      );
    }
    const results: Array<{
      taskType: string;
      purpose: string;
      text: string;
      groundingSources: Array<{ url: string; title: string }>;
    }> = [];
    let groundingDegraded = false;
    let quotaBlocked = false;
    const attemptedPackKeys: string[] = [];

    for (const pack of groundedPacks) {
      attemptedPackKeys.push(pack.key);
      const callStartedAt = Date.now();
      if (mode === "quick_scan") {
        await persistQuickScanPackStatus(db, {
          runId,
          packKey: pack.key,
          status: "skipped",
          startedAt: new Date(callStartedAt).toISOString(),
          metadata: { inProgress: true },
        });
      } else if (mode === "full_validation") {
        await persistFullValidationPackStatus(db, {
          runId,
          packKey: pack.key,
          status: "skipped",
          startedAt: new Date(callStartedAt).toISOString(),
          metadata: { inProgress: true },
        });
      }
      try {
        const result = await gemini.generate({
          runId,
          taskType: `grounded_${pack.key}`,
          useGrounding: true,
          budget,
          db,
          systemInstruction: mode === "full_validation"
            ? fullValidationGroundingInstruction(pack.purpose)
            : quickScanGroundingInstruction(pack.purpose),
          prompt: `Research this startup idea for ${pack.focus}.
Canonical research brief (the semantic boundary; do not drift): ${JSON.stringify(researchBrief)}
Name: ${run.idea_name}
Description: ${run.idea_description}
Target customer: ${run.target_customer}
Market: ${run.market_type}
Region: ${run.target_region}
Preferred registry domains: ${registry.map((entry: any) => entry.domain).join(", ")}
Return only evidence about this exact buyer, workflow, problem, and proposition. Attribute each factual statement to a grounded source. If a requested evidence family is absent, say so rather than substituting an adjacent market.`,
        });
        await persistResearchCallMetric(db, {
          runId,
          callPurpose: pack.purpose || pack.focus,
          queryFamily: `grounded_${pack.key}`,
          grounded: true,
          sourcesDiscovered: result.groundingSources.length,
          evidenceFamiliesAdded: [pack.key],
          durationMs: Date.now() - callStartedAt,
        });
        if (mode === "quick_scan") {
          await persistQuickScanPackStatus(db, {
            runId,
            packKey: pack.key,
            status: result.groundingSources.length
              ? "completed"
              : "completed_no_evidence",
            acceptedEvidenceCount: 0,
            startedAt: new Date(callStartedAt).toISOString(),
            metadata: {
              groundedSourcesDiscovered: result.groundingSources.length,
              validationPending: result.groundingSources.length > 0,
            },
          });
        } else if (mode === "full_validation") {
          await persistFullValidationPackStatus(db, {
            runId,
            packKey: pack.key,
            status: result.groundingSources.length
              ? "completed"
              : "completed_no_evidence",
            startedAt: new Date(callStartedAt).toISOString(),
            metadata: {
              groundedSourcesDiscovered: result.groundingSources.length,
              validationPending: result.groundingSources.length > 0,
            },
          });
        }
        if (result.groundingSources.length) {
          results.push({
            taskType: pack.key,
            purpose: pack.purpose || pack.focus,
            text: result.text,
            groundingSources: result.groundingSources,
          });
        } else if (mode !== "quick_scan" && mode !== "full_validation") {
          groundingDegraded = true;
          break;
        }
      } catch (error) {
        const quota = error instanceof GeminiRequestError ? error.quota : null;
        const packFailure = classifyPackFailure(error, quota);
        await persistResearchCallMetric(db, {
          runId,
          callPurpose: pack.purpose || pack.focus,
          queryFamily: `grounded_${pack.key}`,
          grounded: true,
          durationMs: Date.now() - callStartedAt,
          quotaFailure: Boolean(quota),
          providerFailure: packFailure,
          metadata: {
            errorClass: error instanceof GeminiRequestError
              ? error.errorClass
              : "unknown",
            dailyExhausted: Boolean(quota?.dailyExhausted),
          },
        });
        if (mode === "quick_scan") {
          await persistQuickScanPackStatus(db, {
            runId,
            packKey: pack.key,
            status: packFailure,
            failureReason: error instanceof Error ? error.message : String(error),
            startedAt: new Date(callStartedAt).toISOString(),
          });
          return stageFailed(
            "research_unavailable",
            researchUnavailableMessage(packFailure),
          );
        }
        if (mode === "full_validation") {
          await persistFullValidationPackStatus(db, {
            runId,
            packKey: pack.key,
            status: packFailure,
            failureReason: error instanceof Error ? error.message : String(error),
            startedAt: new Date(callStartedAt).toISOString(),
          });
          return stageFailed(
            "research_unavailable",
            researchUnavailableMessage(packFailure),
          );
        }
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
      results.flatMap((result) =>
        result.groundingSources.map((source) => ({
          ...source,
          queryFamily: result.taskType,
        }))
      ).map((source) => [source.url, source]),
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
        attemptedGroundedPackKeys: attemptedPackKeys,
        competitorSeedCategory: inputMeta.competitorSeedCategory,
        competitorSeeds: inputMeta.competitorSeeds,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const dailyQuota = error instanceof GeminiRequestError && error.quota?.dailyExhausted;
    return stageFailed(dailyQuota ? "permanent" : "transient", `Research discovery failed: ${message}`);
  }
}

function quickScanGroundingInstruction(purpose?: ResearchPackPurpose) {
  if (purpose === "adversarial") {
    return "Use Google Search grounding to seek genuine proposition-specific disconfirmation. Test the same buyer, workflow, problem, and proposed value. Look for low urgency, low-friction workarounds, failed or abandoned tools, switching resistance, free alternatives, and occasional use. Unrelated category saturation is not a contradiction. Preserve source attribution and invent nothing.";
  }
  if (purpose === "pricing_wtp") {
    return "Use Google Search grounding for official pricing, exact plan names, payment behaviour, procurement, paid pilots, budget ownership, switching costs, and buyer reachability. Competitor list price is pricing context, never standalone willingness-to-pay proof. Preserve source attribution and invent nothing.";
  }
  return "Use Google Search grounding for the exact buyer, exact workflow, current alternative, pain frequency and severity, behavioural demand, and category activity. Keep the canonical brief as the semantic boundary, preserve source attribution, and invent nothing.";
}

function fullValidationGroundingInstruction(purpose?: ResearchPackPurpose) {
  const common =
    "Use Google Search grounding only. Stay inside the canonical proposition and buyer segment. Separate segments; never transfer evidence between them. Cite every factual statement. Prefer independent primary/official sources and direct buyer voice. Three URLs repeating one underlying claim count as one evidence group. State unresolved gaps; invent nothing.";
  if (purpose === "adversarial") {
    return `${common} Seek genuine proposition-specific disconfirmation, failure patterns, low urgency, workarounds, switching resistance, and invalidating conditions.`;
  }
  if (purpose === "pricing_wtp") {
    return `${common} Verify exact current pricing from official pages. Treat list prices only as pricing context; require purchase, contract, paid-pilot, renewal, or procurement behavior for WTP.`;
  }
  if (purpose === "alternatives_competitors") {
    return `${common} Verify active product, target audience, current positioning, pricing, features, complaints, switching barriers, and category gaps. Do not invent weaknesses.`;
  }
  return common;
}

type ResearchPackPurpose = ResearchPack["purpose"];

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
