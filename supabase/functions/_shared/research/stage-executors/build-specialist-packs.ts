/**
 * Stage: build_specialist_packs
 *
 * Assembles filtered evidence packs for each specialist agent.
 * Loads opportunity artifacts and validates normalized rows.
 * Persists the structured specialist input context.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { updateState } from "../pipeline-utils.ts";
import { buildSpecialistPack, clusterEvidence, evidenceConfidence } from "../evidence-intelligence.ts";

export async function executeBuildSpecialistPacks(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, startedAt } = ctx;

  // --- Load opportunity ---
  const { data: opp, error: oppError } = await db
    .from("opportunities")
    .select("id, name, one_liner, target_customer, core_pain, market")
    .eq("run_id", runId)
    .single();

  if (oppError || !opp) {
    return stageFailed("permanent", `Opportunity not found: ${oppError?.message}`);
  }

  // --- Load evidence with source data ---
  const { data: evidence, error: evError } = await db
    .from("evidence_items")
    .select("*, sources(url, title, source_type)")
    .eq("run_id", runId);

  if (evError || !evidence?.length) {
    return stageFailed("permanent", "No evidence found for specialist packs");
  }

  // --- Build the allowed citation set ---
  const allowedIds = new Set<string>(
    evidence
      .filter(
        (e: any) =>
          e.id && e.source_id && !e.excluded && e.source_tier !== 4 && e.sources?.url,
      )
      .map((e: any) => e.id),
  );

  if (!allowedIds.size) {
    return stageFailed("permanent", "No citable evidence items found");
  }

  // --- Load opportunity artifacts (competitors, risks, pricing, etc.) ---
  const [compQ, riskQ, pricingQ, mvpQ, launchQ, weightQ] = await Promise.all([
    db.from("competitors").select("id,name,positioning,pricing,target,strength,gap").eq("opportunity_id", opp.id),
    db.from("risks").select("id,category,severity,description,mitigation").eq("opportunity_id", opp.id),
    db.from("pricing_models").select("*").eq("opportunity_id", opp.id).maybeSingle(),
    db.from("mvp_plans").select("*,mvp_scope_items(*)").eq("opportunity_id", opp.id).maybeSingle(),
    db.from("launch_plans").select("*,launch_strategies(*)").eq("opportunity_id", opp.id).maybeSingle(),
    db.from("scoring_weights").select("criterion,weight"),
  ]);

  // --- Load retrieval metadata ---
  const [passQ, coverageQ] = await Promise.all([
    db.from("research_passes").select("pass_number,objective,query_count,evidence_count,sufficient,coverage,coverage_gaps,budget_limited")
      .eq("run_id", runId).order("pass_number"),
    db.from("research_runs").select("retrieval_sufficient,retrieval_coverage,retrieval_coverage_gaps,retrieval_budget_limited")
      .eq("id", runId).single(),
  ]);

  // --- Package the structured context ---
  const structured = {
    opportunity: opp,
    evidence,
    competitors: compQ.data || [],
    risks: riskQ.data || [],
    pricing_model: pricingQ.data,
    mvp_plan: mvpQ.data,
    launch_plan: launchQ.data,
    retrieval: { passes: passQ.data || [], ...coverageQ.data },
  };
  const clusters = clusterEvidence(evidence as any);
  const gaps = coverageQ.data?.retrieval_coverage_gaps || [];
  const specialistPacks = Object.keys({ demand: 1, competition: 1, market: 1, pricing: 1, risk: 1, gtm: 1 })
    .map((name) => buildSpecialistPack(name, clusters, gaps));
  const confidence = evidenceConfidence(evidence as any, clusters);
  // Materialize a minimal run-scoped graph: source -> evidence -> normalized claim.
  // It intentionally never joins across runs, so tenant conclusions cannot leak.
  for (const item of evidence.filter((e: any) => e.id && e.source_id)) {
    const { data: sourceNode } = await db.from("evidence_graph_nodes").upsert({ run_id: runId, node_type: "source", node_key: item.source_id, label: item.sources?.title || item.source_id, attributes: { url: item.sources?.url || null } }, { onConflict: "run_id,node_type,node_key" }).select("id").single();
    const { data: evidenceNode } = await db.from("evidence_graph_nodes").upsert({ run_id: runId, node_type: "evidence_item", node_key: item.id, label: item.title || item.id, attributes: { signal_type: item.signal_type, source_id: item.source_id } }, { onConflict: "run_id,node_type,node_key" }).select("id").single();
    const claimKey = `${item.signal_type}:${String(item.pain_point || item.title || item.id).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const { data: claimNode } = await db.from("evidence_graph_nodes").upsert({ run_id: runId, node_type: "claim", node_key: claimKey, label: item.pain_point || item.title || "Extracted claim", attributes: { signal_type: item.signal_type } }, { onConflict: "run_id,node_type,node_key" }).select("id").single();
    if (sourceNode?.id && evidenceNode?.id) await db.from("evidence_graph_edges").upsert({ run_id: runId, from_node_id: sourceNode.id, to_node_id: evidenceNode.id, relation: item.disconfirming ? "source_contradicts_claim" : "source_supports_claim", evidence_ids: [item.id] }, { onConflict: "run_id,from_node_id,to_node_id,relation" });
    if (evidenceNode?.id && claimNode?.id) await db.from("evidence_graph_edges").upsert({ run_id: runId, from_node_id: evidenceNode.id, to_node_id: claimNode.id, relation: item.disconfirming ? "contradicts" : "supports", evidence_ids: [item.id] }, { onConflict: "run_id,from_node_id,to_node_id,relation" });
  }

  const weights = (weightQ.data || []).map((w: any) => ({
    criterion: w.criterion,
    weight: Number(w.weight),
  }));

  await updateState(runId, "Scoring", 70, "Specialist evidence packs assembled", db);

  return stageCompleted(
    "run_specialists",
    {
      opportunityId: opp.id,
      allowedEvidenceIds: [...allowedIds],
      structured,
      weights,
      evidenceCount: evidence.length,
      citableCount: allowedIds.size,
      specialistPacks,
      evidenceConfidence: confidence,
    },
    { duration_ms: Date.now() - startedAt },
    {
      nextInputMeta: {
        opportunityId: opp.id,
        allowedEvidenceIds: [...allowedIds],
        specialistPacks,
        evidenceConfidence: confidence,
      },
    },
  );
}
