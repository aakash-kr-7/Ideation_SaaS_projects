import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import {
  calculateDeterministicScore,
  computeFactors,
  deriveScoreConfidenceBand,
  verdictFor,
  type WeightRow,
} from "../../scoring-engine.ts";
import { updateState } from "../../pipeline-utils.ts";
import {
  buildEvidenceSufficiencySummary,
  buildVerdictChangeConditions,
} from "../../evidence-integrity.ts";
import {
  applyFullValidationAdversarialGate,
  buildAlternativeMap,
  buildEconomicsScenarios,
  buildFullValidationFactorAnalysis,
  buildThirtyDayActionPlan,
  buildVerdictStructure,
  deterministicDecisionFingerprint,
  rankBuyerSegments,
  type EconomicsConstraints,
  type FullValidationEvidence,
  type SegmentCandidate,
  type VerifiedPrice,
} from "../../full-validation-decision.ts";
import { reviewWithOptionalGroq } from "../../groq-classifier.ts";

export async function executeHybridAnalyzeScore(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, startedAt, inputMeta } = ctx;
  const opportunityId = inputMeta.opportunityId as string;
  const mode = (inputMeta.mode as string) || "quick_scan";
  const adversarialResult = inputMeta.adversarialResult as any;

  try {
    await updateState(
      runId,
      "Scoring",
      85,
      "Computing deterministic score and building charts...",
      db,
    );

    // --- Load evidence and artifacts ---
    const { data: evidence } = await db
      .from("evidence_items")
      .select(
        "id, signal_type, strength, title, snippet, evidence_family, evidence_topic, source_tier, source_id, source_domain, source_class, excluded, disconfirming, independent_source_count, independent_domain_count, created_at, relevance_score, relevance_class, matched_brief_dimensions, acceptance_decision, claim_id, canonical_source_id, canonical_domain, source_family, source_authority, evidence_directness, semantic_relevance, independence_key, syndication_group, claim_fingerprint, evidence_role, associated_factor_ids, extraction_confidence, numeric_validation_state, model_classification_metadata, segment",
      )
      .eq("run_id", runId);

    const { data: competitors } = await db.from("competitors").select("*").eq(
      "opportunity_id",
      opportunityId,
    );
    const { data: risks } = await db.from("risks").select("*").eq(
      "opportunity_id",
      opportunityId,
    );
    const { data: pricing } = await db.from("pricing_models").select("*").eq(
      "opportunity_id",
      opportunityId,
    ).maybeSingle();
    const { data: launch } = await db.from("launch_plans").select(
      "*, launch_strategies(*)",
    ).eq("opportunity_id", opportunityId).maybeSingle();
    const { data: mvp } = await db.from("mvp_plans").select(
      "*, mvp_scope_items(*)",
    ).eq("opportunity_id", opportunityId).maybeSingle();
    const { data: run } = await db.from("research_runs").select(
      "target_customer, assumptions",
    ).eq("id", runId).single();
    const { data: briefRow } = await db.from("research_briefs").select(
      "brief",
    ).eq("run_id", runId).maybeSingle();
    const { data: propositions } = mode === "full_validation"
      ? await db.from("research_propositions").select(
        "buyer_segment, proposition_key",
      ).eq("run_id", runId)
      : { data: [] };
    const { data: validatedPrices } = mode === "full_validation"
      ? await db.from("validated_pricing_observations").select(
        "source_id,source_url,price_point,pricing_model",
      ).eq("run_id", runId)
      : { data: [] };
    const { data: weightRows } = await db.from("scoring_weights").select(
      "criterion, weight",
    );
    const { data: evidenceClusters } = await db.from("evidence_clusters")
      .select("*").eq("opportunity_id", opportunityId);
    const { count: unresolvedContradictionCount } = await db.from(
      "evidence_contradictions",
    )
      .select("id", { count: "exact", head: true })
      .eq("run_id", runId)
      .eq("resolution_status", "unresolved");

    // --- Compute factors (deterministic, no provider calls) ---
    const factors = computeFactors({
      evidence: evidence || [],
      risks: risks || [],
      competitors: (competitors || []).filter((competitor: any) =>
        ["live_verified_competitor", "adjacent_alternative"].includes(
          competitor.verification_status,
        )
      ),
      hasPricingModel: !!pricing,
      launchStrategyCount: launch?.launch_strategies?.length || 0,
      unresolvedContradictionCount: unresolvedContradictionCount || 0,
    });

    const weights = (weightRows || []).map((w: any) => ({
      criterion: w.criterion,
      weight: Number(w.weight),
    })) as WeightRow[];

    const total = calculateDeterministicScore(factors, weights);
    const deterministicVerdict = verdictFor(total);
    const scoreBand = deriveScoreConfidenceBand(factors, weights, total);
    const evidenceSufficiency = buildEvidenceSufficiencySummary(
      (evidence || []) as any,
      factors,
      scoreBand,
    );
    const verdictChangeConditions = buildVerdictChangeConditions(
      total,
      factors,
      weights,
    );

    // --- Full Validation deterministic decision layer ---
    let effectiveVerdict: string = deterministicVerdict;
    let adversarialDowngrade = false;
    let gateReason: string | null = null;
    let fullValidationDecision: any = null;
    if (mode === "full_validation") {
      const acceptedEvidence = (evidence || []) as FullValidationEvidence[];
      const defaultSegment = String(run?.target_customer || "").trim() ||
        "Canonical target buyer";
      const insightSegments = Array.isArray(
          (inputMeta.fullValidationInsights as any)?.targetSegments,
        )
        ? (inputMeta.fullValidationInsights as any).targetSegments
        : [];
      const segmentCandidates = mergeSegmentCandidates([
        ...insightSegments.map((item: any) => ({
          name: String(item.name || "").trim(),
          evidenceIds: Array.isArray(item.evidenceIds)
            ? item.evidenceIds.map(String)
            : [],
        })),
        ...(propositions || []).map((item: any) => ({
          name: String(item.buyer_segment || "").trim(),
          evidenceIds: [],
        })),
        {
          name: defaultSegment,
          evidenceIds: acceptedEvidence.filter((item) =>
            normalizeSegment(item.segment || "") ===
              normalizeSegment(defaultSegment)
          ).map((item) => item.id),
        },
      ]);
      const segmentDecision = rankBuyerSegments(
        segmentCandidates,
        acceptedEvidence,
      );
      const alternativeMap = buildAlternativeMap(
        (competitors || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          target: item.target,
          positioning: item.positioning,
          pricing: item.pricing,
          strength: item.strength,
          gap: item.gap,
          classification: item.classification,
          verificationStatus: item.verification_status,
          evidenceIds: item.evidence_ids || [],
        })),
        acceptedEvidence,
      );
      const constraints = economicsConstraints(run?.assumptions);
      const verifiedPriceInputs = (validatedPrices || []).flatMap((item: any) =>
        parseVerifiedPrice(item)
      );
      const economicsScenarios = buildEconomicsScenarios({
        verifiedPrices: verifiedPriceInputs,
        constraints,
        evidence: acceptedEvidence,
        operationalRiskCount: (risks || []).filter((risk: any) =>
          ["Execution", "Platform"].includes(risk.category) &&
          risk.severity !== "Low"
        ).length,
      });
      const factorAnalysis = buildFullValidationFactorAnalysis(
        factors,
        acceptedEvidence,
        defaultSegment,
      );
      for (const analysis of factorAnalysis) {
        const factorEvidenceIds = new Set(
          factors.find((item) => item.criterion === analysis.criterion)
            ?.evidenceIds || [],
        );
        const applicableSegments = segmentCandidates.filter((candidate) =>
          candidate.evidenceIds.some((id) => factorEvidenceIds.has(id))
        ).map((candidate) => candidate.name);
        if (applicableSegments.length) {
          analysis.buyerSegmentApplicability = applicableSegments;
        }
      }
      const adversarialGate = applyFullValidationAdversarialGate({
        deterministicVerdict,
        factors,
        segmentRankings: segmentDecision.rankings,
        recommendedSegment: segmentDecision.recommendedSegment,
        alternatives: alternativeMap,
        evidence: acceptedEvidence,
        risks: (risks || []).map((risk: any) => ({
          category: risk.category,
          severity: risk.severity,
          description: risk.description,
        })),
        strongObjection: adversarialResult?.outcome === "StrongObjection" &&
          ["High", "Medium"].includes(adversarialResult?.severity),
      });
      effectiveVerdict = adversarialGate.verdict;
      adversarialDowngrade = adversarialGate.lowered;
      gateReason = adversarialGate.reasons.join(" ") || null;
      const evidenceBackedGap = alternativeMap.find((item) =>
        item.differentiationGap
      )?.differentiationGap || null;
      const mvpOutcome = String(mvp?.outcome || "").trim() || null;
      const recommendedWedge = evidenceBackedGap || mvpOutcome;
      const verdictStructure = buildVerdictStructure({
        verdict: adversarialGate.verdict,
        exactScore: total,
        scoreRange: scoreBand,
        evidenceConfidence: evidenceSufficiency.overallEvidenceConfidence,
        factors,
        evidence: acceptedEvidence,
        recommendedSegment: segmentDecision.recommendedSegment,
        recommendedWedge,
      });
      const recruitmentChannel =
        String(launch?.first_customer_channel || "").trim() || null;
      const founderActionPlan = buildThirtyDayActionPlan({
        targetSegment: segmentDecision.recommendedSegment,
        wedge: recommendedWedge,
        constraints,
        recruitmentChannel,
      });
      const optionalGroqReview = briefRow?.brief
        ? await reviewWithOptionalGroq({
          runId,
          db,
          brief: briefRow.brief,
          claims: acceptedEvidence.map((item) => ({
            fingerprint: item.claim_fingerprint || item.id,
            title: item.title,
            snippet: item.snippet,
            codeRole: item.evidence_role === "challenging" ||
                item.disconfirming
              ? "challenging" as const
              : "supporting" as const,
          })),
          risks: (risks || []).map((risk: any) => ({
            category: risk.category,
            severity: risk.severity,
            description: risk.description,
          })),
        })
        : {
          available: false,
          concerns: [],
          disagreements: [],
          failure: "Canonical brief unavailable for optional review.",
        };
      const deterministicPayload = {
        factorAnalysis,
        segmentRankings: segmentDecision.rankings,
        recommendedSegment: segmentDecision.recommendedSegment,
        alternativeMap,
        economicsScenarios,
        adversarialGate,
        verdictStructure,
        founderActionPlan,
      };
      fullValidationDecision = {
        ...deterministicPayload,
        optionalGroqReview,
        deterministicFingerprint:
          deterministicDecisionFingerprint(deterministicPayload),
      };
    }

    // Scoring confidence measures evidence-bound factor coverage and inherits a
    // hard ceiling from evidence quality. Successful arithmetic alone cannot
    // produce a high-confidence score.
    const totalWeight = weights.reduce((sum, row) => sum + row.weight, 0) || 1;
    const confidence = Math.max(0, Math.min(100, Math.round(
      factors.reduce((sum, factor) =>
        sum + factor.evidenceCoefficient *
          (weights.find((row) => row.criterion === factor.criterion)?.weight || 0),
      0) / totalWeight * 100,
    )));

    // --- Persist score ---
    const { data: score, error: scoreError } = await db
      .from("opportunity_scores")
      .upsert({
        opportunity_id: opportunityId,
        total,
        confidence,
        verdict: effectiveVerdict,
      }, { onConflict: "opportunity_id" })
      .select("id")
      .single();

    if (scoreError || !score) {
      throw new Error(`Score insert failed: ${scoreError.message}`);
    }
    await db.from("evidence_confidence_results").update({
      scoring_confidence: confidence,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    // --- Persist breakdowns ---
    for (const factor of factors) {
      const fullFactor = fullValidationDecision?.factorAnalysis?.find(
        (item: any) => item.criterion === factor.criterion,
      );
      const { data: breakdown } = await db.from("score_breakdowns").upsert({
        score_id: score.id,
        criterion: factor.criterion,
        score: factor.score,
        raw_score: factor.rawScore,
        evidence_coefficient: factor.evidenceCoefficient,
        effective_score: factor.effectiveScore,
        evidence_state: factor.evidenceState,
        supporting_evidence_ids: factor.supportingEvidenceIds,
        challenging_evidence_ids: factor.challengingEvidenceIds,
        confidence_deductions: factor.confidenceDeductions,
        unresolved_gaps: factor.unresolvedGaps,
        ...(mode === "full_validation"
          ? {
            buyer_segment_applicability:
              fullFactor?.buyerSegmentApplicability || [],
            unresolved_assumptions:
              fullFactor?.unresolvedAssumptions || [],
            score_sensitivity: fullFactor?.scoreSensitivity || {},
          }
          : {}),
        notes: factor.note,
        weight: weights.find((w) => w.criterion === factor.criterion)?.weight ||
          1,
      }, { onConflict: "score_id,criterion" }).select("id").single();

      if (breakdown) {
        for (const evidenceId of factor.evidenceIds) {
          await db.from("score_evidence_refs").upsert({
            score_breakdown_id: breakdown.id,
            evidence_id: evidenceId,
          }, {
            onConflict: "score_breakdown_id,evidence_id",
            ignoreDuplicates: true,
          });
        }
      }
    }
    if (mode === "full_validation" && fullValidationDecision) {
      const { error: decisionError } = await db.from(
        "full_validation_decisions",
      ).upsert({
        run_id: runId,
        opportunity_id: opportunityId,
        official_score: total,
        honest_score_range: scoreBand,
        evidence_confidence:
          evidenceSufficiency.overallEvidenceConfidence,
        official_verdict: effectiveVerdict,
        factor_analysis: fullValidationDecision.factorAnalysis,
        segment_rankings: fullValidationDecision.segmentRankings,
        recommended_segment: fullValidationDecision.recommendedSegment,
        alternative_map: fullValidationDecision.alternativeMap,
        economics_scenarios: fullValidationDecision.economicsScenarios,
        adversarial_gate: fullValidationDecision.adversarialGate,
        verdict_structure: fullValidationDecision.verdictStructure,
        founder_action_plan: fullValidationDecision.founderActionPlan,
        optional_groq_review: fullValidationDecision.optionalGroqReview,
        deterministic_fingerprint:
          fullValidationDecision.deterministicFingerprint,
        updated_at: new Date().toISOString(),
      }, { onConflict: "run_id" });
      if (decisionError) {
        throw new Error(
          `Full Validation decision persistence failed: ${decisionError.message}`,
        );
      }
    }

    // --- Build Chart Datasets in Memory ---
    const chartDatasets = [];

    // 1. Opportunity Factor Breakdown
    chartDatasets.push({
      chart_key: "opportunity-factor-breakdown",
      chart_type: "radar",
      source_data: {
        values: Object.fromEntries(factors.map((f) => [f.criterion, f.effectiveScore])),
        rawValues: Object.fromEntries(factors.map((f) => [f.criterion, f.rawScore])),
      },
      supporting_evidence_ids: factors.flatMap((f) => f.evidenceIds),
    });

    // 2. Evidence Balance
    const pos = (evidence || []).filter((e: any) => !e.disconfirming).length;
    const neg = (evidence || []).filter((e: any) => e.disconfirming).length;
    chartDatasets.push({
      chart_key: "evidence-balance",
      chart_type: "pie",
      source_data: { positive: pos, negative: neg },
      supporting_evidence_ids: (evidence || []).map((e: any) => e.id),
    });

    // 3. Source-Quality Distribution
    const tiers = { t1: 0, t2: 0, t3: 0, t4: 0 };
    (evidence || []).forEach((e: any) => {
      if (e.source_tier === 1) tiers.t1++;
      else if (e.source_tier === 2) tiers.t2++;
      else if (e.source_tier === 3) tiers.t3++;
      else tiers.t4++;
    });
    chartDatasets.push({
      chart_key: "source-quality-distribution",
      chart_type: "bar",
      source_data: { byTier: tiers },
      supporting_evidence_ids: (evidence || []).map((e: any) => e.id),
    });

    const bySignal = (evidence || []).reduce(
      (all: Record<string, number>, item: any) => {
        all[item.signal_type] = (all[item.signal_type] || 0) + 1;
        return all;
      },
      {},
    );
    const byFamily = (evidence || []).reduce(
      (all: Record<string, number>, item: any) => {
        const family = item.evidence_family || "unclassified";
        all[family] = (all[family] || 0) + 1;
        return all;
      },
      {},
    );
    chartDatasets.push({
      chart_key: "evidence_coverage",
      chart_type: "bar",
      source_data: { bySignal, byFamily },
      supporting_evidence_ids: (evidence || []).map((e: any) => e.id),
    });

    if (mode === "full_validation") {
      // 4. Pain Clusters
      if (evidenceClusters && evidenceClusters.length > 0) {
        chartDatasets.push({
          chart_key: "pain-clusters",
          chart_type: "scatter",
          source_data: {
            values: Object.fromEntries(
              evidenceClusters.filter((c: any) => c.signal_type === "Pain").map(
                (
                  c: any,
                ) => [c.cluster_key, c.supporting_evidence_ids?.length || 1],
              ),
            ),
          },
          supporting_evidence_ids: evidenceClusters.filter((c: any) =>
            c.signal_type === "Pain"
          ).flatMap((c: any) => c.supporting_evidence_ids || []),
        });
      }

      // 5. Competitor Comparison
      const evidenceBoundCompetitors = (competitors || []).filter(
        (competitor: any) =>
          Array.isArray(competitor.evidence_ids) &&
          competitor.evidence_ids.length > 0,
      );
      if (evidenceBoundCompetitors.length > 0) {
        chartDatasets.push({
          chart_key: "competitor-comparison",
          chart_type: "bar",
          source_data: {
            values: Object.fromEntries(
              evidenceBoundCompetitors.map((
                competitor: any,
              ) => [competitor.name, 1]),
            ),
          },
          supporting_evidence_ids: [
            ...new Set(evidenceBoundCompetitors.flatMap((competitor: any) =>
              competitor.evidence_ids
            )),
          ],
        });
      }

      // 6. Pricing Landscape
      if (pricing) {
        const pricingEvidenceIds = (evidence || []).filter((item: any) =>
          item.signal_type === "Pricing"
        ).map((item: any) =>
          item.id
        );
        const pricedCompetitors = evidenceBoundCompetitors.filter(
          (competitor: any) =>
            competitor.pricing &&
            !/unavailable|unknown|not public/i.test(competitor.pricing),
        );
        chartDatasets.push({
          chart_key: "pricing-landscape",
          chart_type: "line",
          source_data: {
            pricingEvidence: pricingEvidenceIds.length,
            competitorsWithPublicPricing: pricedCompetitors.length,
          },
          supporting_evidence_ids: [
            ...new Set([
              ...pricingEvidenceIds,
              ...pricedCompetitors.flatMap((competitor: any) =>
                competitor.evidence_ids
              ),
            ]),
          ],
        });
      }

      // 7. Score Contribution
      chartDatasets.push({
        chart_key: "score-contribution",
        chart_type: "waterfall",
        source_data: {
          values: Object.fromEntries(
            factors.map((f) => [
              f.criterion,
              f.score *
              (weights.find((w) => w.criterion === f.criterion)?.weight || 1),
            ]),
          ),
        },
        supporting_evidence_ids: factors.flatMap((f) => f.evidenceIds),
      });
    }

    return stageCompleted("generate_report", {
      scoreId: score.id,
      total,
      verdict: effectiveVerdict,
      adversarialDowngrade,
      gateReason,
    }, {
      duration_ms: Date.now() - startedAt,
    }, {
      nextInputMeta: {
        opportunityId,
        scoreId: score.id,
        mode,
        total,
        verdict: effectiveVerdict,
        deterministicVerdict,
        adversarialDowngrade,
        confidence,
        scoreBand,
        allowedEvidenceIds: Array.isArray(inputMeta.allowedEvidenceIds)
          ? inputMeta.allowedEvidenceIds
          : [],
        evidenceSufficiency,
        verdictChangeConditions,
        chartDatasets,
        insufficientEvidence: Boolean(inputMeta.insufficientEvidence),
        validationRejections: inputMeta.rejectedClaims || {},
        fullValidationInsights: inputMeta.fullValidationInsights,
        fullValidationDecision,
      },
    });
  } catch (error: any) {
    return stageFailed(
      "permanent",
      `Analyze and score failed: ${error.message}`,
    );
  }
}

