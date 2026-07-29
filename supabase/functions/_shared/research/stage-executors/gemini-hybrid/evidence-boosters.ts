import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState } from "../../pipeline-utils.ts";
import { costBudgetForRun } from "../../pipeline-utils.ts";
import {
  discoverCandidates,
  discoverOfficialSitemapCandidates,
  type ResearchPack,
  retrieveCandidates,
  type SourceCandidate,
} from "../../external-retrieval.ts";
import type { CanonicalResearchBrief } from "../../research-brief.ts";
import {
  buildCoverageRepairPack,
  evaluateQuickScanCoverage,
  extractValidatedPricingObservations,
  propositionContradictions,
} from "../../quick-scan-research-strategy.ts";
import { GeminiRequestError } from "../../gemini.ts";
import { groundingFailureAction } from "../../grounding-policy.ts";
import { persistResearchCallMetric } from "../../research-call-metrics.ts";
import {
  classifyPackFailure,
  packOutcome,
  persistQuickScanPackStatus,
  researchUnavailableMessage,
} from "../../quick-scan-reliability.ts";
import {
  evaluateFullValidationCoverage,
  type FullValidationCoverage,
  selectConditionalPacks,
} from "../../full-validation-research-strategy.ts";
import {
  persistFullValidationPackStatus,
} from "../../full-validation-reliability.ts";
import { RESEARCH_REVIEW_BUDGETS } from "../../source-router.ts";

