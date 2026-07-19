/**
 * Stage: rank_candidates
 *
 * Ranks and pre-classifies discovered candidate sources.
 * Applies domain-diversity ranking, deduplication, source tiering,
 * and marks excluded candidates.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { classifySourceTier } from "../retrieval-strategy.ts";
import { canonicalUrl, rankCandidate } from "../discovery.ts";

export async function executeRankCandidates(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, startedAt } = ctx;

  // --- Load all untiered sources ---
  const { data: sources, error: srcError } = await db
    .from("sources")
    .select("id, url, title, text_content, evidence_family, source_domain, source_tier, query_family, created_at")
    .eq("run_id", runId)
    .is("source_tier", null)
    .order("created_at", { ascending: true });

  if (srcError) {
    return stageFailed("transient", `Source fetch failed: ${srcError.message}`);
  }

  if (!sources || sources.length === 0) {
    // All sources already ranked, or none exist
    return stageCompleted("fetch_sources", { reason: "all_ranked" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Domain diversity tracking ---
  const domainCounts = new Map<string, number>();
  let ranked = 0;

  for (const source of sources) {
    const family = source.evidence_family || "problem";
    const canonical = canonicalUrl(source.url);
    if (!canonical) {
      await db.from("sources").update({ excluded: true, exclusion_reason: "Invalid canonical URL", rejection_reason: "invalid_url" }).eq("id", source.id);
      continue;
    }
    const tier = classifySourceTier(
      source.url,
      source.title,
      source.text_content || "",
      family,
    );

    // Track domain diversity
    const domain = source.source_domain ||
      (() => {
        try {
          return new URL(source.url).hostname.replace(/^www\./, "");
        } catch {
          return "unknown";
        }
      })();

    const domainCount = (domainCounts.get(domain) ?? 0) + 1;
    domainCounts.set(domain, domainCount);

    // Exclude Tier 4 and excessive domain duplicates
    const excluded = tier.tier === 4 || domainCount > 3;
    const ranking = rankCandidate({ url: canonical, title: source.title, snippet: source.text_content || "", query: `${source.query_family || source.evidence_family} ${source.title}`, queryFamily: source.query_family, sourceTier: tier.tier, domainCount, publishedAt: source.created_at });

    await db
      .from("sources")
      .update({
        source_tier: tier.tier,
        tier_reason: tier.reason,
        excluded: excluded || tier.excluded,
        exclusion_reason: excluded
          ? domainCount > 3
            ? "Excessive domain duplication"
            : tier.reason
          : null,
        source_domain: domain,
        canonical_url: canonical,
        candidate_score: ranking.score,
        rejection_reason: excluded ? (domainCount > 3 ? "domain_concentration" : "low_value_content") : null,
      })
      .eq("id", source.id);

    ranked++;
  }

  // --- Update metrics ---
  const independentDomains = domainCounts.size;
  await db
    .from("research_pipeline_metrics")
    .update({
      independent_domains: independentDomains,
      updated_at: new Date().toISOString(),
    })
    .eq("run_id", runId);

  return stageCompleted(
    "fetch_sources",
    { ranked, independentDomains, domainCount: domainCounts.size },
    { independent_domains: independentDomains, duration_ms: Date.now() - startedAt },
  );
}
