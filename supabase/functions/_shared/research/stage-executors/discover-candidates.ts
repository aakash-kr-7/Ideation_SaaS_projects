/**
 * Stage: discover_candidates
 *
 * Executes search queries in batches to discover candidate sources.
 * Supports iteration: if more candidates are needed and budget allows,
 * enqueues another iteration. Otherwise transitions to rank_candidates.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed, BATCH_DEFAULTS, adaptBatchSize, MAX_STAGE_ITERATIONS } from "../stages.ts";
import { createSearchProvider } from "../providers.ts";
import { BraveDiscoveryAdapter, CommonCrawlDiscoveryAdapter, SitemapRssDiscoveryAdapter, TavilyDiscoveryAdapter, discoverWithAvailableProviders } from "../discovery.ts";
import { callProvider, costBudgetForRun } from "../pipeline-utils.ts";
import { hasTimeBudget, hasCostBudget } from "../job-queue.ts";

export async function executeDiscoverCandidates(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, stageIteration, startedAt } = ctx;
  const maxIterations = MAX_STAGE_ITERATIONS.discover_candidates ?? 10;

  if (stageIteration >= maxIterations) {
    return stageCompleted("rank_candidates", { reason: "max_iterations" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Load pending queries ---
  const { data: pendingQueries, error: queryError } = await db
    .from("research_queries")
    .select("id, query, pass_number, evidence_family, objective, query_family")
    .eq("run_id", runId)
    .eq("status", "Running")
    .order("created_at", { ascending: true });

  if (queryError) {
    return stageFailed("transient", `Query fetch failed: ${queryError.message}`);
  }

  if (!pendingQueries || pendingQueries.length === 0) {
    return stageCompleted("rank_candidates", { reason: "no_pending_queries" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Check current candidate count ---
  const { count: currentCount } = await db
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId);

  const candidatesSoFar = currentCount ?? 0;
  if (candidatesSoFar >= config.candidateDiscoveryTarget.max) {
    return stageCompleted("rank_candidates", { reason: "target_reached" }, {
      candidates_discovered: candidatesSoFar,
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Reconstruct cost budget ---
  const budget = await costBudgetForRun(runId, db, config);

  // --- Execute search queries in batch ---
  let search: ReturnType<typeof createSearchProvider> | null = null;
  try { search = createSearchProvider(); } catch { /* direct / optional providers still run */ }
  const providers = [
    ...(search ? [new TavilyDiscoveryAdapter(search)] : []),
    new BraveDiscoveryAdapter(), new CommonCrawlDiscoveryAdapter(), new SitemapRssDiscoveryAdapter(),
  ];
  const batchConfig = BATCH_DEFAULTS.discover_candidates ?? { defaultSize: 20, maxSize: 30, minSize: 5 };
  const batchLimit = adaptBatchSize(
    batchConfig,
    ctx.inputMeta.previousDurationMs as number | null ?? null,
    config.timeLimits.stageDefaultMs,
  );

  let candidatesDiscovered = 0;
  const queriesToRun = pendingQueries.slice(0, batchLimit);

  for (const query of queriesToRun) {
    if (!hasTimeBudget(startedAt, config.timeLimits.stageDefaultMs)) break;
    if (!hasCostBudget(
      budget.spent(),
      config.costLimits.totalUsd,
      config.costLimits.retrievalReserveUsd,
    )) break;

    try {
      const results = search
        ? await callProvider(runId, search, `search:${query.objective}`, budget, db, () => discoverWithAvailableProviders(providers, { query: query.query, family: query.query_family || query.evidence_family, pass: query.pass_number }))
        : await discoverWithAvailableProviders(providers, { query: query.query, family: query.query_family || query.evidence_family, pass: query.pass_number });

      // Persist search results as raw sources (dedup by URL within run)
      for (const result of results || []) {
        const { error: srcError } = await db.from("sources").upsert(
          {
            run_id: runId,
            title: result.title || "Untitled",
            url: result.url,
            source_type: result.sourceType || "web",
            text_content: "",
            source_domain: result.source || null,
            research_query_id: query.id,
            query_family: query.query_family || null,
            evidence_family: query.evidence_family,
            research_pass: query.pass_number,
            excluded: false,
          },
          { onConflict: "run_id,url", ignoreDuplicates: true },
        );
        if (!srcError) candidatesDiscovered++;
      }

      // Mark query as completed
      await db
        .from("research_queries")
        .update({
          status: "Complete",
          result_count: results?.length ?? 0,
          completed_at: new Date().toISOString(),
        })
        .eq("id", query.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("research_queries")
        .update({
          status: "Failed",
          error_message: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", query.id);
    }
  }

  // --- Update pipeline metrics ---
  await db
    .from("research_pipeline_metrics")
    .update({
      candidates_discovered: candidatesSoFar + candidatesDiscovered,
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId);

  // --- Check if more queries remain ---
  const { count: remainingCount } = await db
    .from("research_queries")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("status", "Running");

  if ((remainingCount ?? 0) > 0 && stageIteration + 1 < maxIterations) {
    // More queries to process — enqueue another iteration
    return stageCompleted(
      "discover_candidates",
      { candidatesDiscovered, iteration: stageIteration },
      { candidates_discovered: candidatesDiscovered, duration_ms: Date.now() - startedAt },
      {
        nextStageIteration: stageIteration + 1,
        nextInputMeta: { previousDurationMs: Date.now() - startedAt },
      },
    );
  }

  // All queries done — proceed to ranking
  return stageCompleted(
    "rank_candidates",
    { candidatesDiscovered, totalIterations: stageIteration + 1 },
    { candidates_discovered: candidatesDiscovered, duration_ms: Date.now() - startedAt },
  );
}
