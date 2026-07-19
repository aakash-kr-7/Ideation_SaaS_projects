/**
 * Stage: extract_evidence
 *
 * Batched LLM evidence extraction from fetched sources.
 * Uses Groq/Cerebras to extract structured evidence items.
 * Supports multiple iterations with adaptive batch sizing.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed, BATCH_DEFAULTS, adaptBatchSize, MAX_STAGE_ITERATIONS } from "../stages.ts";
import { createAnalysisProvider } from "../providers.ts";
import { callProvider, costBudgetForRun, chunk } from "../pipeline-utils.ts";
import { classifySourceTier, classifyMarketSizeSource, isVerifiableMarketSizeFigure } from "../retrieval-strategy.ts";
import { hasTimeBudget, hasCostBudget } from "../job-queue.ts";
import { sourceAcceptance } from "../retrieval.ts";

export async function executeExtractEvidence(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, stageIteration, batchIndex, startedAt } = ctx;
  const maxIterations = MAX_STAGE_ITERATIONS.extract_evidence ?? 15;

  if (stageIteration >= maxIterations) {
    return stageCompleted("deduplicate_cluster", { reason: "max_iterations" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Load fetched but unextracted sources ---
  const { data: sources, error: srcError } = await db
    .from("sources")
    .select("id, url, title, text_content, evidence_family, research_pass, source_tier, source_domain, research_query_id")
    .eq("run_id", runId)
    .eq("excluded", false)
    .not("text_content", "eq", "")
    .is("extracted_at", null)  // Custom tracking column if available; otherwise use evidence count
    .order("source_tier", { ascending: true })
    .order("created_at", { ascending: true });

  // If extracted_at doesn't exist, fall back to sources without evidence
  let unextracted = sources;
  if (srcError) {
    // Fall back: find sources that have no evidence items yet
    const { data: allSources } = await db
      .from("sources")
      .select("id, url, title, text_content, evidence_family, research_pass, source_tier, source_domain, research_query_id")
      .eq("run_id", runId)
      .eq("excluded", false)
      .not("text_content", "eq", "")
      .order("source_tier", { ascending: true });

    const { data: extractedSourceIds } = await db
      .from("evidence_items")
      .select("source_id")
      .eq("run_id", runId);

    const extracted = new Set((extractedSourceIds || []).map((e: any) => e.source_id));
    unextracted = (allSources || []).filter((s: any) => !extracted.has(s.id));
  }

  if (!unextracted || unextracted.length === 0) {
    return stageCompleted("deduplicate_cluster", { reason: "all_extracted" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Reconstruct budget ---
  const budget = await costBudgetForRun(runId, db, config);

  // --- Determine batch size ---
  const batchConfig = BATCH_DEFAULTS.extract_evidence ?? { defaultSize: 5, maxSize: 8, minSize: 2 };
  const batchSize = adaptBatchSize(
    batchConfig,
    ctx.inputMeta.previousDurationMs as number | null ?? null,
    config.timeLimits.stageDefaultMs,
  );

  // --- Extract evidence ---
  const reasoner = createAnalysisProvider();
  const batch = unextracted.slice(0, batchSize);
  let evidenceExtracted = 0;

  // Load the run input for evidence extraction context
  const { data: run } = await db
    .from("research_runs")
    .select("idea_name, idea_description, target_customer")
    .eq("id", runId)
    .single();

  if (!run) {
    return stageFailed("permanent", "Run not found for evidence extraction");
  }

  for (const source of batch) {
    if (!hasTimeBudget(startedAt, config.timeLimits.stageDefaultMs)) break;
    if (!hasCostBudget(
      budget.spent(),
      config.costLimits.totalUsd,
      config.costLimits.reasoningReserveUsd,
    )) break;

    const textChunks = chunk(source.text_content || "", 4000);
    let sourceClaims = 0;

    for (const textChunk of textChunks) {
      if (!hasTimeBudget(startedAt, config.timeLimits.stageDefaultMs, 10_000)) break;

      try {
        const result = await callProvider(
          runId,
          reasoner,
          `extract:${source.evidence_family}:pass${source.research_pass}`,
          budget,
          db,
          () =>
            reasoner.extractEvidence(
              run.idea_name,
              run.target_customer,
              textChunk,
              {
                family: source.evidence_family || "problem",
                pass: source.research_pass || 1,
                objective: "broad",
              },
            ),
        );

        // Persist extracted evidence items
        for (const item of result.evidence || []) {
          const tier = classifySourceTier(
            source.url,
            item.title,
            item.snippet,
            source.evidence_family || "problem",
          );

          // Market size source qualification
          let marketSizeQualified = false;
          if (
            item.market_size_metric !== "None" &&
            isVerifiableMarketSizeFigure(item.market_size_figure)
          ) {
            const qualification = classifyMarketSizeSource(
              source.url,
              source.title,
              source.text_content || "",
            );
            marketSizeQualified = qualification.qualified;
          }

          const { error: evError } = await db.from("evidence_items").insert({
            run_id: runId,
            source_id: source.id,
            signal_type: item.signal_type,
            strength: item.strength,
            title: item.title,
            snippet: item.snippet,
            evidence_family: source.evidence_family || "problem",
            research_pass: source.research_pass || 1,
            source_tier: tier.tier,
            excluded: tier.excluded,
            disconfirming: item.disconfirming || false,
            pain_point: item.pain_point,
            author: item.author,
            named_entities: item.named_entities || [],
            source_domain: source.source_domain,
            market_size_metric:
              item.market_size_metric !== "None"
                ? item.market_size_metric
                : null,
            market_size_figure: item.market_size_figure,
            market_size_source_qualified: marketSizeQualified,
            tier_reason: tier.reason,
            exclusion_reason: tier.excluded ? tier.reason : null,
            research_query_id: source.research_query_id,
          });

          if (!evError) { evidenceExtracted++; sourceClaims++; }
        }
      } catch (error) {
        // Log but continue — one failed source shouldn't stop the batch
        const message = error instanceof Error ? error.message : String(error);
        await db.from("error_logs").insert({
          run_id: runId,
          context: `extract_evidence:${source.id}`,
          error_message: message,
        });
      }
    }
    const accepted = sourceAcceptance({ retrieved: true, readable: (source.text_content || "").length >= 50, relevance: source.source_tier && source.source_tier <= 3 ? .6 : .1, claimCount: sourceClaims, attributable: true, excluded: false, duplicate: false });
    await db.from("sources").update({ excluded: !accepted.accepted, exclusion_reason: accepted.accepted ? null : accepted.reason, rejection_reason: accepted.accepted ? null : accepted.reason, extracted_at: new Date().toISOString() }).eq("id", source.id);
  }

  // --- Update metrics ---
  await db
    .from("research_pipeline_metrics")
    .update({
      evidence_items_extracted:
        (
          await db
            .from("research_pipeline_metrics")
            .select("evidence_items_extracted")
            .eq("run_id", runId)
            .single()
        ).data?.evidence_items_extracted + evidenceExtracted,
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId);

  // --- Check if more extraction is needed ---
  const remainingCount = unextracted.length - batch.length;
  const canContinue = stageIteration + 1 < maxIterations;

  if (remainingCount > 0 && canContinue) {
    return stageCompleted(
      "extract_evidence",
      { evidenceExtracted, remaining: remainingCount },
      { evidence_extracted: evidenceExtracted, duration_ms: Date.now() - startedAt },
      {
        nextStageIteration: stageIteration + 1,
        nextBatchIndex: batchIndex + 1,
        nextInputMeta: { previousDurationMs: Date.now() - startedAt },
      },
    );
  }

  return stageCompleted(
    "deduplicate_cluster",
    { evidenceExtracted, totalIterations: stageIteration + 1 },
    { evidence_extracted: evidenceExtracted, duration_ms: Date.now() - startedAt },
  );
}
