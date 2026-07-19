/**
 * Stage: fetch_sources
 *
 * Fetches full page content for ranked, non-excluded sources.
 * Batched: processes up to batchSize sources per invocation.
 * Supports multiple iterations until source targets are met.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed, BATCH_DEFAULTS, adaptBatchSize, MAX_STAGE_ITERATIONS } from "../stages.ts";
import { cacheTtlSeconds, usableCache } from "../retrieval.ts";
import { costBudgetForRun } from "../pipeline-utils.ts";
import { hasTimeBudget, hasCostBudget } from "../job-queue.ts";

export async function executeFetchSources(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, batchIndex, stageIteration, startedAt, dependencies } = ctx;
  const maxIterations = MAX_STAGE_ITERATIONS.fetch_sources ?? 15;

  if (stageIteration >= maxIterations) {
    return stageCompleted("extract_evidence", { reason: "max_iterations" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Load persisted attempt totals to enforce the mode's retrieval range ---
  const { data: metrics, error: metricsError } = await db
    .from("research_pipeline_metrics")
    .select("pages_attempted, pages_fetched")
    .eq("run_id", runId)
    .single();

  if (metricsError || !metrics) {
    return stageFailed("transient", "Unable to load retrieval metrics");
  }

  const totalAttempted = Number(metrics.pages_attempted || 0);
  if (totalAttempted >= config.pageAttemptRange.max) {
    return stageCompleted("extract_evidence", { reason: "page_attempt_cap_reached" }, {
      pages_attempted: totalAttempted,
      pages_fetched: Number(metrics.pages_fetched || 0),
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Check how many sources are already fetched ---
  const { count: fetchedCount } = await db
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("excluded", false)
    .not("text_content", "eq", "");

  const alreadyFetched = fetchedCount ?? 0;
  // --- Load unfetched, non-excluded sources (by source tier priority) ---
  const { data: unfetched, error: fetchError } = await db
    .from("sources")
    .select("id, url, canonical_url, title, source_tier, evidence_family")
    .eq("run_id", runId)
    .eq("excluded", false)
    .or("text_content.is.null,text_content.eq.")
    .order("source_tier", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchError) {
    return stageFailed("transient", `Fetch query failed: ${fetchError.message}`);
  }

  if (!unfetched || unfetched.length === 0) {
    return stageCompleted("extract_evidence", { reason: "no_unfetched", fetched: alreadyFetched }, {
      pages_fetched: alreadyFetched,
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Reconstruct budget ---
  const budget = await costBudgetForRun(runId, db, config);

  // --- Determine batch size ---
  const batchConfig = BATCH_DEFAULTS.fetch_sources ?? { defaultSize: 10, maxSize: 15, minSize: 3 };
  const batchSize = adaptBatchSize(
    batchConfig,
    ctx.inputMeta.previousDurationMs as number | null ?? null,
    config.timeLimits.stageDefaultMs,
  );

  // --- Fetch pages ---
  const remainingAttempts = config.pageAttemptRange.max - totalAttempted;
  const batch = unfetched.slice(0, Math.min(batchSize, remainingAttempts));
  let pagesAttempted = 0;
  let pagesFetched = 0;
  let cacheHits = 0;

  for (const source of batch) {
    if (!hasTimeBudget(startedAt, config.timeLimits.stageDefaultMs)) break;
    if (!hasCostBudget(
      budget.spent(),
      config.costLimits.totalUsd,
      config.costLimits.retrievalReserveUsd,
    )) break;

    pagesAttempted++;

    try {
      const canonical = source.canonical_url || source.url;
      const { data: cached } = await db.from("public_retrieval_cache").select("canonical_url,text_content,content_hash,content_type,etag,last_modified,expires_at,fetch_status,extraction_version").eq("canonical_url", canonical).maybeSingle();
      const page = usableCache(cached)
        ? { canonicalUrl: cached.canonical_url, text: cached.text_content, contentHash: cached.content_hash, contentType: cached.content_type || "text/html", etag: cached.etag, lastModified: cached.last_modified, strategy: "public_cache", status: cached.fetch_status || 200 }
        : { canonicalUrl: canonical, text: await dependencies.extraction.extract(source.url), contentHash: null, contentType: "text/html", etag: null, lastModified: null, strategy: dependencies.extraction.name, status: 200 };
      if (page.strategy === "public_cache") cacheHits++;
      const content = page.text;

      if (content && content.length > 50) {
        await db
          .from("sources")
          .update({
            text_content: content.slice(0, 50_000), // Cap content size
            canonical_url: page.canonicalUrl,
            content_hash: page.contentHash,
            etag: page.etag,
            last_modified: page.lastModified,
            fetch_status: page.status,
            extraction_strategy: page.strategy,
            fetched_at: new Date().toISOString(),
          })
          .eq("id", source.id);
        if (page.strategy !== "public_cache") {
          const expiresAt = new Date(Date.now() + cacheTtlSeconds(page.canonicalUrl) * 1000).toISOString();
          await db.from("public_retrieval_cache").upsert({ canonical_url: page.canonicalUrl, content_hash: page.contentHash, text_content: content.slice(0, 50_000), content_type: page.contentType, etag: page.etag, last_modified: page.lastModified, fetched_at: new Date().toISOString(), expires_at: expiresAt, fetch_status: page.status, extraction_version: "v1" }, { onConflict: "canonical_url" });
        }
        pagesFetched++;
      } else {
        // Content too short — mark as excluded
        await db
          .from("sources")
          .update({
            excluded: true,
            exclusion_reason: "Page content too short or empty",
          })
          .eq("id", source.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db
        .from("sources")
        .update({
          excluded: true,
          exclusion_reason: `Fetch failed: ${message.slice(0, 500)}`,
        })
        .eq("id", source.id);
    }
  }

  // --- Update metrics ---
  await db
    .from("research_pipeline_metrics")
    .update({
      pages_attempted: totalAttempted + pagesAttempted,
      pages_fetched: Number(metrics.pages_fetched || 0) + pagesFetched,
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId);

  // --- Check if more fetching is needed ---
  const { count: nowFetched } = await db
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("excluded", false)
    .not("text_content", "eq", "");

  const totalFetched = nowFetched ?? 0;
  const { count: remainingUnfetched } = await db
    .from("sources")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("excluded", false)
    .or("text_content.is.null,text_content.eq.");

  const hasMore = (remainingUnfetched ?? 0) > 0;
  const belowAttemptCap = totalAttempted + pagesAttempted < config.pageAttemptRange.max;
  const canContinue = stageIteration + 1 < maxIterations;

  if (hasMore && belowAttemptCap && canContinue) {
    return stageCompleted(
      "fetch_sources",
      { pagesAttempted, pagesFetched, totalFetched },
      { pages_attempted: pagesAttempted, pages_fetched: pagesFetched, cache_hits: cacheHits, duration_ms: Date.now() - startedAt },
      {
        nextStageIteration: stageIteration + 1,
        nextBatchIndex: batchIndex + 1,
        nextInputMeta: { previousDurationMs: Date.now() - startedAt },
      },
    );
  }

  return stageCompleted(
    "extract_evidence",
    { pagesAttempted, pagesFetched, totalFetched },
    { pages_attempted: pagesAttempted, pages_fetched: pagesFetched, cache_hits: cacheHits, duration_ms: Date.now() - startedAt },
  );
}
