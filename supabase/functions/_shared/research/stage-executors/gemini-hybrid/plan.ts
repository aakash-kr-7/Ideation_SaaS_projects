import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState, ensureMetrics, costBudgetForRun } from "../../pipeline-utils.ts";
import { GeminiRequestError, getGeminiGroundingMode } from "../../gemini.ts";
import { buildCanonicalResearchBrief } from "../../research-brief.ts";
import { seedsForBrief } from "../../competitor-seeds.ts";
import {
  classifyPackFailure,
  initializeQuickScanPackStatuses,
  persistQuickScanPackStatus,
  researchUnavailableMessage,
} from "../../quick-scan-reliability.ts";
import {
  initializeFullValidationPackStatuses,
  persistFullValidationPackStatus,
  persistFullValidationPropositions,
} from "../../full-validation-reliability.ts";
import {
  decomposeFullValidationPropositions,
} from "../../full-validation-research-strategy.ts";

export async function executeHybridPlan(ctx: StageContext): Promise<StageResult> {
  const { runId, db, startedAt, inputMeta } = ctx;
  const mode = (inputMeta.mode as string) || "quick_scan";

  try {
    // --- Load the research run input ---
    const { data: run, error: runError } = await db
      .from("research_runs")
      .select("idea_name, idea_description, target_customer, market_type, target_region, assumptions")
      .eq("id", runId)
      .single();

    if (runError || !run) {
      return stageFailed("permanent", `Run not found: ${runError?.message ?? "missing"}`);
    }

    const researchBrief = buildCanonicalResearchBrief(run);
    const { error: briefError } = await db.from("research_briefs").upsert({
      run_id: runId,
      exact_product_proposition: researchBrief.exactProductProposition,
      target_buyer: researchBrief.targetBuyer,
      end_user: researchBrief.endUser,
      workflow_changed: researchBrief.workflowChanged,
      problem_solved: researchBrief.problemSolved,
      expected_outcome: researchBrief.expectedOutcome,
      industry: researchBrief.industry,
      geography: researchBrief.geography,
      business_model: researchBrief.businessModel,
      direct_competitor_category: researchBrief.directCompetitorCategory,
      adjacent_out_of_scope_categories: researchBrief.adjacentOutOfScopeCategories,
      terminology: researchBrief.terminology,
      dimension_keywords: researchBrief.dimensionKeywords,
      brief: researchBrief,
      updated_at: new Date().toISOString(),
    }, { onConflict: "run_id" });
    if (briefError) return stageFailed("permanent", `Canonical research brief persistence failed: ${briefError.message}`);

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

    const competitorSeeds = seedsForBrief(researchBrief);
    if (competitorSeeds.candidates.length) {
      const { error: seedError } = await db.from("competitors").upsert(
        competitorSeeds.candidates.map((seed) => ({
          opportunity_id: opportunityId,
          name: seed.candidateName,
          positioning: "Not live verified",
          pricing: "Not live verified",
          target: "Not live verified",
          strength: "Known category candidate; current capabilities were not verified.",
          gap: "Current pricing and positioning require live verification.",
          classification: seed.candidateType === "direct" ? "direct" : "adjacent",
          comparability: {
            seededCandidate: true,
            verificationState: "unverified_seed",
          },
          evidence_ids: [],
          verification_status: "unverified_seed",
          verified_at: null,
          category_id: seed.categoryId,
          canonical_homepage: seed.canonicalHomepage,
          category_rationale: seed.categoryRationale,
          candidate_type: seed.candidateType,
          seed_last_reviewed_at: seed.lastReviewed.date,
        })),
        { onConflict: "opportunity_id,name" },
      );
      if (seedError) {
        return stageFailed(
          "permanent",
          `Competitor seed persistence failed: ${seedError.message}`,
        );
      }
    }

    // --- Initialize pipeline metrics ---
    await ensureMetrics(runId, db);
    if (mode === "quick_scan") {
      await initializeQuickScanPackStatuses(db, runId);
    } else if (mode === "full_validation") {
      await initializeFullValidationPackStatuses(db, runId);
      await persistFullValidationPropositions(
        db,
        runId,
        decomposeFullValidationPropositions(researchBrief),
      );
    }
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
    const configuredModels = groundingMode === "required" &&
        mode === "full_validation"
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
      {
        opportunityId,
        planned: true,
        geminiConfigurationVerified: true,
        configuredModels,
        groundingMode,
        researchBriefPersisted: true,
        competitorSeedCategory: competitorSeeds.categoryId,
        competitorSeedsLoaded: competitorSeeds.candidates.length,
      },
      { duration_ms: Date.now() - startedAt },
      {
        nextInputMeta: {
          opportunityId,
          mode,
          groundingMode,
          researchBrief,
          competitorSeedCategory: competitorSeeds.categoryId,
          competitorSeeds: competitorSeeds.candidates,
        },
      }
    );
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error);
    const dailyQuota = error instanceof GeminiRequestError && error.quota?.dailyExhausted;
    if (
      (mode === "quick_scan" || mode === "full_validation") &&
      (error instanceof GeminiRequestError ||
        /GEMINI_API_KEY|authentication|unauthorized|forbidden|429|quota|resource_exhausted|timeout|temporar|unavailable|5\d\d/i.test(message))
    ) {
      const packFailure = classifyPackFailure(
        error,
        error instanceof GeminiRequestError ? error.quota : null,
      );
      if (mode === "quick_scan") {
        await initializeQuickScanPackStatuses(db, runId);
        await persistQuickScanPackStatus(db, {
          runId,
          packKey: "quick_primary_problem_buyer_demand",
          status: packFailure,
          failureReason: message,
          metadata: { failedDuringProviderPreflight: true },
        });
      } else {
        await initializeFullValidationPackStatuses(db, runId);
        await persistFullValidationPackStatus(db, {
          runId,
          packKey: "full_buyer_problem",
          status: packFailure,
          failureReason: message,
          metadata: { failedDuringProviderPreflight: true },
        });
      }
      return stageFailed(
        "research_unavailable",
        researchUnavailableMessage(packFailure),
      );
    }
    const transient = !dailyQuota && /429|quota|resource_exhausted|timeout|temporar|unavailable|5\d\d/i.test(message);
    return stageFailed(transient ? "transient" : "permanent", `Failed to plan: ${message}`);
  }
}
