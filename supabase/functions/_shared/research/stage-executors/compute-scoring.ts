/**
 * Stage: compute_scoring
 *
 * Runs the deterministic scoring engine on persisted evidence.
 * Applies adversarial verdict gating. Persists scores and breakdowns.
 * Reuses computeFactors + calculateDeterministicScore exactly.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { computeFactors, calculateDeterministicScore, verdictFor, type WeightRow } from "../scoring-engine.ts";
import { gateVerdict } from "../reasoning-integrity.ts";
import { updateState } from "../pipeline-utils.ts";

export async function executeComputeScoring(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, startedAt, inputMeta } = ctx;

  const opportunityId = inputMeta.opportunityId as string;
  const adversarialResult = inputMeta.adversarialResult as any;

  if (!opportunityId) {
    return stageFailed("permanent", "Missing opportunityId");
  }

  // --- Idempotency: check if scoring already exists ---
  const { data: existingScore } = await db
    .from("opportunity_scores")
    .select("id, total, verdict")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  if (existingScore?.id) {
    return stageCompleted(
      "build_charts",
      {
        scoreId: existingScore.id,
        total: existingScore.total,
        verdict: existingScore.verdict,
        alreadyExisted: true,
      },
      { duration_ms: Date.now() - startedAt },
      {
        nextInputMeta: {
          opportunityId,
          scoreId: existingScore.id,
          total: existingScore.total,
          verdict: existingScore.verdict,
        },
      },
    );
  }

  await updateState(runId, "Scoring", 87, "Computing the 12-factor score", db);

  // --- Load evidence and artifacts ---
  const { data: evidence } = await db
    .from("evidence_items")
    .select("id, signal_type, strength, title, snippet, source_tier, source_id, excluded, independent_source_count")
    .eq("run_id", runId);

  const { data: competitors } = await db
    .from("competitors")
    .select("*")
    .eq("opportunity_id", opportunityId);

  const { data: risks } = await db
    .from("risks")
    .select("*")
    .eq("opportunity_id", opportunityId);

  const { data: pricing } = await db
    .from("pricing_models")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  const { data: launch } = await db
    .from("launch_plans")
    .select("*, launch_strategies(*)")
    .eq("opportunity_id", opportunityId)
    .maybeSingle();

  const { data: weightRows } = await db
    .from("scoring_weights")
    .select("criterion, weight");

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
  const { effectiveVerdict, adversarialDowngrade, reason: gateReason } = gateVerdict(
    deterministicVerdict,
    adversarialResult || { outcome: "InsufficientEvidence", severity: "None" },
  );

  // --- Compute confidence ---
  const usable = (evidence || []).filter((e: any) => !e.excluded);
  const confidence = Math.min(1, Math.max(0, (usable.length / 8) * 0.7 + (adversarialDowngrade ? 0 : 0.3)));

  // --- Persist score ---
  const { data: score, error: scoreError } = await db
    .from("opportunity_scores")
    .insert({
      opportunity_id: opportunityId,
      total,
      confidence: Math.round(confidence * 100) / 100,
      verdict: effectiveVerdict,
    })
    .select("id")
    .single();

  if (scoreError || !score) {
    return stageFailed("permanent", `Score insert failed: ${scoreError?.message}`);
  }

  // --- Persist breakdowns ---
  for (const factor of factors) {
    const { data: breakdown } = await db
      .from("score_breakdowns")
      .insert({
        score_id: score.id,
        criterion: factor.criterion,
        score: factor.score,
        notes: factor.note,
        weight: weights.find((w) => w.criterion === factor.criterion)?.weight || 1,
      })
      .select("id")
      .single();

    // Persist score evidence refs
    if (breakdown) {
      for (const evidenceId of factor.evidenceIds) {
        await db.from("score_evidence_refs").insert({
          score_breakdown_id: breakdown.id,
          evidence_id: evidenceId,
        }).then(() => {});
      }
    }
  }

  // --- Update adversarial gate with actual verdict ---
  if (adversarialResult?.status === "Complete") {
    await db
      .from("adversarial_verdict_gates")
      .update({ emerging_verdict: deterministicVerdict })
      .eq("run_id", runId);
  }

  return stageCompleted(
    "build_charts",
    {
      scoreId: score.id,
      total,
      deterministicVerdict,
      effectiveVerdict,
      adversarialDowngrade,
      gateReason,
      confidence,
      factorCount: factors.length,
    },
    { duration_ms: Date.now() - startedAt },
    {
      nextInputMeta: {
        opportunityId,
        scoreId: score.id,
        total,
        verdict: effectiveVerdict,
        deterministicVerdict,
        adversarialDowngrade,
        confidence,
      },
    },
  );
}
