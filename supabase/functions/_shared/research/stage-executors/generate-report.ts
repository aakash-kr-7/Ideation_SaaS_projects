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
    const { data: existingVersion } = await db.from("report_versions").select("id").eq("report_id", existingReport.id).order("version_number", { ascending: false }).limit(1).maybeSingle();
    return stageCompleted(
      "generate_exports",
      { reportId: existingReport.id, alreadyExisted: true },
      { duration_ms: Date.now() - startedAt },
      { nextInputMeta: { reportId: existingReport.id, reportVersionId: existingVersion?.id, opportunityId, scoreId, total, verdict } },
    );
  }

  await updateState(runId, "Generating", 93, `Generating ${config.label}`, db);

  // --- Load evidence for citations ---
  const [{ data: evidence }, { data: runCoverage }] = await Promise.all([
    db.from("evidence_items")
      .select("id, source_id, excluded, source_tier, snippet, title, signal_type, strength, evidence_family, pain_point, source_domain, disconfirming, created_at, sources(url)")
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
  const { data: scoreEvidenceRefs } = await db.from("score_evidence_refs").select("score_breakdown_id,evidence_id");

  // --- Run the final Gemini narrative pass through the canonical client ---
  const budget = await costBudgetForRun(runId, db, config);

  let judgeOutput: any;
  try {
    const result = await dependencies.createGemini().generate({
      runId, taskType: "final_judge", db, budget,
      systemInstruction:
        `Write the final narrative for a deterministic startup validation score of ${total}/100 (${verdict}). written_verdict must be "${verdict}". Produce exactly two executive_summary entries and one methodology entry. Every entry must cite provided evidence IDs.`,
      prompt: JSON.stringify({
        score: total,
        verdict,
        breakdowns: Array.isArray(breakdowns) ? breakdowns.slice(0, 12) : [],
        evidence: (evidence || []).filter((row: any) => allowed.has(row.id)).slice(0, 30).map((row: any) => ({ id: row.id, title: row.title, snippet: row.snippet, signalType: row.signal_type })),
      }),
      responseSchema: {
        type: "object",
        properties: {
          written_verdict: { type: "string", enum: ["Build Now", "Validate First", "Niche Down", "Weak Signal", "Avoid"] },
          executive_summary: { type: "array", minItems: 2, maxItems: 2, items: { type: "object", properties: { text: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } }, score_criteria: { type: "array", items: { type: "string" } } }, required: ["text", "evidence_ids", "score_criteria"] } },
          methodology: { type: "array", minItems: 1, maxItems: 1, items: { type: "object", properties: { text: { type: "string" }, evidence_ids: { type: "array", items: { type: "string" } }, score_criteria: { type: "array", items: { type: "string" } } }, required: ["text", "evidence_ids", "score_criteria"] } },
        },
        required: ["written_verdict", "executive_summary", "methodology"],
      },
    });
    judgeOutput = finalJudgeSchema.parse(result.parsed);
    assertCitationsBelongToRun(judgeOutput, allowed);
  } catch (error) {
    await logError(runId, "final_judge", error, db);
    return stageFailed("permanent", `Final narrative generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }

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

  const [{ data: opportunity }, { data: competitors }, { data: risks }, { data: pricing }, { data: mvp }, { data: launch }, { data: scoreRow }] = await Promise.all([
    db.from("opportunities").select("*").eq("id", opportunityId).single(),
    db.from("competitors").select("*").eq("opportunity_id", opportunityId),
    db.from("risks").select("*").eq("opportunity_id", opportunityId),
    db.from("pricing_models").select("*").eq("opportunity_id", opportunityId).single(),
    db.from("mvp_plans").select("*,mvp_scope_items(*)").eq("opportunity_id", opportunityId).single(),
    db.from("launch_plans").select("*,launch_strategies(*)").eq("opportunity_id", opportunityId).single(),
    db.from("opportunity_scores").select("total,confidence,verdict").eq("id", scoreId).single(),
  ]);
  if (!opportunity || !pricing || !mvp || !launch || !scoreRow) return stageFailed("permanent", "Normalized report artifacts are incomplete.");

  const criterionEntries = (breakdowns || []).map((row: any) => [row.criterion, row]);
  const criterionMap = new Map<string, any>(criterionEntries);
  const criteria = ["painSeverity", "purchaseUrgency", "willingnessToPay", "buyerReachability", "mvpSpeed", "competitionGap", "retentionPotential", "platformDependencyRisk", "regulatoryRisk", "founderFit", "distributionClarity", "speedToFirstRevenue"];
  const scorecard = {
    scores: Object.fromEntries(criteria.map((key) => [key, Number(criterionMap.get(key)?.score || 0)])),
    notes: Object.fromEntries(criteria.map((key) => [key, String(criterionMap.get(key)?.notes || "No evidence-backed note available.")])),
    evidenceRefs: Object.fromEntries(criteria.map((key) => {
      const breakdownId = criterionMap.get(key)?.id;
      return [key, (scoreEvidenceRefs || []).filter((ref: any) => ref.score_breakdown_id === breakdownId).map((ref: any) => ref.evidence_id)];
    })),
    weights: Object.fromEntries(criteria.map((key) => [key, Number(criterionMap.get(key)?.weight || 1)])),
    total: Number(scoreRow.total), confidence: Number(scoreRow.confidence), verdict: scoreRow.verdict,
  };
  const { data: adversarialGate } = await db.from("adversarial_verdict_gates").select("*").eq("run_id", runId).maybeSingle();
  const reportPayload = {
    id: runId, version: "1.0", reportMode: config.mode, generatedAt: new Date().toISOString(),
    executiveSummary, methodology,
    opportunity: {
      id: opportunity.id, name: opportunity.name, oneLiner: opportunity.one_liner,
      targetCustomer: opportunity.target_customer, corePain: opportunity.core_pain, market: opportunity.market,
      scorecard,
      evidence: (evidence || []).map((item: any) => ({
        id: item.id, source: item.source_domain || item.sources?.url || "Web", sourceType: "GeminiGroundedWeb",
        title: item.title, snippet: item.snippet, url: item.sources?.url,
        signal: item.signal_type, strength: item.strength, date: item.created_at,
        evidenceFamily: item.evidence_family, sourceTier: item.source_tier, excluded: item.excluded,
        disconfirming: item.disconfirming, painPoint: item.pain_point,
      })),
      competitors: (competitors || []).map((item: any) => ({ id: item.id, name: item.name, positioning: item.positioning, pricing: item.pricing, target: item.target, strength: item.strength, gap: item.gap })),
      pricing: { model: pricing.model, pricePoint: pricing.price_point, rationale: pricing.rationale, firstOffer: pricing.first_offer, targetCustomers: pricing.target_customers },
      mvp: { outcome: mvp.outcome, buildEstimate: mvp.build_estimate, buildComplexity: mvp.build_complexity, scope: (mvp.mvp_scope_items || []).filter((item: any) => item.item_type === "Scope").map((item: any) => item.description), exclusions: (mvp.mvp_scope_items || []).filter((item: any) => item.item_type === "Exclusion").map((item: any) => item.description) },
      launch: { firstCustomerChannel: launch.first_customer_channel, outreachMessage: launch.outreach_message, successMetric: launch.success_metric, weekOne: (launch.launch_strategies || []).filter((item: any) => item.strategy_type === "WeekOne").map((item: any) => item.description), firstTenStrategy: (launch.launch_strategies || []).filter((item: any) => item.strategy_type === "FirstTen").map((item: any) => item.description) },
      risks: (risks || []).map((item: any) => ({ id: item.id, category: item.category, severity: item.severity, description: item.description, mitigation: item.mitigation })),
      createdAt: opportunity.created_at,
    },
    adversarialGate: adversarialGate ? { outcome: adversarialGate.outcome, severity: adversarialGate.severity, objection: adversarialGate.objection, evidence_ids: adversarialGate.evidence_ids || [], unresolved: adversarialGate.unresolved } : undefined,
    citationValidation, narrativeCitations: judgeOutput,
    evidenceGaps: runCoverage?.retrieval_coverage_gaps || [], limitations: completeness.missing,
    reportSections: config.mode === "full_validation" ? ["Conclusion", "Evidence", "Demand", "Competition", "Market", "Pricing", "MVP scope", "Go-to-market", "Risks", "Adversarial", "Score breakdown", "Sources", "Exports"] : ["Conclusion", "Evidence", "Competition", "Score breakdown", "Pricing", "Next actions", "Risks", "Exports"],
    availableExports: [...config.exports],
  };

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

  // --- Persist report version (immutable) ---
  const { data: version, error: versionError } = await db
    .from("report_versions")
    .insert({
      report_id: report.id,
      version_number: 1,
      report_mode: config.mode,
      payload: reportPayload,
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
