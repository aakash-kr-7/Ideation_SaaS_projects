import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState } from "../../pipeline-utils.ts";
import {
  discoverCandidates,
  retrieveCandidates,
  type ResearchPack,
  type SourceCandidate,
} from "../../external-retrieval.ts";
import type { CanonicalResearchBrief } from "../../research-brief.ts";

export async function executeHybridEvidenceBoosters(ctx: StageContext): Promise<StageResult> {
  const { runId, db, inputMeta, startedAt } = ctx;
  const opportunityId = String(inputMeta.opportunityId || "");
  const mode = String(inputMeta.mode || "quick_scan");
  const groundingMode = String(inputMeta.groundingMode || "optional");
  const groundingDegraded = Boolean(inputMeta.groundingDegraded);
  const rawGroundingText = String(inputMeta.rawGroundingText || "");
  const runInput = (inputMeta.runInput || {}) as {
    idea_name?: string;
    idea_description?: string;
    target_customer?: string;
    market_type?: string;
  };
  const researchBrief = inputMeta.researchBrief as CanonicalResearchBrief | undefined;
  const packs = Array.isArray(inputMeta.researchPacks) ? inputMeta.researchPacks as ResearchPack[] : [];
  const groundingSources = Array.isArray(inputMeta.groundingSources)
    ? inputMeta.groundingSources as Array<{ url?: string; title?: string }>
    : [];
  if (!opportunityId || !packs.length || !researchBrief) return stageFailed("permanent", "External retrieval requires an opportunity, canonical research brief, and focused query families.");

  try {
    await updateState(runId, "Searching", 50, "Discovering and directly retrieving public evidence", db);
    const technical = /software|developer|security|cyber|api|saas|technical/i.test(
      `${runInput.idea_name || ""} ${runInput.idea_description || ""} ${runInput.target_customer || ""} ${runInput.market_type || ""}`,
    );
    const discovery = await discoverCandidates({ runId, packs, db, technical });
    const groundedCandidates: SourceCandidate[] = groundingSources.flatMap((source, index) => source.url ? [{
      title: source.title || source.url,
      url: source.url,
      snippet: "",
      provider: "gemini_grounding",
      queryFamily: packs[Math.min(index, packs.length - 1)]?.key || "grounding",
      score: 100 - index,
    }] : []);
    const allCandidates = [...groundedCandidates, ...discovery.candidates];
    if (!allCandidates.length) return stageFailed("transient", "External discovery returned no candidate URLs.");

    await db.from("source_retrieval_audit").insert(allCandidates.map((candidate) => ({
      run_id: runId,
      query_family: candidate.queryFamily,
      provider: candidate.provider,
      candidate_url: candidate.url,
      disposition: "discovered",
      relevance_score: candidate.score,
    })));
    const retrieval = await retrieveCandidates({
      runId,
      candidates: allCandidates,
      db,
      limit: mode === "full_validation" ? 36 : 16,
      brief: researchBrief,
    });
    if (!retrieval.accepted.length) {
      return stageFailed("transient", "Direct retrieval produced no usable public source content.");
    }

    const sourceCatalog: Array<{
      sourceId: string;
      url: string;
      title: string;
      excerpt: string;
      provider: string;
      queryFamily: string;
      sourceTier: number;
      domain: string;
      publisher: string;
      sourceClass: string;
      extractionMethod: string;
      retrievalDate: string;
      relevanceScore: number;
      relevanceClass: string;
      matchedBriefDimensions: string[];
      mismatchReasons: string[];
      acceptanceDecision: string;
      pageType: string;
      authorityScore: number;
      directnessScore: number;
      promotionalBias: string;
      sourceTierReason: string;
      retrievedText: string;
    }> = [];
    const dossierEntries: string[] = [];
    for (const source of retrieval.accepted) {
      const { data: persisted, error } = await db.from("sources").upsert({
        run_id: runId,
        title: source.title || source.domain,
        url: source.canonicalUrl,
        canonical_url: source.canonicalUrl,
        source_domain: source.domain,
        source_type: source.provider === "gemini_grounding" ? "GeminiGroundedRetrieved" : "ExternalRetrieved",
        text_content: source.text,
        source_tier: source.sourceTier,
        publisher: source.publisher,
        retrieval_date: source.retrievalDate,
        source_class: source.sourceClass,
        extraction_method: source.extractionMethod,
        relevance_score: source.relevance.score,
        relevance_class: source.relevance.classification,
        matched_brief_dimensions: source.relevance.matchedDimensions,
        mismatch_reasons: source.relevance.mismatchReasons,
        acceptance_decision: source.relevance.acceptanceDecision,
        page_type: source.authority.pageType,
        authority_score: source.authority.authorityScore,
        directness_score: source.authority.directnessScore,
        promotional_bias: source.authority.promotionalBias,
        source_tier_reason: source.authority.reason,
        query_family: source.queryFamily,
        excluded: false,
      }, { onConflict: "run_id,url" }).select("id").single();
      if (error || !persisted) throw new Error(`Retrieved source persistence failed: ${error?.message || "missing row"}`);
      sourceCatalog.push({
        sourceId: persisted.id,
        url: source.canonicalUrl,
        title: source.title || source.domain,
        excerpt: source.text.slice(0, 500),
        provider: source.provider,
        queryFamily: source.queryFamily,
        sourceTier: source.sourceTier,
        domain: source.domain,
        publisher: source.publisher,
        sourceClass: source.sourceClass,
        extractionMethod: source.extractionMethod,
        retrievalDate: source.retrievalDate,
        relevanceScore: source.relevance.score,
        relevanceClass: source.relevance.classification,
        matchedBriefDimensions: source.relevance.matchedDimensions,
        mismatchReasons: source.relevance.mismatchReasons,
        acceptanceDecision: source.relevance.acceptanceDecision,
        pageType: source.authority.pageType,
        authorityScore: source.authority.authorityScore,
        directnessScore: source.authority.directnessScore,
        promotionalBias: source.authority.promotionalBias,
        sourceTierReason: source.authority.reason,
        retrievedText: source.text,
      });
      dossierEntries.push(`SOURCE_ID: ${persisted.id}
TITLE: ${source.title || source.domain}
CANONICAL_URL: ${source.canonicalUrl}
DOMAIN: ${source.domain}
QUERY_FAMILY: ${source.queryFamily}
SOURCE_TIER: ${source.sourceTier}
SOURCE_TIER_REASON: ${source.authority.reason}
RELEVANCE_CLASS: ${source.relevance.classification}
RELEVANCE_SCORE: ${source.relevance.score}
MATCHED_BRIEF_DIMENSIONS: ${source.relevance.matchedDimensions.join(", ")}
RETRIEVED_TEXT:
${source.text.slice(0, mode === "full_validation" ? 1_400 : 3_000)}`);
    }

    const independentDomains = new Set(sourceCatalog.map((source) => source.domain)).size;
    await db.from("research_pipeline_metrics").update({
      candidates_discovered: allCandidates.length,
      pages_attempted: retrieval.pagesAttempted,
      pages_fetched: sourceCatalog.length,
      sources_accepted: sourceCatalog.length,
      sources_rejected_by_reason: retrieval.rejected,
      independent_domains: independentDomains,
      external_search_calls: discovery.externalSearchCalls,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    const dossier = dossierEntries.join("\n\n---\n\n");
    return stageCompleted("validate_normalize", {
      groundingMode,
      groundingDegraded,
      externalSearchCalls: discovery.externalSearchCalls,
      candidateCount: allCandidates.length,
      acceptedSourceCount: sourceCatalog.length,
      independentDomains,
      rejectedByReason: retrieval.rejected,
    }, {
      candidates_discovered: allCandidates.length,
      pages_attempted: retrieval.pagesAttempted,
      pages_fetched: sourceCatalog.length,
      sources_accepted: sourceCatalog.length,
      sources_rejected: Object.values(retrieval.rejected).reduce((sum, count) => sum + count, 0),
      independent_domains: independentDomains,
      duration_ms: Date.now() - startedAt,
    }, {
      nextInputMeta: {
        opportunityId,
        mode,
        groundingMode,
        groundingDegraded,
        sourceCatalog,
        researchBrief,
        targetCustomer: inputMeta.targetCustomer,
        targetRegion: inputMeta.targetRegion,
        combinedText: `${rawGroundingText ? `OPTIONAL_GROUNDING_BOOSTER:\n${rawGroundingText}\n\n` : ""}CANONICAL_RESEARCH_BRIEF:\n${JSON.stringify(researchBrief)}\n\nRETRIEVED_EVIDENCE_DOSSIER:\n${dossier}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return stageFailed(/timeout|429|temporar|5\d\d/i.test(message) ? "transient" : "permanent", `External retrieval failed: ${message}`);
  }
}