function mergeSegmentCandidates(
  values: SegmentCandidate[],
): SegmentCandidate[] {
  const merged = new Map<string, SegmentCandidate>();
  for (const value of values) {
    const name = value.name.trim();
    if (!name) continue;
    const key = normalizeSegment(name);
    const current = merged.get(key);
    merged.set(key, {
      name: current?.name || name,
      evidenceIds: [
        ...new Set([
          ...(current?.evidenceIds || []),
          ...(value.evidenceIds || []),
        ]),
      ],
    });
  }
  return [...merged.values()];
}

function normalizeSegment(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function economicsConstraints(value: unknown): EconomicsConstraints {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  return {
    revenueTarget: positiveNumber(
      input.revenueTarget ?? input.revenue_target ??
        input.annualRevenueTarget,
    ),
    currency: typeof input.currency === "string" ? input.currency : null,
    acquisitionCostRange: numericRange(
      input.acquisitionCostRange ?? input.acquisition_cost_range,
    ),
    variableCostRange: numericRange(
      input.variableCostRange ?? input.variable_cost_range,
    ),
    fixedCostRange: numericRange(
      input.fixedCostRange ?? input.fixed_cost_range,
    ),
    maximumValidationBudget: positiveNumber(
      input.maximumValidationBudget ?? input.maximum_validation_budget,
    ),
    assumedPriceRange: numericRange(
      input.assumedPriceRange ?? input.assumed_price_range,
    ),
  };
}

function parseVerifiedPrice(value: {
  source_id?: string | null;
  source_url?: string | null;
  price_point?: string | null;
  pricing_model?: string | null;
}): VerifiedPrice[] {
  const point = String(value.price_point || "");
  const numeric = point.match(/\d+(?:[.,]\d{1,2})?/);
  if (!numeric) return [];
  const price = Number(numeric[0].replace(",", ""));
  if (!Number.isFinite(price) || price <= 0) return [];
  const currency = point.includes("$")
    ? "USD"
    : point.includes("€")
    ? "EUR"
    : point.includes("£")
    ? "GBP"
    : point.includes("₹")
    ? "INR"
    : point.match(/\b(?:USD|EUR|GBP|INR)\b/i)?.[0]?.toUpperCase() ||
      "UNKNOWN";
  const billingPeriod: VerifiedPrice["billingPeriod"] =
    /month|\/mo\b/i.test(point)
      ? "month"
      : /year|annual|\/yr\b/i.test(point)
      ? "year"
      : value.pricing_model === "one_time"
      ? "one_time"
      : value.pricing_model === "usage"
      ? "usage"
      : "unknown";
  return [{
    price,
    currency,
    billingPeriod,
    sourceId: value.source_id || null,
    sourceUrl: value.source_url || null,
  }];
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function numericRange(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const left = positiveNumber(value[0]);
  const right = positiveNumber(value[1]);
  return left !== null && right !== null
    ? [Math.min(left, right), Math.max(left, right)]
    : null;
}
