import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { computeFactors, calculateDeterministicScore, verdictFor, type WeightRow } from "../../scoring-engine.ts";
import { updateState } from "../../pipeline-utils.ts";
import { gateVerdict } from "../../reasoning-integrity.ts";

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
      .select("id, signal_type, strength, title, snippet, source_tier, source_id, source_domain, excluded, disconfirming, independent_source_count, created_at")
      .eq("run_id", runId);

    const { data: competitors } = await db.from("competitors").select("*").eq("opportunity_id", opportunityId);
    const { data: risks } = await db.from("risks").select("*").eq("opportunity_id", opportunityId);
    const { data: pricing } = await db.from("pricing_models").select("*").eq("opportunity_id", opportunityId).maybeSingle();
    const { data: launch } = await db.from("launch_plans").select("*, launch_strategies(*)").eq("opportunity_id", opportunityId).maybeSingle();
    const { data: weightRows } = await db.from("scoring_weights").select("criterion, weight");
    const { data: evidenceClusters } = await db.from("evidence_clusters").select("*").eq("opportunity_id", opportunityId);

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

    // --- Compute confidence ---
    const usable = (evidence || []).filter((e: any) => !e.excluded);
    
    // 1. Source count with diminishing returns
    const targetCount = mode === "full_validation" ? 15 : 8;
    const baseVolumeScore = Math.min(1, usable.length / targetCount);
    
    // 2. Source independence
    const totalIndependentDomains = new Set(usable.map((e: any) => e.source_domain).filter(Boolean)).size;
    const independenceScore = usable.length > 0 ? Math.min(1, totalIndependentDomains / (usable.length * 0.5 + 1)) : 0;
    
    // 3. Source authority (tier distribution)
    const tier1and2 = usable.filter((e: any) => e.source_tier === 1 || e.source_tier === 2).length;
    const authorityScore = usable.length > 0 ? Math.min(1, (tier1and2 * 1.5 + (usable.length - tier1and2) * 0.5) / usable.length) : 0;
    
    // 4. Contradiction balance
    const confirmingCount = usable.filter((e: any) => !e.disconfirming).length;
    const contradictionScore = usable.length > 0 ? confirmingCount / usable.length : 0;

    // 5. Evidence-family coverage
    const hasProblem = usable.some((e: any) => e.signal_type === "Pain");
    const hasSolution = usable.some((e: any) => e.signal_type === "Demand" || e.signal_type === "Pricing");
    const coverageScore = (hasProblem ? 0.5 : 0) + (hasSolution ? 0.5 : 0);
    
    // Weighted confidence
    const confidenceRaw = 
      (baseVolumeScore * 0.30) + 
      (independenceScore * 0.20) + 
      (authorityScore * 0.20) + 
      (contradictionScore * 0.15) + 
      (coverageScore * 0.15);
      
    // Penalty for adversarial downgrade
    const finalConfidenceRaw = adversarialDowngrade ? confidenceRaw * 0.7 : confidenceRaw;
    const confidence = Math.min(1, Math.max(0, finalConfidenceRaw));

    // --- Persist score ---
    const { data: score, error: scoreError } = await db
      .from("opportunity_scores")
      .upsert({
        opportunity_id: opportunityId,
        total,
        confidence: Math.round(confidence * 100),
        verdict: effectiveVerdict,
      }, { onConflict: "opportunity_id" })
      .select("id")
      .single();

    if (scoreError || !score) throw new Error(`Score insert failed: ${scoreError.message}`);

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
      source_data: factors.map(f => ({ criterion: f.criterion, score: f.score })),
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
      source_data: tiers,
      supporting_evidence_ids: (evidence || []).map((e: any) => e.id)
    });

    if (mode === "full_validation") {
      // 4. Pain Clusters
      if (evidenceClusters && evidenceClusters.length > 0) {
        chartDatasets.push({
          chart_key: "pain-clusters",
          chart_type: "scatter",
          source_data: evidenceClusters.filter((c: any) => c.signal_type === "Pain").map((c: any) => ({ name: c.cluster_key, size: c.supporting_evidence_ids?.length || 1 })),
          supporting_evidence_ids: evidenceClusters.filter((c: any) => c.signal_type === "Pain").flatMap((c: any) => c.supporting_evidence_ids || [])
        });
      }

      // 5. Competitor Comparison
      if (competitors && competitors.length > 0) {
        chartDatasets.push({
          chart_key: "competitor-comparison",
          chart_type: "bar",
          source_data: competitors.map((c: any) => ({ name: c.name, diff: c.differentiation })),
          supporting_evidence_ids: []
        });
      }

      // 6. Pricing Landscape
      if (pricing) {
        chartDatasets.push({
          chart_key: "pricing-landscape",
          chart_type: "line",
          source_data: { floor: pricing.price_floor, average: pricing.average_acv, ceiling: pricing.price_ceiling },
          supporting_evidence_ids: []
        });
      }

      // 7. Evidence Timeline
      chartDatasets.push({
        chart_key: "evidence-timeline",
        chart_type: "line",
        source_data: (evidence || []).map((e: any) => ({ title: e.title, date: e.created_at })),
        supporting_evidence_ids: (evidence || []).map((e: any) => e.id)
      });
      // 8. Score Contribution
      chartDatasets.push({
        chart_key: "score-contribution",
        chart_type: "waterfall",
        source_data: factors.map(f => ({ name: f.criterion, contribution: f.score * (weights.find(w => w.criterion === f.criterion)?.weight || 1) })),
        supporting_evidence_ids: []
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
        confidence: Math.round(confidence * 100),
        chartDatasets
      }
    });
  } catch (error: any) {
    return stageFailed("permanent", `Analyze and score failed: ${error.message}`);
  }
}