export async function executeHybridEvidenceBoosters(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, inputMeta, startedAt, config } = ctx;
  const opportunityId = String(inputMeta.opportunityId || "");
  const mode = String(inputMeta.mode || "quick_scan");
  const groundingMode = String(inputMeta.groundingMode || "optional");
  const groundingDegraded = Boolean(inputMeta.groundingDegraded);
  const runInput = (inputMeta.runInput || {}) as {
    idea_name?: string;
    idea_description?: string;
    target_customer?: string;
    market_type?: string;
  };
  const researchBrief = inputMeta.researchBrief as
    | CanonicalResearchBrief
    | undefined;
  const packs = Array.isArray(inputMeta.researchPacks)
    ? inputMeta.researchPacks as ResearchPack[]
    : [];
  const groundingSources = Array.isArray(inputMeta.groundingSources)
    ? inputMeta.groundingSources as Array<
      { url?: string; title?: string; queryFamily?: string }
    >
    : [];
  const competitorSeeds = Array.isArray(inputMeta.competitorSeeds)
    ? inputMeta.competitorSeeds as Array<{
      candidateName?: string;
      canonicalHomepage?: string;
    }>
    : [];
  const attemptedGroundedPackKeys = new Set(
    Array.isArray(inputMeta.attemptedGroundedPackKeys)
      ? inputMeta.attemptedGroundedPackKeys.map(String)
      : [],
  );
  if (!opportunityId || !packs.length || !researchBrief) {
    return stageFailed(
      "permanent",
      "External retrieval requires an opportunity, canonical research brief, and focused query families.",
    );
  }

  try {
    await updateState(
      runId,
      "Searching",
      50,
      "Discovering and directly retrieving public evidence",
      db,
    );
    const technical = /software|developer|security|cyber|api|saas|technical/i
      .test(
        `${runInput.idea_name || ""} ${runInput.idea_description || ""} ${
          runInput.target_customer || ""
        } ${runInput.market_type || ""}`,
      );
    const discovery = await discoverCandidates({ runId, packs, db, technical });
    let externalSearchCalls = discovery.externalSearchCalls;
    const sitemapCandidatesRaw = competitorSeeds.length
      ? await discoverOfficialSitemapCandidates({
        runId,
        seeds: competitorSeeds,
        db,
      })
      : [];
    const sitemapCandidates = mode === "full_validation"
      ? sitemapCandidatesRaw.map((candidate) => ({
        ...candidate,
        queryFamily: /pricing|plans/i.test(candidate.url)
          ? "full_pricing_wtp_procurement"
          : "full_alternatives_competitors",
      }))
      : sitemapCandidatesRaw;
    externalSearchCalls += sitemapCandidates.length
      ? Math.min(4, competitorSeeds.length)
      : 0;
    const groundedCandidates: SourceCandidate[] = groundingSources.flatMap((
      source,
      index,
    ) =>
      source.url
        ? [{
          title: source.title || source.url,
          url: source.url,
          snippet: "",
          provider: "gemini_grounding",
          queryFamily: source.queryFamily ||
            packs[Math.min(index, packs.length - 1)]?.key || "grounding",
          score: 100 - index,
        }]
        : []
    );
    const seededCandidates: SourceCandidate[] = competitorSeeds.flatMap((
      seed,
      index,
    ) => {
      if (!seed.canonicalHomepage) return [];
      const homepage = seed.canonicalHomepage.replace(/\/+$/, "");
      return [{
        title: seed.candidateName || seed.canonicalHomepage,
        url: seed.canonicalHomepage,
        snippet:
          "Curated category candidate requiring live verification; no pricing or positioning is assumed.",
        provider: "competitor_seed",
        queryFamily: mode === "full_validation"
          ? "full_alternatives_competitors"
          : "quick_pricing_wtp_reachability",
        score: 105 - index,
      }, {
        title: `${
          seed.candidateName || seed.canonicalHomepage
        } pricing verification attempt`,
        url: `${homepage}/pricing`,
        snippet:
          "Deterministic live pricing-page attempt; no price or plan is assumed unless page text validates it.",
        provider: "competitor_seed_pricing_attempt",
        queryFamily: mode === "full_validation"
          ? "full_pricing_wtp_procurement"
          : "quick_pricing_wtp_reachability",
        score: 104 - index,
      }];
    });
    let allCandidates = [
      ...groundedCandidates,
      ...seededCandidates,
      ...sitemapCandidates,
      ...discovery.candidates,
    ];
    if (allCandidates.length) {
      await db.from("source_retrieval_audit").insert(
        allCandidates.map((candidate) => ({
          run_id: runId,
          query_family: candidate.queryFamily,
          provider: candidate.provider,
          candidate_url: candidate.url,
          disposition: "discovered",
          relevance_score: candidate.score,
        })),
      );
    }
    let retrieval = await retrieveCandidates({
      runId,
      candidates: allCandidates,
      db,
      // Quick Scan remains 16 + one bounded repair (24 maximum). Full
      // Validation reserves 16 of its 75-review ceiling for two repairs.
      limit: mode === "full_validation"
        ? RESEARCH_REVIEW_BUDGETS.full_validation - 16
        : 16,
      brief: researchBrief,
    });
    const initialPricing = extractValidatedPricingObservations(
      retrieval.accepted,
    );
    const initialCoverage = evaluateQuickScanCoverage(
      retrieval.accepted,
      initialPricing,
    );
    const conditionalCallTrigger: string[] = mode === "quick_scan"
      ? [...initialCoverage.repairTriggers]
      : [];
    let repairAddedEvidence = 0;
    let repairGroundingText = "";
    let repairQuotaFailure = false;
    let repairDiscoveryAttempted = false;
    if (
      mode === "quick_scan" &&
      initialCoverage.repairTriggers.length &&
      groundingMode !== "disabled" &&
      !groundingDegraded
    ) {
      const repairPack = buildCoverageRepairPack(
        researchBrief,
        initialCoverage,
      );
      if (
        competitorSeeds.length &&
        initialCoverage.repairTriggers.includes("no_live_verified_competitor")
      ) {
        repairPack.query += ` ${
          competitorSeeds.map((seed) =>
            `"${seed.candidateName}" ${seed.canonicalHomepage}`
          ).join(" ")
        }`;
      }
      const repairStartedAt = Date.now();
      try {
        const gemini = ctx.dependencies.createGemini();
        const budget = await costBudgetForRun(runId, db, config);
        const repairResult = await gemini.generate({
          runId,
          taskType: "grounded_quick_coverage_repair",
          useGrounding: true,
          budget,
          db,
          systemInstruction:
            "Perform one bounded coverage-repair search using a materially different angle. Stay inside the canonical buyer, workflow, problem, and proposition. Seek only the named missing evidence. Preserve source attribution and do not repeat a general market summary.",
          prompt: `Canonical brief: ${JSON.stringify(researchBrief)}
Coverage gaps: ${initialCoverage.missingEvidence.join("; ")}
Trigger reasons: ${initialCoverage.repairTriggers.join(", ")}
Different-angle query: ${repairPack.query}
Return attributable findings only. State when a gap remains unresolved.`,
        });
        repairGroundingText = repairResult.text;
        const repairGroundedCandidates: SourceCandidate[] = repairResult
          .groundingSources.map((source, index) => ({
            title: source.title || source.url,
            url: source.url,
            snippet: "",
            provider: "gemini_grounding",
            queryFamily: repairPack.key,
            score: 110 - index,
          }));
        const repairDiscovery = await discoverCandidates({
          runId,
          packs: [repairPack],
          db,
          technical,
        });
        repairDiscoveryAttempted = true;
        externalSearchCalls += repairDiscovery.externalSearchCalls;
        const repairCandidates = [
          ...repairGroundedCandidates,
          ...repairDiscovery.candidates,
        ];
        if (repairCandidates.length) {
          await db.from("source_retrieval_audit").insert(
            repairCandidates.map((candidate) => ({
              run_id: runId,
              query_family: candidate.queryFamily,
              provider: candidate.provider,
              candidate_url: candidate.url,
              disposition: "discovered",
              relevance_score: candidate.score,
            })),
          );
        }
        const repairRetrieval = await retrieveCandidates({
          runId,
          candidates: repairCandidates,
          db,
          limit: 8,
          brief: researchBrief,
        });
        const existingUrls = new Set(
          retrieval.accepted.map((source) => source.canonicalUrl),
        );
        const added = repairRetrieval.accepted.filter((source) =>
          !existingUrls.has(source.canonicalUrl)
        );
        repairAddedEvidence = added.length;
        retrieval = {
          accepted: [...retrieval.accepted, ...added],
          pagesAttempted: retrieval.pagesAttempted +
            repairRetrieval.pagesAttempted,
          pagesFetched: retrieval.pagesFetched + repairRetrieval.pagesFetched,
          rejected: mergeCounts(retrieval.rejected, repairRetrieval.rejected),
        };
        allCandidates = [...allCandidates, ...repairCandidates];
        await persistResearchCallMetric(db, {
          runId,
          callPurpose: "coverage_repair",
          queryFamily: "grounded_quick_coverage_repair",
          grounded: true,
          conditionalCallTrigger,
          sourcesDiscovered: repairResult.groundingSources.length,
          sourcesAccepted: added.length,
          independentEvidenceGroupsAdded:
            evaluateQuickScanCoverage(added).independentGroups.length,
          evidenceFamiliesAdded: unique(
            added.map((source) => source.queryFamily),
          ),
          pricingClaimsValidated:
            extractValidatedPricingObservations(added).length,
          durationMs: Date.now() - repairStartedAt,
          metadata: { query: repairPack.query },
        });
      } catch (error) {
        const quota = error instanceof GeminiRequestError ? error.quota : null;
        repairQuotaFailure = Boolean(quota);
        const packFailure = classifyPackFailure(error, quota);
        await persistResearchCallMetric(db, {
          runId,
          callPurpose: "coverage_repair",
          queryFamily: "grounded_quick_coverage_repair",
          grounded: true,
          conditionalCallTrigger,
          durationMs: Date.now() - repairStartedAt,
          quotaFailure: repairQuotaFailure,
          metadata: {
            error: error instanceof Error ? error.message : String(error),
          },
        });
        if (mode === "quick_scan") {
          await persistQuickScanPackStatus(db, {
            runId,
            packKey: "quick_coverage_repair",
            status: packFailure,
            failureReason: error instanceof Error
              ? error.message
              : String(error),
            metadata: { triggers: conditionalCallTrigger },
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
        if (action === "fail") {
          return stageFailed(
            "permanent",
            "Required conditional coverage repair was unavailable.",
          );
        }
      }
    }
    if (
      mode === "quick_scan" &&
      initialCoverage.repairTriggers.length &&
      !repairDiscoveryAttempted &&
      (groundingMode === "disabled" || groundingDegraded ||
        repairQuotaFailure)
    ) {
      const repairPack = buildCoverageRepairPack(
        researchBrief,
        initialCoverage,
      );
      if (
        competitorSeeds.length &&
        initialCoverage.repairTriggers.includes("no_live_verified_competitor")
      ) {
        repairPack.query += ` ${
          competitorSeeds.map((seed) =>
            `"${seed.candidateName}" ${seed.canonicalHomepage}`
          ).join(" ")
        }`;
      }
      const repairStartedAt = Date.now();
      const repairDiscovery = await discoverCandidates({
        runId,
        packs: [repairPack],
        db,
        technical,
      });
      repairDiscoveryAttempted = true;
      externalSearchCalls += repairDiscovery.externalSearchCalls;
      const repairCandidates = repairDiscovery.candidates;
      if (repairCandidates.length) {
        await db.from("source_retrieval_audit").insert(
          repairCandidates.map((candidate) => ({
            run_id: runId,
            query_family: candidate.queryFamily,
            provider: candidate.provider,
            candidate_url: candidate.url,
            disposition: "discovered",
            relevance_score: candidate.score,
          })),
        );
      }
      const repairRetrieval = await retrieveCandidates({
        runId,
        candidates: repairCandidates,
        db,
        limit: 8,
        brief: researchBrief,
      });
      const existingUrls = new Set(
        retrieval.accepted.map((source) => source.canonicalUrl),
      );
      const added = repairRetrieval.accepted.filter((source) =>
        !existingUrls.has(source.canonicalUrl)
      );
      repairAddedEvidence = added.length;
      retrieval = {
        accepted: [...retrieval.accepted, ...added],
        pagesAttempted: retrieval.pagesAttempted +
          repairRetrieval.pagesAttempted,
        pagesFetched: retrieval.pagesFetched + repairRetrieval.pagesFetched,
        rejected: mergeCounts(retrieval.rejected, repairRetrieval.rejected),
      };
      allCandidates = [...allCandidates, ...repairCandidates];
      await persistResearchCallMetric(db, {
        runId,
        callPurpose: "coverage_repair_fallback",
        queryFamily: "external_quick_coverage_repair",
        grounded: false,
        conditionalCallTrigger,
        provider: "external_discovery",
        sourcesDiscovered: repairCandidates.length,
        sourcesAccepted: added.length,
        independentEvidenceGroupsAdded:
          evaluateQuickScanCoverage(added).independentGroups.length,
        evidenceFamiliesAdded: unique(
          added.map((source) => source.queryFamily),
        ),
        pricingClaimsValidated:
          extractValidatedPricingObservations(added).length,
        durationMs: Date.now() - repairStartedAt,
        metadata: {
          query: repairPack.query,
          reason: "Grounded Gemini repair was unavailable or disabled.",
        },
      });
    }

    let fullValidationCoverage: FullValidationCoverage | null = null;
    const fullConditionalPacks: ResearchPack[] = [];
    if (mode === "full_validation") {
      const initialFullCoverage = evaluateFullValidationCoverage(
        retrieval.accepted,
        researchBrief,
      );
      const selectedRepairs = selectConditionalPacks(
        researchBrief,
        initialFullCoverage,
      );
      for (const repairPack of selectedRepairs) {
        fullConditionalPacks.push(repairPack);
        const repairStartedAt = Date.now();
        await persistFullValidationPackStatus(db, {
          runId,
          packKey: repairPack.key,
          status: "skipped",
          conditionalTrigger: repairPack.conditionalTrigger,
          startedAt: new Date(repairStartedAt).toISOString(),
          metadata: { inProgress: true },
        });
        try {
          const gemini = ctx.dependencies.createGemini();
          const budget = await costBudgetForRun(runId, db, config);
          const result = await gemini.generate({
            runId,
            taskType: `grounded_${repairPack.key}`,
            useGrounding: true,
            budget,
            db,
            systemInstruction:
              "Perform one bounded specialist repair using Google Search grounding. Search only for the named unresolved gap, use a materially different query family, preserve buyer-segment boundaries, cite sources, and do not repeat evidence already present. Return no finding when the gap remains unresolved.",
            prompt: `Canonical brief: ${JSON.stringify(researchBrief)}
Conditional trigger: ${repairPack.conditionalTrigger}
Unresolved gaps: ${initialFullCoverage.unresolvedGaps.join("; ")}
Specialist query: ${repairPack.query}`,
          });
          const candidates: SourceCandidate[] = result.groundingSources.map((
            source,
            index,
          ) => ({
            title: source.title || source.url,
            url: source.url,
            snippet: "",
            provider: "gemini_grounding",
            queryFamily: repairPack.key,
            score: 120 - index,
          }));
          const repairRetrieval = await retrieveCandidates({
            runId,
            candidates,
            db,
            limit: 8,
            brief: researchBrief,
          });
          const existingUrls = new Set(
            retrieval.accepted.map((source) => source.canonicalUrl),
          );
          const added = repairRetrieval.accepted.filter((source) =>
            !existingUrls.has(source.canonicalUrl)
          );
          retrieval = {
            accepted: [...retrieval.accepted, ...added],
            pagesAttempted: retrieval.pagesAttempted +
              repairRetrieval.pagesAttempted,
            pagesFetched: retrieval.pagesFetched +
              repairRetrieval.pagesFetched,
            rejected: mergeCounts(retrieval.rejected, repairRetrieval.rejected),
          };
          allCandidates = [...allCandidates, ...candidates];
          const addedCoverage = evaluateFullValidationCoverage(
            added,
            researchBrief,
          );
          await persistFullValidationPackStatus(db, {
            runId,
            packKey: repairPack.key,
            status: packOutcome(added.length),
            acceptedEvidenceCount: added.length,
            conditionalTrigger: repairPack.conditionalTrigger,
            startedAt: new Date(repairStartedAt).toISOString(),
            metadata: { groundedSourcesDiscovered: candidates.length },
          });
          await persistResearchCallMetric(db, {
            runId,
            callPurpose: repairPack.focus,
            queryFamily: `grounded_${repairPack.key}`,
            grounded: true,
            conditionalCallTrigger: [String(repairPack.conditionalTrigger)],
            sourcesDiscovered: candidates.length,
            sourcesAccepted: added.length,
            pagesFetched: repairRetrieval.pagesAttempted,
            independentEvidenceGroupsAdded:
              addedCoverage.independentEvidenceGroups.length,
            evidenceFamiliesAdded: addedCoverage.sourceFamilies,
            wtpSignalsFound: addedCoverage.directWtpCount,
            pricingClaimsValidated: addedCoverage.verifiedPricingCount,
            rejectionReasons: repairRetrieval.rejected,
            durationMs: Date.now() - repairStartedAt,
          });
        } catch (error) {
          const quota = error instanceof GeminiRequestError
            ? error.quota
            : null;
          const failure = classifyPackFailure(error, quota);
          await persistFullValidationPackStatus(db, {
            runId,
            packKey: repairPack.key,
            status: failure,
            failureReason: error instanceof Error
              ? error.message
              : String(error),
            conditionalTrigger: repairPack.conditionalTrigger,
            startedAt: new Date(repairStartedAt).toISOString(),
          });
          await persistResearchCallMetric(db, {
            runId,
            callPurpose: repairPack.focus,
            queryFamily: `grounded_${repairPack.key}`,
            grounded: true,
            conditionalCallTrigger: [String(repairPack.conditionalTrigger)],
            quotaFailure: Boolean(quota),
            providerFailure: failure,
            durationMs: Date.now() - repairStartedAt,
          });
          return stageFailed(
            "research_unavailable",
            researchUnavailableMessage(failure),
          );
        }
      }
      fullValidationCoverage = evaluateFullValidationCoverage(
        retrieval.accepted,
        researchBrief,
      );
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
      publishedOrUpdatedDate: string | null;
      extractionLimitations: string[];
      hostileTextDetected: boolean;
    }> = [];
    if (mode === "quick_scan") {
      for (const [rawReason, count] of Object.entries(retrieval.rejected)) {
        const reason = normalizeRetrievalRejection(rawReason);
        await db.from("evidence_rejection_diagnostics").upsert({
          run_id: runId,
          pipeline_stage: "retrieval",
          reason,
          count,
          details: { rawReason },
          updated_at: new Date().toISOString(),
        }, { onConflict: "run_id,pipeline_stage,reason" });
      }
    }
    const dossierEntries: string[] = [];
    for (const source of retrieval.accepted) {
      const { data: persisted, error } = await db.from("sources").upsert({
        run_id: runId,
        title: source.title || source.domain,
        url: source.canonicalUrl,
        canonical_url: source.canonicalUrl,
        source_domain: source.domain,
        source_type: source.provider === "gemini_grounding"
          ? "GeminiGroundedRetrieved"
          : "ExternalRetrieved",
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
      if (error || !persisted) {
        throw new Error(
          `Retrieved source persistence failed: ${
            error?.message || "missing row"
          }`,
        );
      }
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
        publishedOrUpdatedDate: source.publishedOrUpdatedDate || null,
        extractionLimitations: source.extractionLimitations || [],
        hostileTextDetected: Boolean(source.hostileTextDetected),
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

    const finalPricing = extractValidatedPricingObservations(
      retrieval.accepted,
    );
    if (mode === "quick_scan" || mode === "full_validation") {
      await db.from("validated_pricing_observations").delete().eq(
        "run_id",
        runId,
      );
      for (const observation of finalPricing) {
        const source = sourceCatalog.find((item) =>
          item.url === observation.sourceUrl
        );
        await db.from("validated_pricing_observations").insert({
          run_id: runId,
          source_id: source?.sourceId || null,
          source_url: observation.sourceUrl,
          source_domain: observation.sourceDomain,
          query_family: observation.queryFamily,
          exact_excerpt: observation.exactExcerpt,
          plan_name: observation.planName,
          price_point: observation.pricePoint,
          pricing_model: observation.pricingModel,
          validation_state: observation.validationState,
        });
      }
    }
    const coverage = mode === "quick_scan"
      ? evaluateQuickScanCoverage(retrieval.accepted, finalPricing)
      : null;
    const contradictionObjects = mode === "quick_scan"
      ? propositionContradictions(
        researchBrief.exactProductProposition,
        sourceCatalog.map((source) => ({
          sourceId: source.sourceId,
          queryFamily: source.queryFamily,
        })),
      )
      : [];
    if (mode === "quick_scan") {
      for (
        const pack of packs.slice(0, 3).filter((item) =>
          attemptedGroundedPackKeys.has(item.key)
        )
      ) {
        const acceptedForPack = retrieval.accepted.filter((source) =>
          source.queryFamily === pack.key
        );
        await persistQuickScanPackStatus(db, {
          runId,
          packKey: pack.key,
          status: packOutcome(acceptedForPack.length),
          acceptedEvidenceCount: acceptedForPack.length,
          metadata: {
            groundedSourcesDiscovered: groundingSources.filter((source) =>
              source.queryFamily === pack.key
            ).length,
            validated: true,
          },
        });
        await persistResearchCallMetric(db, {
          runId,
          callPurpose: pack.purpose || pack.focus,
          queryFamily: `grounded_${pack.key}`,
          grounded: true,
          sourcesDiscovered: groundingSources.filter((source) =>
            source.queryFamily === pack.key
          ).length,
          sourcesAccepted: acceptedForPack.length,
          independentEvidenceGroupsAdded:
            evaluateQuickScanCoverage(acceptedForPack).independentGroups.length,
          evidenceFamiliesAdded: acceptedForPack.length ? [pack.key] : [],
          contradictionsAdded: pack.purpose === "adversarial"
            ? contradictionObjects[0]?.challengingEvidenceIds.length || 0
            : 0,
          pricingClaimsValidated: pack.purpose === "pricing_wtp"
            ? finalPricing.length
            : 0,
        });
      }
      await persistQuickScanPackStatus(db, {
        runId,
        packKey: "quick_coverage_repair",
        status: conditionalCallTrigger.length
          ? packOutcome(repairAddedEvidence)
          : "skipped",
        acceptedEvidenceCount: repairAddedEvidence,
        failureReason: repairQuotaFailure
          ? "Grounded coverage repair was quota blocked; bounded fallback repair completed."
          : null,
        metadata: {
          triggers: conditionalCallTrigger,
          groundedAttempted: conditionalCallTrigger.length > 0 &&
            groundingMode !== "disabled" && !groundingDegraded,
          fallbackAttempted: repairDiscoveryAttempted,
        },
      });
    }
    if (mode === "quick_scan" && competitorSeeds.length) {
      for (const seed of competitorSeeds) {
        const seedDomain = safeDomain(seed.canonicalHomepage || "");
        const discovered = sourceCatalog.some((source) =>
          (seedDomain && source.domain.replace(/^www\./, "") === seedDomain) ||
          source.title.toLowerCase().includes(
            String(seed.candidateName || "").toLowerCase(),
          )
        );
        if (discovered) {
          await db.from("competitors").update({
            verification_status: "discovered_candidate",
            updated_at: new Date().toISOString(),
          }).eq("opportunity_id", opportunityId).eq("name", seed.candidateName);
        }
      }
    }
    if (mode === "full_validation") {
      const { data: retrievalAudit } = await db.from("source_retrieval_audit")
        .select(
          "query_family,disposition,candidate_url,canonical_url,deterministic_relevance_score",
        )
        .eq("run_id", runId);
      for (const pack of packs) {
        const acceptedForPack = retrieval.accepted.filter((source) =>
          source.queryFamily === pack.key
        );
        const packCoverage = evaluateFullValidationCoverage(
          acceptedForPack,
          researchBrief,
        );
        const auditForPack = (retrievalAudit || []).filter((row: any) =>
          row.query_family === pack.key
        );
        const discoveredForPack = new Set(
          auditForPack.filter((row: any) => row.disposition === "discovered")
            .map((row: any) => row.candidate_url),
        ).size;
        const reviewedForPack = new Set(
          auditForPack.filter((row: any) =>
            ["accepted", "rejected"].includes(row.disposition)
          ).map((row: any) => row.canonical_url || row.candidate_url),
        ).size;
        const fetchedForPack = new Set(
          auditForPack.filter((row: any) =>
            row.disposition === "accepted" ||
            row.deterministic_relevance_score !== null
          ).map((row: any) => row.canonical_url || row.candidate_url),
        ).size;
        await persistFullValidationPackStatus(db, {
          runId,
          packKey: pack.key,
          status: packOutcome(acceptedForPack.length),
          acceptedEvidenceCount: acceptedForPack.length,
          metadata: {
            groundedSourcesDiscovered: groundingSources.filter((source) =>
              source.queryFamily === pack.key
            ).length,
            validated: true,
          },
          funnel: {
            sourcesDiscovered: discoveredForPack,
            sourcesReviewed: reviewedForPack,
            sourcesFetched: fetchedForPack,
            independentEvidenceGroups:
              packCoverage.independentEvidenceGroups.length,
            directOfficialSources: packCoverage.primaryOfficialCount,
            challengingFindings: packCoverage.challengingEvidenceCount,
          },
        });
        await persistResearchCallMetric(db, {
          runId,
          callPurpose: pack.purpose || pack.focus,
          queryFamily: `grounded_${pack.key}`,
          grounded: true,
          sourcesDiscovered: groundingSources.filter((source) =>
            source.queryFamily === pack.key
          ).length,
          sourcesAccepted: acceptedForPack.length,
          pagesFetched: acceptedForPack.length,
          independentEvidenceGroupsAdded:
            packCoverage.independentEvidenceGroups.length,
          evidenceFamiliesAdded: packCoverage.sourceFamilies,
          contradictionsAdded: pack.key === "full_adversarial"
            ? packCoverage.challengingEvidenceCount
            : 0,
          pricingClaimsValidated: pack.key === "full_pricing_wtp_procurement"
            ? packCoverage.verifiedPricingCount
            : 0,
          wtpSignalsFound: pack.key === "full_pricing_wtp_procurement"
            ? packCoverage.directWtpCount
            : 0,
          rejectionReasons: retrieval.rejected,
        });
      }
      for (const seed of competitorSeeds) {
        const seedDomain = safeDomain(seed.canonicalHomepage || "");
        const verified = sourceCatalog.some((source) =>
          (seedDomain && source.domain.replace(/^www\./, "") === seedDomain) &&
          ["official_product", "official_documentation", "official_pricing"]
            .includes(source.pageType)
        );
        if (verified) {
          await db.from("competitors").update({
            verification_status: "discovered_candidate",
            updated_at: new Date().toISOString(),
          }).eq("opportunity_id", opportunityId).eq("name", seed.candidateName);
        }
      }
    }

    const independentDomains = new Set(sourceCatalog.map((source) =>
      source.domain
    )).size;
    await db.from("research_pipeline_metrics").update({
      candidates_discovered: allCandidates.length,
      pages_attempted: retrieval.pagesAttempted,
      pages_fetched: mode === "full_validation"
        ? retrieval.pagesFetched
        : sourceCatalog.length,
      sources_accepted: sourceCatalog.length,
      sources_rejected_by_reason: retrieval.rejected,
      independent_domains: independentDomains,
      external_search_calls: externalSearchCalls,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    const dossier = dossierEntries.join("\n\n---\n\n");
    return stageCompleted("validate_normalize", {
      groundingMode,
      groundingDegraded,
      externalSearchCalls,
      candidateCount: allCandidates.length,
      acceptedSourceCount: sourceCatalog.length,
      independentDomains,
      rejectedByReason: retrieval.rejected,
      conditionalCallTrigger,
      repairAddedEvidence,
      repairQuotaFailure,
      validatedPricingClaims: finalPricing.length,
      coverage,
      fullValidationCoverage,
      fullConditionalPacks: fullConditionalPacks.map((pack) => ({
        key: pack.key,
        trigger: pack.conditionalTrigger,
      })),
    }, {
      candidates_discovered: allCandidates.length,
      pages_attempted: retrieval.pagesAttempted,
      pages_fetched: mode === "full_validation"
        ? retrieval.pagesFetched
        : sourceCatalog.length,
      sources_accepted: sourceCatalog.length,
      sources_rejected: Object.values(retrieval.rejected).reduce(
        (sum, count) => sum + count,
        0,
      ),
      independent_domains: independentDomains,
      duration_ms: Date.now() - startedAt,
    }, {
      nextInputMeta: {
        opportunityId,
        mode,
        groundingMode,
        groundingDegraded,
        sourceCatalog,
        sourcesDiscovered: allCandidates.length,
        sourcesReviewed: retrieval.pagesAttempted,
        sourcesFetched: mode === "full_validation"
          ? retrieval.pagesFetched
          : sourceCatalog.length,
        researchBrief,
        rejectedEvidenceSummary: retrieval.rejected,
        contradictionObjects,
        validatedPricingObservations: finalPricing,
        factorEvidenceStates: coverage?.factorEvidenceStates || [],
        missingEvidence: coverage?.missingEvidence || [],
        sourceConcentration: coverage?.sourceConcentration || null,
        fullValidationCoverage,
        fullConditionalPacks: fullConditionalPacks.map((pack) => ({
          key: pack.key,
          trigger: pack.conditionalTrigger,
        })),
        conditionalCallTrigger,
        repairAddedEvidence,
        repairGroundingSummary: repairGroundingText
          ? "Conditional grounded repair completed; only accepted retrieved pages were passed to synthesis."
          : "",
        targetCustomer: inputMeta.targetCustomer,
        targetRegion: inputMeta.targetRegion,
        combinedText: `RETRIEVED_EVIDENCE_DOSSIER:\n${dossier}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return stageFailed(
      /timeout|429|temporar|5\d\d/i.test(message) ? "transient" : "permanent",
      `External retrieval failed: ${message}`,
    );
  }
}

function mergeCounts(
  left: Record<string, number>,
  right: Record<string, number>,
) {
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    result[key] = (result[key] || 0) + value;
  }
  return result;
}

function normalizeRetrievalRejection(reason: string) {
  if (/semantic/.test(reason)) return "semantic_mismatch";
  if (/excerpt|empty|extract/.test(reason)) return "missing_excerpt";
  if (/duplicate/.test(reason)) return "duplicate_source";
  if (/authority|tier/.test(reason)) return "weak_authority";
  if (/pricing|numeric/.test(reason)) return "pricing_mismatch";
  if (/parse|invalid_url/.test(reason)) return "parsing_failure";
  return "inaccessible_page";
}

function safeDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}
