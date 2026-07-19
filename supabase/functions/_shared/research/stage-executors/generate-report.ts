/**
 * Stage: generate_report
 *
 * Runs the Final Judge for narrative generation, validates citations,
 * and persists the immutable report version.
 * Reuses finalJudgeSchema, citation validation, and report schema.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { finalJudgeSchema, assertCitationsBelongToRun } from "../reasoning.ts";
import { validateNarrativeCitations, narrativeSupportsVerdict } from "../reasoning-integrity.ts";
import { costBudgetForRun, updateState, logError } from "../pipeline-utils.ts";
import { evidenceConfidence, reportCompleteness } from "../evidence-intelligence.ts";

export async function executeGenerateReport(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta, dependencies } = ctx;

  const opportunityId = inputMeta.opportunityId as string;
  const scoreId = inputMeta.scoreId as string;
  const total = inputMeta.total as number;
  const verdict = inputMeta.verdict as string;
  const chartDatasets = Array.isArray(inputMeta.chartDatasets) ? inputMeta.chartDatasets as any[] : [];

  if (!opportunityId || !scoreId) {
    return stageFailed("permanent", "Missing opportunityId or scoreId");
  }

  // --- Idempotency: check if report already exists ---
  const { data: existingReport } = await db
    .from("reports")
    .select("id")
    .eq("run_id", runId)
    .maybeSingle();

  if (existingReport?.id) {
    return stageCompleted(
      "generate_exports",
      { reportId: existingReport.id, alreadyExisted: true },
      { duration_ms: Date.now() - startedAt },
      { nextInputMeta: { reportId: existingReport.id, opportunityId } },
    );
  }

  await updateState(runId, "Generating", 93, `Generating ${config.label}`, db);

  // --- Load evidence for citations ---
  const [{ data: evidence }, { data: runCoverage }] = await Promise.all([
    db.from("evidence_items")
      .select("id, source_id, excluded, source_tier, snippet, title, signal_type, pain_point, source_domain, disconfirming, created_at, sources(url)")
      .eq("run_id", runId),
    db.from("research_runs")
      .select("retrieval_sufficient,retrieval_coverage_gaps,status")
      .eq("id", runId)
      .single(),
  ]);

  if (runCoverage?.status === "Cancelled") return stageFailed("permanent", "Run was cancelled before publication.");

  const allowed = new Set<string>(
    (evidence || [])
      .filter((e: any) => e.id && e.source_id && !e.excluded && e.source_tier !== 4 && e.sources?.url)
      .map((e: any) => e.id),
  );
  const confidence = evidenceConfidence((evidence || []) as any);

  // --- Load breakdowns ---
  const { data: breakdowns } = await db
    .from("score_breakdowns")
    .select("criterion, score, weight, notes, id")
    .eq("score_id", scoreId);

  // --- Run Final Judge ---
  const budget = await costBudgetForRun(runId, db, config);

  let judgeOutput: any;
  try {
    judgeOutput = await dependencies.reasoning.generate({
      runId, operation: "final_judge", db, budget,
      systemPrompt:
        `You are the Final Judge for startup validation. Write a verdict for this idea based on the deterministic score of ${total}/100 (${verdict}). Your written_verdict must be "${verdict}". Produce exactly 2 executive_summary sentences and 1 methodology sentence. Every sentence must cite evidence_ids.`,
      userPrompt: JSON.stringify({
        score: total,
        verdict,
        breakdowns: Array.isArray(breakdowns) ? breakdowns.slice(0, 12) : [],
        evidenceIds: [...allowed].slice(0, 30),
      }), schema: finalJudgeSchema,
    });

    assertCitationsBelongToRun(judgeOutput, allowed);
  } catch (error) {
    await logError(runId, "final_judge", error, db);
    // Fallback: generate minimal judge output
    const fallbackIds = [...allowed].slice(0, 2);
    judgeOutput = {
      written_verdict: verdict,
      executive_summary: [
        { text: `Based on ${allowed.size} evidence items, this idea scores ${total}/100.`, evidence_ids: fallbackIds, score_criteria: [] },
        { text: `The deterministic verdict is ${verdict}.`, evidence_ids: fallbackIds, score_criteria: [] },
      ],
      methodology: [
        { text: `Analyzed ${allowed.size} sources across problem and solution spaces.`, evidence_ids: fallbackIds, score_criteria: [] },
      ],
    };
  }

  // A provider fallback may satisfy transport validation without preserving the
  // optional narrative arrays. Keep malformed output inside the normal
  // publication gate instead of turning it into an unbounded queue retry.
  judgeOutput = {
    ...judgeOutput,
    executive_summary: Array.isArray(judgeOutput?.executive_summary) ? judgeOutput.executive_summary : [],
    methodology: Array.isArray(judgeOutput?.methodology) ? judgeOutput.methodology : [],
  };

  // --- Validate narrative citations ---
  const citationValidation = validateNarrativeCitations(judgeOutput, evidence || []);
  const narrativeValid = narrativeSupportsVerdict(citationValidation);
  const completeness = reportCompleteness(config.mode, {
    evidenceCount: allowed.size,
    confidenceBand: confidence.band,
    hasPositive: (evidence || []).some((e: any) => !e.excluded && !e.disconfirming),
    hasNegative: (evidence || []).some((e: any) => !e.excluded && e.disconfirming),
    hasPricing: (evidence || []).some((e: any) => !e.excluded && /pricing|price|\$/i.test(e.sources?.url || "")),
    hasCompetitor: (evidence || []).some((e: any) => !e.excluded && e.source_tier <= 3),
    citationsValid: narrativeValid,
  });
  // A Published report is a normal Completed deliverable. It requires both the
  // mode-specific retrieval gate and the report-level citation/completeness gate.
  // Exhaustion therefore fails (and restores) the run rather than publishing a
  // normal report with insufficient coverage.
  if (!runCoverage?.retrieval_sufficient || !completeness.complete || !narrativeValid || !allowed.size) {
    const gaps = Array.isArray(runCoverage?.retrieval_coverage_gaps) ? runCoverage.retrieval_coverage_gaps.join(", ") : "retrieval sufficiency was not reached";
    return stageFailed("permanent", `Publication blocked by ${config.label} evidence policy: ${[...completeness.missing, gaps].filter(Boolean).join("; ")}`);
  }

  // --- Persist citation validation ---
  await db.from("citation_integrity_validations").upsert(
    {
      run_id: runId,
      valid: citationValidation.valid,
      claims_checked: citationValidation.claimsChecked,
      claims_removed: citationValidation.claimsRemoved,
      invalid_claims: citationValidation.invalidClaims,
      payload: citationValidation,
    },
    { onConflict: "run_id" },
  );

  // --- Persist Final Judge output ---
  await db.from("reasoning_agent_outputs").upsert(
    {
      run_id: runId,
      agent_name: "final_judge",
      status: "Complete",
      attempt_count: 1,
      payload: judgeOutput,
    },
    { onConflict: "run_id,agent_name" },
  );

  // --- Build executive summary and methodology ---
  const executiveSummary = (narrativeValid
    ? citationValidation.executiveSummary
    : judgeOutput.executive_summary
  ).map((c: any) => c.text).join(" ");

  const methodology = (narrativeValid
    ? citationValidation.methodology
    : judgeOutput.methodology
  ).map((c: any) => c.text).join(" ");

  // --- Persist report ---
  const { data: report, error: reportError } = await db
    .from("reports")
    .insert({
      run_id: runId,
      opportunity_id: opportunityId,
      status: "Published",
      executive_summary: executiveSummary,
      methodology,
    })
    .select("id")
    .single();

  if (reportError || !report) {
    return stageFailed("permanent", `Report insert failed: ${reportError?.message}`);
  }

  // --- Load specialist disputes and adversarial gate for report version ---
  const { data: specialistChecks } = await db
    .from("specialist_checks")
    .select("*")
    .eq("run_id", runId);

  const { data: adversarialGate } = await db
    .from("adversarial_verdict_gates")
    .select("*")
    .eq("run_id", runId)
    .maybeSingle();

  // --- Persist report version (immutable) ---
  const { data: version, error: versionError } = await db
    .from("report_versions")
    .insert({
      report_id: report.id,
      version_number: 1,
      report_mode: config.mode,
      payload: {
        score: total,
        verdict,
        executiveSummary,
        methodology,
        breakdowns,
        judge: judgeOutput,
        evidenceConfidence: confidence,
        completeness,
      },
      specialist_disputes: specialistChecks || [],
      adversarial_gate: adversarialGate || null,
      citation_validation: citationValidation,
      reasoning_flags: [],
      verdict_score_mismatch: judgeOutput.written_verdict !== verdict,
      market_sizing: { reason: "Market sizing deferred to evidence phase" },
    })
    .select("id")
    .single();

  if (versionError) {
    return stageFailed("permanent", `Report version insert failed: ${versionError?.message}`);
  }

  // --- Persist chart datasets linked to the report version ---
  if (chartDatasets?.length && version?.id) {
    for (const chart of chartDatasets) {
      const dataString = JSON.stringify(chart.source_data);
      const checksum = await sha256Hex(dataString);

      await db.from("report_chart_datasets").insert({
        report_version_id: version.id,
        run_id: runId,
        chart_key: chart.chart_key,
        chart_type: chart.chart_type,
        schema_version: 1,
        source_data: chart.source_data,
        chart_config: chart.chart_config || {},
        supporting_evidence_ids: chart.supporting_evidence_ids || [],
        sha256: checksum,
      });
    }
  }

  return stageCompleted(
    "generate_exports",
    {
      reportId: report.id,
      reportVersionId: version?.id,
      verdict,
      total,
    },
    { duration_ms: Date.now() - startedAt },
    {
      nextInputMeta: {
        reportId: report.id,
        reportVersionId: version?.id,
        opportunityId,
        scoreId,
        total,
        verdict,
      },
    },
  );
}

/** Simple SHA-256 hex hash. */
async function sha256Hex(data: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(data),
    );
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
