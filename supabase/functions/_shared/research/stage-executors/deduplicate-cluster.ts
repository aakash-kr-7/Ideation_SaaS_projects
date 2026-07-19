/**
 * Stage: deduplicate_cluster
 *
 * Embeds evidence snippets and clusters by semantic similarity.
 * Updates independent source/domain counts per cluster.
 * Reuses clusterBySimilarity from retrieval-strategy.ts.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { callProvider, costBudgetForRun, cosine } from "../pipeline-utils.ts";
import { clusterBySimilarity, type RetrievalEvidence } from "../retrieval-strategy.ts";
import { clusterEvidence, evidenceConfidence } from "../evidence-intelligence.ts";

export async function executeDeduplicateCluster(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, startedAt, dependencies } = ctx;

  // --- Load all non-excluded evidence ---
  const { data: evidence, error: evError } = await db
    .from("evidence_items")
    .select("id, snippet, evidence_family, research_pass, source_tier, excluded, signal_type, source_id, source_domain, author, pain_point, disconfirming")
    .eq("run_id", runId)
    .eq("excluded", false);

  if (evError) {
    return stageFailed("transient", `Evidence fetch failed: ${evError.message}`);
  }

  if (!evidence || evidence.length === 0) {
    return stageCompleted("check_coverage", { reason: "no_evidence" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Check if already clustered ---
  const alreadyClustered = evidence.some((e: any) => e.cluster_key);
  if (alreadyClustered) {
    return stageCompleted("check_coverage", { reason: "already_clustered" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Embed evidence snippets ---
  const budget = await costBudgetForRun(runId, db, config);
  const embedder = dependencies.embeddings;
  const snippets = evidence.map((e: any) => e.snippet.slice(0, 500));

  let vectors: number[][];
  try {
    vectors = await callProvider(
      runId,
      embedder,
      "embed:evidence_clustering",
      budget,
      db,
      () => embedder.embed(snippets),
    );
  } catch (error) {
    // Embedding failure is non-fatal — proceed without clustering
    const message = error instanceof Error ? error.message : String(error);
    await db.from("error_logs").insert({
      run_id: runId,
      context: "deduplicate_cluster:embedding",
      error_message: message,
    });

    return stageCompleted("check_coverage", { reason: "embedding_failed", evidenceCount: evidence.length }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Cluster by similarity ---
  const clustered = clusterBySimilarity(
    evidence as (RetrievalEvidence & { pain_point?: string })[],
    vectors,
    cosine,
    0.78,
  );

  // --- Persist cluster assignments ---
  for (const item of clustered) {
    await db
      .from("evidence_items")
      .update({
        cluster_key: (item as any).cluster_key,
        supporting_count: (item as any).supporting_count,
        independent_source_count: (item as any).independent_source_count,
        independent_domain_count: (item as any).independent_domain_count,
      })
      .eq("id", (item as any).id);
  }
  // Keep all corroborating evidence rows; graph clusters are additive run-scoped intelligence.
  const intelligenceClusters = clusterEvidence(evidence as any);
  for (const cluster of intelligenceClusters) {
    await db.from("evidence_clusters").upsert({ run_id: runId, cluster_key: cluster.key, cluster_type: cluster.kind, representative_claim: cluster.representativeClaim, supporting_evidence_ids: cluster.supportingEvidenceIds, contradicting_evidence_ids: cluster.contradictingEvidenceIds, independent_source_count: cluster.independentSourceCount, independent_domain_count: cluster.independentDomainCount, tier_distribution: cluster.tierDistribution, date_range: cluster.dateRange, confidence: cluster.confidence, unresolved_disagreement: cluster.unresolvedDisagreement }, { onConflict: "run_id,cluster_key" });
  }
  const confidence = evidenceConfidence(evidence as any, intelligenceClusters);
  await db.from("evidence_confidence_results").upsert({ run_id: runId, band: confidence.band, score: confidence.score, reasons: confidence.reasons, updated_at: new Date().toISOString() }, { onConflict: "run_id" });

  return stageCompleted(
    "check_coverage",
    { clusteredCount: clustered.length, evidenceCount: evidence.length, evidenceConfidence: confidence },
    { duration_ms: Date.now() - startedAt },
  );
}
