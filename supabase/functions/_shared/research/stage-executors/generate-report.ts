/**
 * Stage: generate_report
 *
 * Runs the Final Judge for narrative generation, validates citations,
 * and persists the immutable report version.
 * Reuses finalJudgeSchema, citation validation, and report schema.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { assertCitationsBelongToRun, finalJudgeSchema } from "../reasoning.ts";
import {
  narrativeSupportsVerdict,
  validateNarrativeCitations,
} from "../reasoning-integrity.ts";
import { costBudgetForRun, logError, updateState } from "../pipeline-utils.ts";
import {
  evidenceConfidence,
  reportCompleteness,
  semanticPublicationQuality,
} from "../evidence-intelligence.ts";
import {
  buildDecisionCharts,
  buildDecisionProduct,
} from "../decision-product.ts";
import { validationReportSchema } from "../../report-schema.ts";

export async function executeGenerateReport(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta, dependencies } = ctx;

  const opportunityId = inputMeta.opportunityId as string;
  const scoreId = inputMeta.scoreId as string;
  const total = inputMeta.total as number;
  const verdict = inputMeta.verdict as string;
  const chartDatasets = Array.isArray(inputMeta.chartDatasets)
    ? inputMeta.chartDatasets as any[]
    : [];

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
    const { data: existingVersion } = await db.from("report_versions").select(
      "id",
    ).eq("report_id", existingReport.id).order("version_number", {
      ascending: false,
    }).limit(1).maybeSingle();
    return stageCompleted(
      "generate_exports",
      { reportId: existingReport.id, alreadyExisted: true },
      { duration_ms: Date.now() - startedAt },
      {
        nextInputMeta: {
          reportId: existingReport.id,
          reportVersionId: existingVersion?.id,
          opportunityId,
          scoreId,
          total,
          verdict,
        },
      },
    );
  }

  await updateState(runId, "Generating", 93, `Generating ${config.label}`, db);

  // --- Load evidence for citations ---
  const [
    { data: evidence },
    { data: runCoverage },
    { data: confidenceContradictions },
  ] = await Promise.all([
    db.from("evidence_items")
      .select(
        "id, source_id, excluded, source_tier, snippet, title, signal_type, strength, evidence_family, evidence_topic, pain_point, source_domain, source_class, disconfirming, created_at, relevance_score, relevance_class, matched_brief_dimensions, mismatch_reasons, acceptance_decision, sources(url)",
      )
      .eq("run_id", runId),
    db.from("research_runs")
      .select("retrieval_sufficient,retrieval_coverage_gaps,status")
      .eq("id", runId)
      .single(),
    db.from("evidence_contradictions")
      .select("id,resolution_status")
      .eq("run_id", runId),
  ]);

  if (runCoverage?.status === "Cancelled") {
    return stageFailed("permanent", "Run was cancelled before publication.");
  }

  const allowed = new Set<string>(
    (evidence || [])
      .filter((e: any) =>
        e.id && e.source_id && !e.excluded && e.source_tier !== 4 &&
        e.acceptance_decision === "accepted_core" && e.sources?.url
      )
      .map((e: any) => e.id),
  );
  const confidence = evidenceConfidence(
    (evidence || []) as any,
    undefined,
    (confidenceContradictions || []).filter((item: any) =>
      item.resolution_status === "unresolved"
    ).length,
    confidenceContradictions?.length || 0,
  );
  const allowedSourceIds = new Set<string>(
    (evidence || [])
      .filter((item: any) => allowed.has(item.id))
      .map((item: any) => item.source_id)
      .filter(Boolean),
  );

  // --- Load breakdowns ---
  const { data: breakdowns } = await db
    .from("score_breakdowns")
    .select("criterion, score, weight, notes, id")
    .eq("score_id", scoreId);
  const { data: scoreEvidenceRefs } = await db.from("score_evidence_refs")
    .select("score_breakdown_id,evidence_id");

  // --- Run the final Gemini narrative pass through the canonical client ---
  const budget = await costBudgetForRun(runId, db, config);
  const insufficientEvidence = Boolean(inputMeta.insufficientEvidence) ||
    allowed.size === 0;

  let judgeOutput: any;
  if (insufficientEvidence) {
    const criteria = (breakdowns || []).map((row: any) =>
      String(row.criterion)
    );
    judgeOutput = {
      written_verdict: verdict,
      executive_summary: [
        {
          text:
            "No externally attributable claim survived source, excerpt, semantic, and numeric validation. This report therefore records an insufficient-evidence outcome rather than treating missing proof as support for the idea.",
          evidence_ids: [],
          score_criteria: criteria.slice(0, 6),
        },
        {
          text:
            "Do not make a build or pricing commitment from this run. Use the documented evidence gaps to collect direct buyer, competitor, pricing, and disconfirming evidence, then rerun validation.",
          evidence_ids: [],
          score_criteria: criteria.slice(6),
        },
      ],
      methodology: [{
        text:
          "The research pipeline completed technically, rejected claims that could not be attributed or verified, assigned insufficient evidence confidence, and preserved the rejection outcome without inventing replacement facts.",
        evidence_ids: [],
        score_criteria: criteria,
      }],
      system_statement_only: true,
      validation_rejections: inputMeta.validationRejections || {},
    };
  } else {try {
      const allowedEvidenceIdSchema = { type: "string", enum: [...allowed] };
      const allowedCriteria = (breakdowns || []).map((row: any) =>
        String(row.criterion)
      );
      const result = await dependencies.createGemini().generate({
        runId,
        taskType: "final_judge",
        db,
        budget,
        systemInstruction:
          `Write the final narrative for a deterministic startup validation score of ${total}/100 (${verdict}). written_verdict must be "${verdict}". Produce exactly two executive_summary entries and one methodology entry. Every entry must cite provided evidence IDs.`,
        prompt: JSON.stringify({
          score: total,
          verdict,
          breakdowns: Array.isArray(breakdowns) ? breakdowns.slice(0, 12) : [],
          evidence: (evidence || []).filter((row: any) => allowed.has(row.id))
            .slice(0, 30).map((row: any) => ({
              id: row.id,
              title: row.title,
              snippet: row.snippet,
              signalType: row.signal_type,
            })),
        }),
        responseSchema: {
          type: "object",
          properties: {
            written_verdict: {
              type: "string",
              enum: [
                "Build Now",
                "Validate First",
                "Niche Down",
                "Weak Signal",
                "Avoid",
              ],
            },
            executive_summary: {
              type: "array",
              minItems: 2,
              maxItems: 2,
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  evidence_ids: {
                    type: "array",
                    items: allowedEvidenceIdSchema,
                  },
                  score_criteria: {
                    type: "array",
                    items: { type: "string", enum: allowedCriteria },
                  },
                },
                required: ["text", "evidence_ids", "score_criteria"],
              },
            },
            methodology: {
              type: "array",
              minItems: 1,
              maxItems: 1,
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  evidence_ids: {
                    type: "array",
                    items: allowedEvidenceIdSchema,
                  },
                  score_criteria: {
                    type: "array",
                    items: { type: "string", enum: allowedCriteria },
                  },
                },
                required: ["text", "evidence_ids", "score_criteria"],
              },
            },
          },
          required: ["written_verdict", "executive_summary", "methodology"],
        },
      });
      judgeOutput = finalJudgeSchema.parse(
        normalizeJudgeCriteria(result.parsed, allowedCriteria),
      );
      assertCitationsBelongToRun(judgeOutput, allowed);
    } catch (error) {
      await logError(runId, "final_judge", error, db);
      return stageFailed(
        "permanent",
        `Final narrative generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }}

  // System statements about a zero-evidence validation outcome do not assert
  // external facts and therefore carry no source citations. All evidence-backed
  // narratives continue through the unchanged citation validator.
  const citationValidation = insufficientEvidence
    ? {
      valid: true,
      claimsChecked: 0,
      claimsRemoved: 0,
      invalidClaims: [],
      executiveSummary: judgeOutput.executive_summary,
      methodology: judgeOutput.methodology,
      classification: "system_insufficient_evidence_statement",
    }
    : validateNarrativeCitations(judgeOutput, evidence || []);
  const narrativeValid = insufficientEvidence ||
    narrativeSupportsVerdict(citationValidation);
  const completeness = reportCompleteness(config.mode, {
    evidenceCount: allowed.size,
    confidenceBand: confidence.band,
    hasPositive: (evidence || []).some((e: any) =>
      !e.excluded && !e.disconfirming
    ),
    hasNegative: (evidence || []).some((e: any) =>
      !e.excluded && e.disconfirming
    ),
    hasPricing: (evidence || []).some((e: any) =>
      !e.excluded &&
      (e.signal_type === "Pricing" || /pricing|price|\$/i.test(e.snippet || ""))
    ),
    hasCompetitor: (evidence || []).some((e: any) =>
      !e.excluded && e.source_tier <= 3
    ),
    citationsValid: narrativeValid,
    evidenceTopics: (evidence || []).filter((e: any) => allowed.has(e.id)).map((
      e: any,
    ) => e.evidence_topic).filter(Boolean),
  });
  await db.from("evidence_confidence_results").update({
    report_completeness: completeness.score,
    completeness_reasons: completeness.reasons,
    updated_at: new Date().toISOString(),
  }).eq("run_id", runId);
  // Weak or negative evidence is a publishable decision result. Only the
  // technical inability to produce an attributable, citation-valid report blocks
  // publication; evidence gaps remain visible as limitations.
  if (!narrativeValid || (!allowed.size && !insufficientEvidence)) {
    return stageFailed(
      "permanent",
      `Publication blocked by technical citation integrity: ${
        [...completeness.missing].filter(Boolean).join("; ")
      }`,
    );
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
  const executiveSummary =
    (narrativeValid
      ? citationValidation.executiveSummary
      : judgeOutput.executive_summary).map((c: any) => c.text).join(" ");

  const methodology =
    (narrativeValid ? citationValidation.methodology : judgeOutput.methodology)
      .map((c: any) => c.text).join(" ");

  const [
    { data: opportunity },
    { data: competitors },
    { data: risks },
    { data: pricing },
    { data: mvp },
    { data: launch },
    { data: scoreRow },
  ] = await Promise.all([
    db.from("opportunities").select("*").eq("id", opportunityId).single(),
    db.from("competitors").select("*").eq("opportunity_id", opportunityId),
    db.from("risks").select("*").eq("opportunity_id", opportunityId),
    db.from("pricing_models").select("*").eq("opportunity_id", opportunityId)
      .single(),
    db.from("mvp_plans").select("*,mvp_scope_items(*)").eq(
      "opportunity_id",
      opportunityId,
    ).single(),
    db.from("launch_plans").select("*,launch_strategies(*)").eq(
      "opportunity_id",
      opportunityId,
    ).single(),
    db.from("opportunity_scores").select("total,confidence,verdict").eq(
      "id",
      scoreId,
    ).single(),
  ]);
  if (!opportunity || !pricing || !mvp || !launch || !scoreRow) {
    return stageFailed(
      "permanent",
      "Normalized report artifacts are incomplete.",
    );
  }

  const criterionEntries = (breakdowns || []).map((
    row: any,
  ) => [row.criterion, row]);
  const criterionMap = new Map<string, any>(criterionEntries);
  const criteria = [
    "painSeverity",
    "purchaseUrgency",
    "willingnessToPay",
    "buyerReachability",
    "mvpSpeed",
    "competitionGap",
    "retentionPotential",
    "platformDependencyRisk",
    "regulatoryRisk",
    "founderFit",
    "distributionClarity",
    "speedToFirstRevenue",
  ];
  const scorecard = {
    scores: Object.fromEntries(
      criteria.map((key) => [key, Number(criterionMap.get(key)?.score || 0)]),
    ),
    notes: Object.fromEntries(
      criteria.map((
        key,
      ) => [
        key,
        String(
          criterionMap.get(key)?.notes || "No evidence-backed note available.",
        ),
      ]),
    ),
    evidenceRefs: Object.fromEntries(criteria.map((key) => {
      const breakdownId = criterionMap.get(key)?.id;
      return [
        key,
        (scoreEvidenceRefs || []).filter((ref: any) =>
          ref.score_breakdown_id === breakdownId
        ).map((ref: any) => ref.evidence_id),
      ];
    })),
    weights: Object.fromEntries(
      criteria.map((key) => [key, Number(criterionMap.get(key)?.weight || 1)]),
    ),
    total: Number(scoreRow.total),
    confidence: Number(scoreRow.confidence),
    verdict: scoreRow.verdict,
  };
  const [
    { data: adversarialGate },
    { data: specialistRows },
    { data: researchBriefRow },
    { data: contradictions },
    { data: numericValidations },
  ] = await Promise.all([
    db.from("adversarial_verdict_gates").select("*").eq("run_id", runId)
      .maybeSingle(),
    db.from("reasoning_agent_outputs").select("agent_name,status,payload").eq(
      "run_id",
      runId,
    ).in("agent_name", [
      "competition",
      "market",
      "pricing",
      "risk",
      "demand",
      "gtm",
    ]),
    db.from("research_briefs").select("brief").eq("run_id", runId).single(),
    db.from("evidence_contradictions").select("*").eq("run_id", runId).order(
      "created_at",
    ),
    db.from("numeric_claim_validations").select("status,claim_type").eq(
      "run_id",
      runId,
    ),
  ]);
  const specialistAssessments = (specialistRows || []).map((row: any) => ({
    name: row.agent_name,
    status: row.status,
    direction: Array.isArray(row.payload?.evidence_ids) &&
        row.payload.evidence_ids.some((id: string) => allowed.has(id))
      ? customerDirection(row.payload?.direction)
      : "Insufficient evidence",
    assessment: cleanSpecialistText(row.payload?.assessment) ||
      "Insufficient evidence",
    findings: Array.isArray(row.payload?.findings)
      ? row.payload.findings.map(cleanSpecialistText).filter(Boolean)
      : ["Insufficient evidence"],
    evidenceIds: Array.isArray(row.payload?.evidence_ids)
      ? row.payload.evidence_ids.filter((id: string) => allowed.has(id))
      : [],
    sourceCitations: Array.isArray(row.payload?.source_citations)
      ? row.payload.source_citations.filter((citation: any) =>
        allowedSourceIds.has(citation?.sourceId)
      )
      : [],
    opposingEvidenceIds: Array.isArray(row.payload?.opposing_evidence_ids)
      ? row.payload.opposing_evidence_ids.filter((id: string) =>
        allowed.has(id)
      )
      : [],
    confidence: row.payload?.confidence || "Insufficient",
    relevantBriefDimensions:
      Array.isArray(row.payload?.relevant_brief_dimensions)
        ? row.payload.relevant_brief_dimensions
        : [],
    unresolvedGaps: Array.isArray(row.payload?.unresolved_gaps)
      ? row.payload.unresolved_gaps
      : [],
  }));
  if (config.mode === "full_validation" && specialistAssessments.length !== 6) {
    return stageFailed(
      "permanent",
      `Full Validation requires six persisted specialist assessments; found ${specialistAssessments.length}.`,
    );
  }
  const publicationStandard = semanticPublicationQuality({
    mode: config.mode,
    evidence: (evidence || []) as any,
    competitors: competitors || [],
    contradictions: contradictions || [],
    specialists: specialistRows || [],
    charts: chartDatasets,
    numericValidations: numericValidations || [],
  });
  const effectiveConfidence =
    config.mode === "full_validation" && !publicationStandard.met &&
      confidence.band === "High"
      ? {
        ...confidence,
        band: "Moderate" as const,
        score: Math.min(confidence.score, 0.59),
        deductions: [
          ...(confidence.deductions || []),
          ...publicationStandard.gaps,
        ],
      }
      : confidence;
  if (
    effectiveConfidence.score !== confidence.score ||
    effectiveConfidence.band !== confidence.band
  ) {
    await db.from("evidence_confidence_results").update({
      band: effectiveConfidence.band,
      score: effectiveConfidence.score,
      deductions: effectiveConfidence.deductions,
      updated_at: new Date().toISOString(),
    }).eq("run_id", runId);
  }
  const strongestPositive = (evidence || []).find((item: any) =>
    !item.excluded && !item.disconfirming
  );
  const strongestNegative = (evidence || []).find((item: any) =>
    !item.excluded && item.disconfirming
  );
  const brief = researchBriefRow?.brief as Record<string, unknown> | undefined;
  const targetBuyer = String(
    brief?.targetBuyer || opportunity.target_customer || "target buyers",
  );
  const weekOne = (launch.launch_strategies || [])
    .filter((item: any) => item.strategy_type === "WeekOne")
    .map((item: any) => String(item.description || "").trim())
    .filter(Boolean);
  const firstTenStrategy = (launch.launch_strategies || [])
    .filter((item: any) => item.strategy_type === "FirstTen")
    .map((item: any) => String(item.description || "").trim())
    .filter(Boolean);
  const mvpScope = (mvp.mvp_scope_items || [])
    .filter((item: any) => item.item_type === "Scope")
    .map((item: any) => String(item.description || "").trim())
    .filter(Boolean);
  const reportPayload: any = {
    id: runId,
    version: "2.0",
    reportMode: config.mode,
    generatedAt: new Date().toISOString(),
    executiveSummary,
    methodology,
    opportunity: {
      id: opportunity.id,
      name: opportunity.name,
      oneLiner: opportunity.one_liner,
      targetCustomer: opportunity.target_customer,
      corePain: opportunity.core_pain,
      market: opportunity.market,
      scorecard,
      evidence: (evidence || []).map((item: any) => ({
        id: item.id,
        source: item.source_domain || item.sources?.url || "Web",
        sourceType: "RetrievedWeb",
        title: item.title,
        snippet: item.snippet,
        url: item.sources?.url,
        signal: item.signal_type,
        strength: item.strength,
        date: item.created_at,
        evidenceFamily: item.evidence_family,
        sourceTier: item.source_tier,
        excluded: item.excluded,
        disconfirming: item.disconfirming,
        painPoint: item.pain_point || undefined,
        evidenceTopic: item.evidence_topic,
        relevanceScore: Number(item.relevance_score || 0),
        relevanceClass: item.relevance_class,
        matchedBriefDimensions: item.matched_brief_dimensions || [],
        mismatchReasons: item.mismatch_reasons || [],
        acceptanceDecision: item.acceptance_decision,
      })),
      competitors: (competitors || []).map((item: any) => ({
        id: item.id,
        name: item.name,
        positioning: item.positioning,
        pricing: item.pricing,
        target: item.target,
        strength: item.strength,
        gap: item.gap,
        classification: item.classification || "adjacent",
        comparability: {
          targetBuyer: Boolean(item.comparability?.targetBuyer),
          workflow: Boolean(item.comparability?.workflow),
          approvalModel: Boolean(item.comparability?.approvalModel),
          attributionAudit: Boolean(item.comparability?.attributionAudit),
          productUseCase: Boolean(item.comparability?.productUseCase),
        },
        evidenceIds: item.evidence_ids || [],
      })),
      pricing: {
        model: pricing.model,
        pricePoint: pricing.price_point,
        rationale: pricing.rationale,
        firstOffer: pricing.first_offer,
        targetCustomers: pricing.target_customers,
        evidenceIds: pricing.evidence_ids || [],
      },
      mvp: {
        outcome: mvp.outcome,
        buildEstimate: mvp.build_estimate,
        buildComplexity: mvp.build_complexity,
        scope: mvpScope.length ? mvpScope : [
          "Prototype only the submitted idea's core workflow and test it with target buyers.",
        ],
        exclusions: (mvp.mvp_scope_items || []).filter((item: any) =>
          item.item_type === "Exclusion"
        ).map((item: any) => item.description),
      },
      launch: {
        firstCustomerChannel: launch.first_customer_channel,
        outreachMessage: launch.outreach_message,
        successMetric: launch.success_metric,
        weekOne: weekOne.length ? weekOne : [
          `Recruit ${targetBuyer} for evidence-led problem interviews and a workflow walkthrough.`,
        ],
        firstTenStrategy: firstTenStrategy.length ? firstTenStrategy : [
          `Invite qualified ${targetBuyer} to a time-boxed pilot with an explicit payment decision.`,
        ],
      },
      risks: (risks || []).map((item: any) => ({
        id: item.id,
        category: item.category,
        severity: item.severity,
        description: item.description,
        mitigation: item.mitigation,
        evidenceIds: item.evidence_ids || [],
      })),
      createdAt: opportunity.created_at,
    },
    adversarialGate: adversarialGate
      ? {
        outcome: adversarialGate.outcome,
        severity: adversarialGate.severity,
        objection: adversarialGate.objection,
        evidence_ids: adversarialGate.evidence_ids || [],
        unresolved: adversarialGate.unresolved,
      }
      : undefined,
    specialistAssessments: config.mode === "full_validation"
      ? specialistAssessments
      : undefined,
    fullValidationInsights: config.mode === "full_validation"
      ? inputMeta.fullValidationInsights
      : undefined,
    citationValidation,
    narrativeCitations: judgeOutput,
    evidenceGaps: runCoverage?.retrieval_coverage_gaps || [],
    limitations: completeness.missing,
    reportSections: config.mode === "full_validation"
      ? [
        "Conclusion",
        "Evidence",
        "Demand",
        "Competition",
        "Market",
        "Pricing",
        "MVP scope",
        "Go-to-market",
        "Risks",
        "Adversarial",
        "Score breakdown",
        "Sources",
        "Exports",
      ]
      : [
        "Conclusion",
        "Evidence",
        "Competition",
        "Score breakdown",
        "Pricing",
        "Next actions",
        "Risks",
        "Exports",
      ],
    availableExports: [...config.exports],
    topRecommendation: launch.success_metric,
    strongestPositiveEvidenceId: strongestPositive?.id,
    strongestNegativeEvidenceId: strongestNegative?.id,
    canonicalResearchBrief: researchBriefRow?.brief,
    contradictions: (contradictions || []).map((item: any) => ({
      exactClaimTested: item.tested_claim,
      supportingEvidenceIds: item.supporting_evidence_ids || [],
      challengingEvidenceIds: item.challenging_evidence_ids || [],
      relationship: item.relationship,
      resolutionStatus: item.resolution_status,
      resolutionNote: item.resolution_note,
      proposition: item.proposition || item.tested_claim,
      segmentApplicability: item.segment_applicability,
      geographyApplicability: item.geography_applicability,
      contradictionStatus: item.contradiction_status || item.resolution_status,
      unresolvedImplication: item.unresolved_implication ||
        item.resolution_note,
    })),
    confidenceDimensions: {
      evidence: {
        band: effectiveConfidence.band,
        score: effectiveConfidence.score,
        reasons: effectiveConfidence.reasons,
        deductions: effectiveConfidence.deductions || [],
      },
      scoring: {
        score: Number(scoreRow.confidence),
        explanation: `${
          scorecard.evidenceRefs
            ? Object.values(scorecard.evidenceRefs).filter((ids: any) =>
              ids.length
            ).length
            : 0
        }/12 deterministic factors have evidence references; capped by ${effectiveConfidence.band} evidence confidence.`,
      },
      completeness: {
        score: completeness.score,
        complete: completeness.complete,
        reasons: completeness.reasons,
        missing: completeness.missing,
      },
    },
    publicationStandard,
  };
  const normalizedChartDatasets = chartDatasets.map((item) => ({
    chartKey: item.chartKey || item.chart_key,
    chartType: item.chartType || item.chart_type,
    sourceData: item.sourceData || item.source_data || {},
    chartConfig: item.chartConfig || item.chart_config || {},
    supportingEvidenceIds: item.supportingEvidenceIds ||
      item.supporting_evidence_ids || [],
  }));
  const decisionCharts = buildDecisionCharts(
    reportPayload,
    normalizedChartDatasets,
  );
  reportPayload.decisionProduct = buildDecisionProduct(
    reportPayload,
    decisionCharts,
    effectiveConfidence,
  );
  reportPayload.topRecommendation =
    reportPayload.decisionProduct.primaryRecommendation;
  const validatedReport = validationReportSchema.safeParse(reportPayload);
  if (!validatedReport.success) {
    return stageFailed(
      "permanent",
      `Report payload validation failed: ${
        validatedReport.error.issues.map((issue) =>
          `${issue.path.join(".")}: ${issue.message}`
        ).join("; ")
      }`,
    );
  }

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
    return stageFailed(
      "permanent",
      `Report insert failed: ${reportError?.message}`,
    );
  }

  // --- Persist report version (immutable) ---
  const { data: version, error: versionError } = await db
    .from("report_versions")
    .insert({
      report_id: report.id,
      version_number: 1,
      report_mode: config.mode,
      payload: validatedReport.data,
      adversarial_gate: adversarialGate || null,
      citation_validation: citationValidation,
      reasoning_flags: [],
      verdict_score_mismatch: judgeOutput.written_verdict !== verdict,
      market_sizing: { reason: "Market sizing deferred to evidence phase" },
    })
    .select("id")
    .single();

  if (versionError) {
    return stageFailed(
      "permanent",
      `Report version insert failed: ${versionError?.message}`,
    );
  }

  // --- Persist chart datasets linked to the report version ---
  if (decisionCharts.length && version?.id) {
    for (const chart of decisionCharts) {
      const dataString = JSON.stringify(chart.sourceData);
      const checksum = await sha256Hex(dataString);

      await db.from("report_chart_datasets").insert({
        report_version_id: version.id,
        run_id: runId,
        chart_key: chart.chartKey,
        chart_type: chart.chartType,
        schema_version: 1,
        source_data: chart.sourceData,
        chart_config: chart.chartConfig || {},
        supporting_evidence_ids: chart.supportingEvidenceIds || [],
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

function normalizeJudgeCriteria(value: unknown, allowed: string[]) {
  if (!value || typeof value !== "object") return value;
  const canonicalByToken = new Map(
    allowed.map((criterion) => [tokenizeCriterion(criterion), criterion]),
  );
  const aliases: Record<string, string> = {
    marketdemand: "purchaseUrgency",
    demandvolume: "purchaseUrgency",
    competitivedensity: "competitionGap",
  };
  const normalizeEntries = (entries: unknown) =>
    Array.isArray(entries)
      ? entries.map((entry) => {
        if (!entry || typeof entry !== "object") return entry;
        const row = entry as Record<string, unknown>;
        const criteria = Array.isArray(row.score_criteria)
          ? row.score_criteria
          : [];
        return {
          ...row,
          score_criteria: [
            ...new Set(criteria.flatMap((raw) => {
              const token = tokenizeCriterion(String(raw || ""));
              const mapped = canonicalByToken.get(token) || aliases[token];
              return mapped && allowed.includes(mapped) ? [mapped] : [];
            })),
          ],
        };
      })
      : entries;
  const parsed = value as Record<string, unknown>;
  return {
    ...parsed,
    executive_summary: normalizeEntries(parsed.executive_summary),
    methodology: normalizeEntries(parsed.methodology),
  };
}

function tokenizeCriterion(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function customerDirection(value: unknown) {
  if (value === "SupportsOpportunity") return "Supports opportunity";
  if (value === "ChallengesOpportunity") return "Challenges opportunity";
  if (value === "Insufficient") return "Insufficient evidence";
  return "Mixed evidence";
}

function cleanSpecialistText(value: unknown) {
  return String(value || "")
    .replace(/\bSOURCE_ID\s*:?\s*[0-9a-f-]{8,}\b/gi, "")
    .replace(/\bsource[_\s-]?id\s*:?\s*[^\s,;.)]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

/** Simple SHA-256 hex hash. */
async function sha256Hex(data: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === "function") {
    const buf = await globalThis.crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(data),
    );
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}
