/**
 * Stage: check_coverage
 *
 * Evaluates evidence sufficiency using the deterministic rules from
 * retrieval-strategy.ts. Persists coverage results to research_passes
 * and determines whether gap research is needed.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted } from "../stages.ts";
import { evaluateSufficiency, type RetrievalEvidence, type ResearchPass } from "../retrieval-strategy.ts";

export async function executeCheckCoverage(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, researchCycle, db, config, startedAt } = ctx;

  // --- Load all evidence for the run ---
  const { data: evidence, error: evError } = await db
    .from("evidence_items")
    .select("id, evidence_family, research_pass, source_tier, excluded, signal_type, snippet, source_id, source_domain, author, disconfirming, independent_source_count, independent_domain_count")
    .eq("run_id", runId);

  if (evError || !evidence) {
    return stageCompleted("gap_research", { reason: "evidence_load_failed" }, {
      duration_ms: Date.now() - startedAt,
    });
  }

  // --- Determine which passes have been attempted ---
  const { data: passes } = await db
    .from("research_passes")
    .select("pass_number")
    .eq("run_id", runId)
    .eq("research_cycle", researchCycle);

  const attemptedPasses = (passes || []).map((p: any) => p.pass_number as ResearchPass);

  // --- Evaluate sufficiency ---
  const coverage = evaluateSufficiency(
    evidence as RetrievalEvidence[],
    { attemptedPasses },
    config.evidenceSufficiency,
  );

  // --- Persist coverage to the run ---
  await db
    .from("research_runs")
    .update({
      retrieval_sufficient: coverage.sufficient,
      retrieval_coverage: coverage,
      retrieval_coverage_gaps: coverage.gaps,
      last_progress_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", runId);

  // --- Persist per-pass coverage ---
  for (const passNumber of attemptedPasses) {
    const passEvidence = evidence.filter((e: any) => e.research_pass === passNumber);
    const passCoverage = evaluateSufficiency(
      passEvidence as RetrievalEvidence[],
      { attemptedPasses: [passNumber] },
      config.evidenceSufficiency,
    );

    await db.from("research_passes").upsert(
      {
        run_id: runId,
        research_cycle: researchCycle,
        pass_number: passNumber,
        objective: passNumber === 1 ? "broad" : passNumber === 2 ? "targeted" : "disconfirming",
        evidence_count: passEvidence.length,
        sufficient: passCoverage.sufficient,
        coverage: passCoverage,
        coverage_gaps: passCoverage.gaps,
        status: "Complete",
        completed_at: new Date().toISOString(),
      },
      { onConflict: "run_id,research_cycle,pass_number" },
    );
  }

  // --- Decide next stage ---
  if (coverage.sufficient) {
    // Evidence is sufficient — skip gap research, go to specialist packs
    return stageCompleted(
      "build_specialist_packs",
      { sufficient: true, coverage },
      { duration_ms: Date.now() - startedAt },
    );
  }

  // Gaps exist — proceed to gap research
  return stageCompleted(
    "gap_research",
    { sufficient: false, gaps: coverage.gaps, coverage },
    { duration_ms: Date.now() - startedAt },
    { nextInputMeta: { gaps: coverage.gaps, coverageResult: coverage } },
  );
}
