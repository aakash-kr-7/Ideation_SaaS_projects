import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { computeFactors, calculateDeterministicScore, verdictFor, type WeightRow } from "../../scoring-engine.ts";
import { updateState } from "../../pipeline-utils.ts";
import { gateVerdict } from "../../reasoning-integrity.ts";
import { evidenceConfidence } from "../../evidence-intelligence.ts";

export async function executeHybridAnalyzeScore(ctx: StageContext): Promise<StageResult> {
  const { runId, db, startedAt, inputMeta } = ctx;
  const opportunityId = inputMeta.opportunityId as string;
  const mode = (inputMeta.mode as string) || "quick_scan";
  const adversarialResult = inputMeta.adversarialResult as any;

  try {
    await updateState(runId, "Scoring", 85, "Computing deterministic score and building charts...", db);

    // --- Load evidence and artifacts ---
    const { data: evidence } = await db
      .from("evidence_items")
      .select("id, signal_type, strength, title, snippet, evidence_family, evidence_topic, source_tier, source_id, source_domain, source_class, excluded, disconfirming, independent_source_count, created_at, relevance_score, relevance_class, matched_brief_dimensions, acceptance_decision")
      .eq("run_id", runId);

    const { data: competitors } = await db.from("competitors").select("*").eq("opportunity_id", opportunityId);
    const { data: risks } = await db.from("risks").select("*").eq("opportunity_id", opportunityId);
    const { data: pricing } = await db.from("pricing_models").select("*").eq("opportunity_id", opportunityId).maybeSingle();
    const { data: launch } = await db.from("launch_plans").select("*, launch_strategies(*)").eq("opportunity_id", opportunityId).maybeSingle();
    const { data: weightRows } = await db.from("scoring_weights").select("criterion, weight");
    const { data: evidenceClusters } = await db.from("evidence_clusters").select("*").eq("opportunity_id", opportunityId);
    const { data: explicitContradictions } = await db.from("evidence_contradictions")
      .select("id")
      .eq("run_id", runId)
      .eq("resolution_status", "unresolved");

    // --- Compute factors (deterministic, no provider calls) ---
    const factors = computeFactors({
      evidence: evidence || [],
      risks: risks || [],
      competitors: competitors || [],
      hasPricingModel: !!pricing,
      launchStrategyCount: launch?.launch_strategies?.length || 0,
    });

    const weights = (weightRows || []).map((w: any) => ({
      criterion: w.criterion,
      weight: Number(w.weight),
    })) as WeightRow[];

    const total = calculateDeterministicScore(factors, weights);
    const deterministicVerdict = verdictFor(total);

    // --- Apply adversarial gating ---
    const { effectiveVerdict, adversarialDowngrade, reason: gateReason } = mode === "full_validation" ? gateVerdict(
      deterministicVerdict,
      adversarialResult || { outcome: "InsufficientEvidence", severity: "None" },
    ) : { effectiveVerdict: deterministicVerdict, adversarialDowngrade: false, reason: null };

    // Scoring confidence measures evidence-bound factor coverage and inherits a
    // hard ceiling from evidence quality. Successful arithmetic alone cannot
    // produce a high-confidence score.
    const usable = (evidence || []).filter((e: any) => !e.excluded && e.acceptance_decision === "accepted_core");
    const evidenceConfidenceResult = evidenceConfidence(usable as any, undefined, explicitContradictions?.length || 0);
    const factorsWithEvidence = factors.filter((factor) => factor.evidenceIds.length > 0).length;
    const factorCoverage = factorsWithEvidence / factors.length;
    const evidenceCeiling = evidenceConfidenceResult.band === "High" ? 95
      : evidenceConfidenceResult.band === "Moderate" ? 75
      : evidenceConfidenceResult.band === "Low" ? 50
      : 25;
    const confidence = Math.max(0, Math.min(
      evidenceCeiling,
      Math.round(25 + factorCoverage * 65 - (adversarialDowngrade ? 10 : 0)),
    ));

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

    if (scoreError || !score) throw new Error(`Score insert failed: ${scoreError.message}`);
    await db.from("evidence_confidence_results").update({
      scoring_confidence: confidence,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);

    // --- Persist breakdowns ---
    for (const factor of factors) {
      const { data: breakdown } = await db.from("score_breakdowns").upsert({
        score_id: score.id,
        criterion: factor.criterion,
        score: factor.score,
        notes: factor.note,
        weight: weights.find((w) => w.criterion === factor.criterion)?.weight || 1,
      }, { onConflict: "score_id,criterion" }).select("id").single();

      if (breakdown) {
        for (const evidenceId of factor.evidenceIds) {
          await db.from("score_evidence_refs").upsert({
            score_breakdown_id: breakdown.id,
            evidence_id: evidenceId,
          }, { onConflict: "score_breakdown_id,evidence_id", ignoreDuplicates: true });
        }
      }
    }

    // --- Build Chart Datasets in Memory ---
    const chartDatasets = [];
    
    // 1. Opportunity Factor Breakdown
    chartDatasets.push({
      chart_key: "opportunity-factor-breakdown",
      chart_type: "radar",
      source_data: { values: Object.fromEntries(factors.map(f => [f.criterion, f.score])) },
      supporting_evidence_ids: factors.flatMap(f => f.evidenceIds)
    });

    // 2. Evidence Balance
    const pos = (evidence || []).filter((e: any) => !e.disconfirming).length;
    const neg = (evidence || []).filter((e: any) => e.disconfirming).length;
    chartDatasets.push({
      chart_key: "evidence-balance",
      chart_type: "pie",
      source_data: { positive: pos, negative: neg },
      supporting_evidence_ids: (evidence || []).map((e: any) => e.id)
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
      supporting_evidence_ids: (evidence || []).map((e: any) => e.id)
    });

    const bySignal = (evidence || []).reduce((all: Record<string, number>, item: any) => {
      all[item.signal_type] = (all[item.signal_type] || 0) + 1;
      return all;
    }, {});
    const byFamily = (evidence || []).reduce((all: Record<string, number>, item: any) => {
      const family = item.evidence_family || "unclassified";
      all[family] = (all[family] || 0) + 1;
      return all;
    }, {});
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
          source_data: { values: Object.fromEntries(evidenceClusters.filter((c: any) => c.signal_type === "Pain").map((c: any) => [c.cluster_key, c.supporting_evidence_ids?.length || 1])) },
          supporting_evidence_ids: evidenceClusters.filter((c: any) => c.signal_type === "Pain").flatMap((c: any) => c.supporting_evidence_ids || [])
        });
      }

      // 5. Competitor Comparison
      const evidenceBoundCompetitors = (competitors || []).filter(
        (competitor: any) => Array.isArray(competitor.evidence_ids) && competitor.evidence_ids.length > 0,
      );
      if (evidenceBoundCompetitors.length > 0) {
        chartDatasets.push({
          chart_key: "competitor-comparison",
          chart_type: "bar",
          source_data: { values: Object.fromEntries(evidenceBoundCompetitors.map((competitor: any) => [competitor.name, 1])) },
          supporting_evidence_ids: [...new Set(evidenceBoundCompetitors.flatMap((competitor: any) => competitor.evidence_ids))]
        });
      }

      // 6. Pricing Landscape
      if (pricing) {
        const pricingEvidenceIds = (evidence || []).filter((item: any) => item.signal_type === "Pricing").map((item: any) => item.id);
        const pricedCompetitors = evidenceBoundCompetitors.filter(
          (competitor: any) => competitor.pricing && !/unavailable|unknown|not public/i.test(competitor.pricing),
        );
        chartDatasets.push({
          chart_key: "pricing-landscape",
          chart_type: "line",
          source_data: {
            pricingEvidence: pricingEvidenceIds.length,
            competitorsWithPublicPricing: pricedCompetitors.length,
          },
          supporting_evidence_ids: [...new Set([
            ...pricingEvidenceIds,
            ...pricedCompetitors.flatMap((competitor: any) => competitor.evidence_ids),
          ])]
        });
      }

      // 7. Score Contribution
      chartDatasets.push({
        chart_key: "score-contribution",
        chart_type: "waterfall",
        source_data: { values: Object.fromEntries(factors.map(f => [f.criterion, f.score * (weights.find(w => w.criterion === f.criterion)?.weight || 1)])) },
        supporting_evidence_ids: factors.flatMap(f => f.evidenceIds)
      });
    }

    return stageCompleted("generate_report", {
      scoreId: score.id,
      total,
      verdict: effectiveVerdict,
      adversarialDowngrade,
      gateReason
    }, {
      duration_ms: Date.now() - startedAt
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
        chartDatasets,
        fullValidationInsights: inputMeta.fullValidationInsights,
      }
    });
  } catch (error: any) {
    return stageFailed("permanent", `Analyze and score failed: ${error.message}`);
  }
}
