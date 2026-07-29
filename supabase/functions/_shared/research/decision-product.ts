import { competitorIntegrityPresentation } from "./evidence-integrity.ts";

type Evidence = {
  id: string;
  title: string;
  snippet: string;
  url: string;
  signal: "Pain" | "Demand" | "Pricing" | "Risk";
  strength: "High" | "Medium" | "Low";
  sourceTier?: number;
  disconfirming?: boolean;
  excluded?: boolean;
};

type StatementKind = "Fact" | "Inference" | "Hypothesis" | "Recommendation" | "MissingEvidence";
type Statement = { kind: StatementKind; text: string; evidenceIds: string[]; sourceUrls: string[] };
type Section = { key: string; title: string; summary: string; statements: Statement[] };
type Chart = {
  chartKey: string;
  chartType: string;
  sourceData: Record<string, unknown>;
  chartConfig?: Record<string, unknown>;
  supportingEvidenceIds?: string[];
};

const QUICK_SECTIONS = [
  "Executive decision", "Score, verdict and Evidence Confidence", "Idea interpretation",
  "Target customer and job to be done", "Problem and demand", "Alternatives and competitors",
  "Pricing and willingness to pay", "Strongest positive signal", "Strongest negative signal",
  "Risks and missing evidence", "Three concrete experiments", "Final recommendation",
  "Methodology and sources",
] as const;

const FULL_SECTIONS = [
  "Executive decision", "Score, verdict and confidence", "Idea and assumptions", "Target segments",
  "Jobs to be done", "Problem severity and frequency", "Demand and behavioural evidence",
  "Current alternatives", "Competitor deep dives", "Positioning opportunities",
  "Pricing and packaging landscape", "Willingness-to-pay evidence", "Market context", "MVP scope",
  "What not to build", "GTM channels", "First-customer strategy", "Risks", "Adversarial findings",
  "Evidence gaps", "Validation experiments", "12-factor scoring explanation",
  "Methodology, limitations and sources",
] as const;

export function buildDecisionProduct(
  payload: any,
  charts: Chart[] = [],
  confidenceResult?: { band?: string; score?: number; reasons?: string[]; deductions?: string[] },
) {
  const opportunity = payload.opportunity || {};
  const evidence = (opportunity.evidence || []).filter((item: Evidence) => !item.excluded);
  const supporting = evidence.filter((item: Evidence) => !item.disconfirming);
  const opposing = evidence.filter((item: Evidence) => item.disconfirming);
  const pricingEvidence = evidence.filter((item: Evidence) => item.signal === "Pricing");
  const painEvidence = evidence.filter((item: Evidence) => item.signal === "Pain");
  const demandEvidence = evidence.filter((item: Evidence) => item.signal === "Demand");
  const strongestPositive = evidence.find((item: Evidence) => item.id === payload.strongestPositiveEvidenceId) || supporting[0];
  const strongestNegative = evidence.find((item: Evidence) => item.id === payload.strongestNegativeEvidenceId) || opposing[0];
  const sourceUrls = (items: Evidence[]) => [...new Set(items.map((item) => item.url).filter(Boolean))];
  const fact = (item?: Evidence): Statement => item
    ? { kind: "Fact", text: item.snippet, evidenceIds: [item.id], sourceUrls: item.url ? [item.url] : [] }
    : missing("No attributable evidence was available for this point.");
  const inference = (text: string, items: Evidence[] = []): Statement => ({
    kind: "Inference", text, evidenceIds: items.map((item) => item.id), sourceUrls: sourceUrls(items),
  });
  const hypothesis = (text: string): Statement => ({ kind: "Hypothesis", text, evidenceIds: [], sourceUrls: [] });
  const recommendation = (text: string, items: Evidence[] = []): Statement => ({
    kind: "Recommendation", text, evidenceIds: items.map((item) => item.id), sourceUrls: sourceUrls(items),
  });
  const score = opportunity.scorecard || {};
  const confidenceBand = confidenceResult?.band || confidenceBandFor(Number(confidenceResult?.score ?? 0));
  const confidenceExplanation = confidenceResult?.reasons?.length
    ? `${confidenceBand} confidence: ${confidenceResult.reasons.join("; ")}.`
    : `${confidenceBand} confidence reflects ${new Set(evidence.map((item: Evidence) => domain(item.url))).size} independent evidence domains, ${opposing.length} contradictory item${opposing.length === 1 ? "" : "s"}, and the current source-quality mix.`;
  const experiments = buildExperiments(payload);
  const sections = payload.reportMode === "quick_scan"
    ? quickSections(payload, { evidence, painEvidence, demandEvidence, pricingEvidence, supporting, opposing, strongestPositive, strongestNegative, fact, inference, hypothesis, recommendation, experiments, confidenceExplanation })
    : fullSections(payload, { evidence, painEvidence, demandEvidence, pricingEvidence, supporting, opposing, strongestPositive, strongestNegative, fact, inference, hypothesis, recommendation, experiments, confidenceExplanation });
  const specialistOutputs = enrichSpecialists(payload, evidence);
  const chartCatalog = buildDecisionCharts(payload, charts).map((chart) => ({
    key: chart.chartKey,
    title: String(chart.chartConfig?.title || titleFor(chart.chartKey)),
    sourceData: chart.sourceData,
    evidenceIds: chart.supportingEvidenceIds || [],
    sourceExplanation: String(chart.chartConfig?.sourceExplanation || "Derived deterministically from the immutable report payload."),
    unavailable: Boolean((chart.sourceData as any).unavailable),
  }));

  return {
    schemaVersion: 1,
    headline: `${score.verdict}: ${decisionHeadline(score.verdict, payload.reportMode)}`,
    decision: score.verdict,
    score: Number(score.total || 0),
    scoreConfidence: Number(score.confidence || 0),
    evidenceConfidence: {
      band: confidenceBand,
      score: Number(confidenceResult?.score ?? 0),
      explanation: confidenceExplanation,
      missingEvidence: unique([...(payload.evidenceGaps || []), ...(payload.limitations || [])]),
      deductions: confidenceResult?.deductions || payload.confidenceDimensions?.evidence?.deductions || [],
    },
    reportCompleteness: {
      score: Number(payload.confidenceDimensions?.completeness?.score || 0),
      complete: Boolean(payload.confidenceDimensions?.completeness?.complete),
      explanation: (payload.confidenceDimensions?.completeness?.reasons || []).join("; ") || "Report completeness was not calculated.",
      missing: payload.confidenceDimensions?.completeness?.missing || [],
    },
    sections,
    experiments,
    primaryRecommendation: primaryFounderAction(experiments[0]),
    specialistOutputs,
    charts: chartCatalog,
    fullValidationRecommended: payload.reportMode === "quick_scan"
      ? ["Build Now", "Validate First", "Niche Down"].includes(score.verdict)
      : undefined,
    fullValidationDecision: payload.reportMode === "full_validation"
      ? payload.fullValidationDecision
      : undefined,
  };
}

export function buildDecisionCharts(payload: any, existing: Chart[] = []): Chart[] {
  const evidence: Evidence[] = (payload.opportunity?.evidence || []).filter((item: Evidence) => !item.excluded);
  const allEvidenceIds = evidence.map((item) => item.id);
  const scoreRefs = Object.values(payload.opportunity?.scorecard?.evidenceRefs || {}).flatMap((value: any) => Array.isArray(value) ? value : []);
  const factor = chart("factor-breakdown", "bar", { values: payload.opportunity?.scorecard?.scores || {} }, unique(scoreRefs), "The 12 factor values are copied from the deterministic scorecard in this report version.");
  const balance = chart("evidence-balance", "bar", {
    supporting: evidence.filter((item) => !item.disconfirming).length,
    contradictory: evidence.filter((item) => item.disconfirming).length,
  }, allEvidenceIds, "Counts of accepted supporting and contradictory evidence rows in this report version.");
  const sourceQuality = chart("source-quality-distribution", "bar", {
    byTier: Object.fromEntries([1, 2, 3, 4].map((tier) => [`tier_${tier}`, evidence.filter((item) => (item.sourceTier || 4) === tier).length])),
  }, allEvidenceIds, "Counts of accepted evidence rows grouped by persisted source tier.");

  const competitors = (payload.opportunity?.competitors || []).filter((item: any) => Array.isArray(item.evidenceIds) && item.evidenceIds.length);
  const competitorChart = competitors.length
    ? chart("alternatives-comparison", "bar", {
      values: Object.fromEntries(competitors.map((item: any) => [`${item.name} (${String(item.classification || "adjacent").replaceAll("_", " ")})`, item.evidenceIds.length])),
      classifications: Object.fromEntries(competitors.map((item: any) => [item.name, item.classification || "adjacent"])),
    }, unique(competitors.flatMap((item: any) => item.evidenceIds)), "Accepted evidence links by persisted classification. Adjacent products are not counted as direct incumbents.")
    : chart("alternatives-comparison", "bar", { unavailable: true, reason: "No competitor row had an accepted evidence-item reference.", values: {} }, [], "Unavailable: competitor rows were not sufficiently linked to accepted evidence.");
  if (payload.reportMode === "quick_scan") return [factor, balance, sourceQuality, competitorChart];

  const selectedExisting = existing.filter((item) => [
    "pricing-landscape", "score-contribution", "evidence_coverage", "evidence_timeline", "research-funnel", "pain-clusters",
  ].includes(item.chartKey)).map((item) => ({
    ...item,
    chartConfig: {
      ...(item.chartConfig || {}),
      sourceExplanation: item.chartConfig?.sourceExplanation || "Derived from persisted structured rows and evidence references in this report version.",
    },
  }));
  return dedupeCharts([factor, balance, sourceQuality, competitorChart, ...selectedExisting]).slice(0, 8);
}

function quickSections(payload: any, c: any): Section[] {
  const o = payload.opportunity;
  const competitorText = (o.competitors || []).map((item: any) => {
    const integrity = competitorIntegrityPresentation(item);
    return `${item.name} (${String(item.classification || "adjacent").replaceAll("_", " ")}, ${integrity.verificationStatus.replaceAll("_", " ")}): ${integrity.positioning}; pricing ${integrity.pricing}.`;
  }).join(" ");
  const scoreStatements = scoringStatements(o.scorecard);
  const content: Record<string, Section> = {
    "Executive decision": section("executive-decision", "Executive decision", c.inference(`${o.scorecard.verdict} at ${o.scorecard.scoreBand?.display || `${round(o.scorecard.total)}/100`}. ${decisionHeadline(o.scorecard.verdict, payload.reportMode)}`, c.evidence)),
    "Score, verdict and Evidence Confidence": { key: "score-confidence", title: "Score, verdict and Evidence Confidence", summary: c.confidenceExplanation, statements: scoreStatements },
    "Idea interpretation": section("idea-interpretation", "Idea interpretation", c.hypothesis(`${payload.canonicalResearchBrief?.exactProductProposition || o.oneLiner} The canonical research brief remains the semantic boundary; this is a testable product hypothesis, not an established market fact.`)),
    "Target customer and job to be done": section("target-customer", "Target customer and job to be done", c.inference(`${o.targetCustomer} need to ${jobFrom(o.corePain)}.`, c.painEvidence)),
    "Problem and demand": { key: "problem-demand", title: "Problem and demand", summary: "What the retrieved evidence actually establishes.", statements: [...take<Evidence>(c.painEvidence as Evidence[], 2).map((item) => c.fact(item)), ...take<Evidence>(c.demandEvidence as Evidence[], 2).map((item) => c.fact(item)), ...(c.painEvidence.length || c.demandEvidence.length ? [] : [missing("No direct pain or demand evidence was accepted.")])] },
    "Alternatives and competitors": section("alternatives", "Alternatives and competitors", competitorText ? c.inference(competitorText, evidenceForIds(c.evidence, (o.competitors || []).flatMap((item: any) => item.evidenceIds || []))) : missing("No attributable competitor comparison was established.")),
    "Pricing and willingness to pay": section("pricing", "Pricing and willingness to pay", c.pricingEvidence.length ? c.fact(c.pricingEvidence[0]) : missing("No accepted pricing or willingness-to-pay evidence exists. Treat the stored offer as a hypothesis."), c.hypothesis(`${o.pricing.model}; initial offer: ${o.pricing.firstOffer}.`)),
    "Strongest positive signal": section("positive", "Strongest positive signal", c.fact(c.strongestPositive)),
    "Strongest negative signal": section("negative", "Strongest negative signal", c.fact(c.strongestNegative)),
    "Risks and missing evidence": { key: "risks-gaps", title: "Risks and missing evidence", summary: "What can still invalidate the decision.", statements: [...(o.risks || []).map((risk: any) => c.inference(`${risk.severity} ${risk.category} risk: ${risk.description}`, evidenceForIds(c.evidence, risk.evidenceIds))), ...unique([...(payload.evidenceGaps || []), ...(payload.limitations || [])]).map(missing)] },
    "Three concrete experiments": { key: "experiments", title: "Three concrete experiments", summary: "Run these before increasing build scope.", statements: c.experiments.map((item: any) => c.recommendation(`${item.name}: ${item.method} Success: ${item.successCriterion}`)) },
    "Final recommendation": section("final-recommendation", "Final recommendation", c.recommendation(`${decisionHeadline(o.scorecard.verdict, payload.reportMode)} ${primaryFounderAction(c.experiments[0])}`, c.evidence)),
    "Methodology and sources": section("methodology", "Methodology and sources", c.inference(payload.methodology, c.evidence), c.inference(`${c.evidence.length} accepted evidence rows across ${new Set(c.evidence.map((item: Evidence) => domain(item.url))).size} evidence domains.`, c.evidence)),
  };
  return QUICK_SECTIONS.map((title) => content[title]);
}

function fullSections(payload: any, c: any): Section[] {
  const o = payload.opportunity;
  const insights = payload.fullValidationInsights || {};
  const decision = payload.fullValidationDecision || {};
  const specialists = new Map((payload.specialistAssessments || []).map((item: any) => [item.name, item]));
  const statementForSpecialist = (name: string) => {
    const specialist: any = specialists.get(name);
    return specialist ? c.inference(specialist.assessment, evidenceForIds(c.evidence, specialist.evidenceIds)) : missing(`The ${name} assessment is unavailable.`);
  };
  const sections: Section[] = [
    section("executive-decision", "Executive decision", c.inference(`${o.scorecard.verdict} at ${o.scorecard.scoreBand?.display || `${round(o.scorecard.total)}/100`}. ${decisionHeadline(o.scorecard.verdict, payload.reportMode)}`, c.evidence)),
    { key: "score-confidence", title: "Score, verdict and confidence", summary: c.confidenceExplanation, statements: scoringStatements(o.scorecard) },
    section("idea-assumptions", "Idea and assumptions", c.hypothesis(o.oneLiner), c.hypothesis(`Assumed buyer: ${o.targetCustomer}. Assumed market: ${o.market}.`)),
    { key: "segments", title: "Target segments", summary: decision.recommendedSegment ? `Recommended initial segment: ${decision.recommendedSegment}.` : "No initial segment cleared the deterministic evidence threshold.", statements: (decision.segmentRankings || []).map((item: any) => c.inference(`${item.segment}: ${item.score}/100, evidence strength ${item.evidenceStrength}. ${item.rankReason}`, evidenceForIds(c.evidence, item.evidenceIds))).concat((decision.segmentRankings || []).length ? [] : [missing("No evidence-bound segment was established.")]) },
    { key: "jobs", title: "Jobs to be done", summary: "Decision-relevant customer jobs.", statements: (insights.targetSegments || []).flatMap((item: any) => (item.jobsToBeDone || []).map((job: string) => c.inference(`${item.name}: ${job}`, evidenceForIds(c.evidence, item.evidenceIds)))).concat((insights.targetSegments || []).length ? [] : [c.hypothesis(jobFrom(o.corePain))]) },
    { key: "problem", title: "Problem severity and frequency", summary: "Frequency is reported only when sourced.", statements: [...take(c.painEvidence, 4).map(c.fact), ...(c.painEvidence.length ? [] : [missing("No accepted direct pain evidence.")]), missing("No reliable frequency estimate was accepted unless explicitly stated above.")] },
    { key: "demand", title: "Demand and behavioural evidence", summary: "Observed signals, not a market-size estimate.", statements: [...take(c.demandEvidence, 4).map(c.fact), statementForSpecialist("demand")] },
    section("alternatives", "Current alternatives", (decision.alternativeMap || []).length ? c.inference((decision.alternativeMap || []).map((item: any) => `${item.name} (${String(item.classification).replaceAll("_", " ")}).`).join(" "), evidenceForIds(c.evidence, (decision.alternativeMap || []).flatMap((item: any) => item.evidenceIds || []))) : missing("Current alternatives were not established.")),
    { key: "competitors", title: "Competitor deep dives", summary: "Only verified source-linked fields and gaps are shown.", statements: (decision.alternativeMap || []).map((item: any) => c.inference(`${item.name} — ${String(item.classification).replaceAll("_", " ")}; target: ${item.targetSegment || "not verified"}; positioning: ${item.positioning || "not verified"}; pricing: ${item.verifiedPricing || "not verified"}; complaints: ${(item.recurringComplaints || []).join("; ") || "not established"}; switching: ${(item.switchingImplications || []).join("; ") || "not established"}; differentiation gap: ${item.differentiationGap || "not established"}.`, evidenceForIds(c.evidence, item.evidenceIds))).concat((decision.alternativeMap || []).length ? [] : [missing("No competitor deep dive was supportable.")]) },
    section("positioning", "Positioning opportunities", statementForSpecialist("competition")),
    section("pricing-landscape", "Pricing and packaging landscape", ...((decision.economicsScenarios || []).length ? (decision.economicsScenarios || []).map((item: any) => c.inference(`${item.name}: price ${item.price ?? "unresolved"} ${item.currency || ""}; customers required ${item.customersRequired ?? "unresolved"}; gross margin ${item.grossMarginRange ? `${item.grossMarginRange[0]}–${item.grossMarginRange[1]}%` : "unresolved"}; break-even customers ${item.breakEvenCustomers ?? "unresolved"}; support burden ${item.supportBurden}. Assumptions: ${(item.assumptions || []).join("; ")}`, evidenceForIds(c.evidence, item.evidenceSourceIds))) : [missing("No deterministic economics scenario was available.")])),
    section("wtp", "Willingness-to-pay evidence", insights.willingnessToPay?.evidenceIds?.length ? c.inference(`${insights.willingnessToPay.strength}: ${insights.willingnessToPay.finding}`, evidenceForIds(c.evidence, insights.willingnessToPay.evidenceIds)) : missing("No direct payment, paid-pilot, or purchase-commitment evidence was accepted.")),
    { key: "market-context", title: "Market context", summary: insights.marketContext?.summary || "No market context was established.", statements: (insights.marketContext?.metrics || []).map((metric: any) => ({ kind: "Fact" as const, text: `${metric.label}: ${metric.value}`, evidenceIds: metric.evidenceId ? [metric.evidenceId] : [], sourceUrls: metric.sourceUrl ? [metric.sourceUrl] : [] })).concat((insights.marketContext?.metrics || []).length ? [] : [missing("No source-bound market metric was retained. Market sizing was not invented.")]) },
    section("mvp", "MVP scope", c.recommendation(`${o.mvp.outcome}. Include: ${(o.mvp.scope || []).join("; ")}.`)),
    section("not-build", "What not to build", c.recommendation((o.mvp.exclusions || []).join("; ") || "Keep nonessential scope out until the core workflow is validated.")),
    section("gtm", "GTM channels", statementForSpecialist("gtm"), c.recommendation(`Start with ${o.launch.firstCustomerChannel}.`)),
    section("first-customers", "First-customer strategy", decision.founderActionPlan ? c.recommendation(`${decision.founderActionPlan.highestValueHypothesis} Recruit ${decision.founderActionPlan.sampleSize} via ${decision.founderActionPlan.recruitmentChannel}; success: ${decision.founderActionPlan.successThreshold}; failure: ${decision.founderActionPlan.failureThreshold}; maximum budget: ${decision.founderActionPlan.maximumBudget.amount} ${decision.founderActionPlan.maximumBudget.currency}.`) : c.recommendation(primaryFounderAction(c.experiments[0]))),
    { key: "risks", title: "Risks", summary: "Persisted risks and their mitigations.", statements: (o.risks || []).map((risk: any) => c.inference(`${risk.severity} ${risk.category}: ${risk.description} Mitigation: ${risk.mitigation}`, evidenceForIds(c.evidence, risk.evidenceIds))) },
    {
      key: "adversarial",
      title: "Adversarial findings",
      summary: "Contradictions test the same proposition-specific claim; unrelated market facts are not paired.",
      statements: [
        ...(decision.adversarialGate
          ? [c.inference(`${decision.adversarialGate.verdict}; ${Object.entries(decision.adversarialGate.checks || {}).map(([key, value]) => `${key}: ${value}`).join("; ")}.`, c.evidence)]
          : []),
        ...((payload.contradictions || []).map((item: any) => c.inference(
          `${item.exactClaimTested} — ${item.relationship} Resolution: ${String(item.resolutionStatus || "unresolved").replaceAll("_", " ")}${item.resolutionNote ? ` (${item.resolutionNote})` : ""}.`,
          evidenceForIds(c.evidence, [...(item.supportingEvidenceIds || []), ...(item.challengingEvidenceIds || [])]),
        ))),
        ...((payload.contradictions || []).length ? [] : [missing("No strong proposition-specific contradictory evidence was found")]),
      ],
    },
    { key: "gaps", title: "Evidence gaps", summary: "Missing evidence is part of the decision.", statements: unique([...(payload.evidenceGaps || []), ...(payload.limitations || []), ...(c.pricingEvidence.length ? [] : ["No direct willingness-to-pay evidence."])]).map(missing) },
    { key: "experiments", title: "Validation experiments", summary: "Tests with explicit success and failure criteria.", statements: c.experiments.map((item: any) => c.recommendation(`${item.name}: ${item.method} Success: ${item.successCriterion} Failure: ${item.failureCriterion}`)) },
    { key: "scoring", title: "12-factor scoring explanation", summary: "Every factor is deterministic and evidence-linked where possible.", statements: scoringStatements(o.scorecard) },
    section("methodology", "Methodology, limitations and sources", c.inference(payload.methodology, c.evidence), c.inference(`${c.evidence.length} accepted evidence rows across ${new Set(c.evidence.map((item: Evidence) => domain(item.url))).size} evidence domains; no market sizing was inferred without an attributable metric.`, c.evidence)),
  ];
  return FULL_SECTIONS.map((title) => sections.find((item) => item.title === title)!);
}

function enrichSpecialists(payload: any, evidence: Evidence[]) {
  const acceptedIds = new Set(evidence.map((item) => item.id));
  const positiveIds = evidence.filter((item) => !item.disconfirming).map((item) => item.id);
  const negativeIds = evidence.filter((item) => item.disconfirming).map((item) => item.id);
  const gaps = unique([...(payload.evidenceGaps || []), ...(payload.limitations || [])]);
  const implications: Record<string, string> = {
    demand: "Do not expand scope until buyer behaviour confirms that the pain is frequent and urgent.",
    competition: "Differentiate on a narrow workflow that incumbents demonstrably handle poorly.",
    market: "Use segment-level bottom-up validation; do not infer market size from generic category statistics.",
    pricing: "Treat packaging as a hypothesis until a buyer accepts a paid pilot or purchase commitment.",
    risk: "Resolve the strongest redundancy and platform-dependency objections before committing engineering capacity.",
    gtm: "Use one reachable buyer channel and measure qualified conversations, pilots, and paid conversion.",
  };
  return (payload.specialistAssessments || []).map((item: any) => {
    const own = unique<string>((item.evidenceIds || []).map(String)).filter((id) => acceptedIds.has(id));
    const persistedOpposing = unique<string>((item.opposingEvidenceIds || []).map(String)).filter((id) => acceptedIds.has(id));
    const opposingPool = ["ChallengesOpportunity", "Challenges opportunity"].includes(item.direction) ? positiveIds : negativeIds;
    const opposingEvidenceIds = persistedOpposing.length
      ? persistedOpposing.filter((id) => !own.includes(id))
      : opposingPool.filter((id) => !own.includes(id)).slice(0, 3);
    const confidence = own.length ? (item.confidence || (own.length >= 3 ? "Moderate" : "Low")) : "Insufficient";
    return {
      name: item.name,
      keyFindings: own.length
        ? unique((item.findings?.length ? item.findings : [item.assessment]).map(cleanSpecialistText).filter(Boolean))
        : ["Insufficient evidence"],
      evidenceIds: own,
      opposingEvidenceIds,
      confidence,
      relevantBriefDimensions: unique(item.relevantBriefDimensions || []),
      unresolvedGaps: unique([...(item.unresolvedGaps || []), ...gaps]).slice(0, 6),
      decisionImplication: implications[item.name] || "Resolve the cited gaps before increasing commitment.",
    };
  });
}

function buildExperiments(payload: any) {
  const customer = payload.opportunity?.targetCustomer || "target buyers";
  const pain = payload.opportunity?.corePain || "the core workflow problem";
  const offer = payload.opportunity?.pricing?.firstOffer || "a paid pilot";
  return [
    {
      name: "Problem-frequency interviews",
      hypothesis: `${customer} experience ${pain} often enough to change behaviour.`,
      targetParticipant: `Buyers or workflow owners in the ${customer} segment who meet the qualification rule`,
      recruitmentMethod: "Use only a buyer channel established in the canonical brief; otherwise record channel reachability as an evidence gap.",
      sampleSize: "Not prefilled — define the qualified participant set before the test.",
      method: `Collect attributable recent-occurrence accounts from independent qualified participants in the ${customer} segment; capture the workaround, frequency, consequence, and owner.`,
      successCriterion: "Multiple independent qualified buyers provide recent examples with a measurable consequence and active search for a better workflow.",
      failureCriterion: "Qualified buyers consistently report no recent consequential occurrence or no reason to change behaviour.",
      duration: "Not prefilled — set and persist the test window before starting.",
      decisionUnlocked: "Whether the stated problem is frequent and consequential enough to justify further validation.",
    },
    {
      name: "Concierge workflow pilot",
      hypothesis: "A narrow assisted workflow creates repeat usage before automation is built.",
      targetParticipant: `Qualified users in the ${customer} segment who can run the actual target workflow`,
      recruitmentMethod: "Recruit only participants who can run a real instance of the target workflow and permit attributable observation.",
      sampleSize: "Not prefilled — define independent qualified workflow instances before the test.",
      method: "Run the scoped workflow without unsupported automation; record repeat use, completion, abandonment, and return to the existing alternative.",
      successCriterion: "Independent qualified users repeat the scoped workflow and choose to continue without requiring unrelated scope.",
      failureCriterion: "Users revert to the existing workflow or participation depends on unsupported feature expansion.",
      duration: "Not prefilled — span enough real workflow cycles to observe repeat use.",
      decisionUnlocked: "Whether the proposed workflow changes repeat behaviour before engineering automation.",
    },
    {
      name: "Paid-offer test",
      hypothesis: `${offer} is valuable enough to trigger a real commitment.`,
      targetParticipant: `Independent budget holders in the ${customer} segment`,
      recruitmentMethod: "Use qualified participants who reviewed or used the same scoped workflow; do not mix materially different offers.",
      sampleSize: "Not prefilled — define the independent qualified buyer set before the test.",
      method: `Present the same scoped ${offer} and request an attributable payment, deposit, or signed paid-pilot commitment.`,
      successCriterion: "At least two independent qualified buyers make an attributable monetary or signed commitment.",
      failureCriterion: "Interest remains verbal or depends on unsupported feature expansion.",
      duration: "Not prefilled — set and persist the decision window before starting.",
      decisionUnlocked: "Whether to proceed with paid product development, change packaging, or stop.",
    },
  ];
}

function scoringStatements(scorecard: any): Statement[] {
  return Object.entries(scorecard?.scores || {}).map(([criterion, rawScore]) => ({
    kind: "Inference",
    text: scorecard?.factorEvidence?.[criterion]
      ? `${titleFor(criterion)}: ${round(Number(scorecard.factorEvidence[criterion].rawScore))} raw, coefficient ${Number(scorecard.factorEvidence[criterion].evidenceCoefficient).toFixed(2)}, ${round(Number(scorecard.factorEvidence[criterion].effectiveScore))} effective, ${scorecard.factorEvidence[criterion].evidenceState}. ${scorecard?.notes?.[criterion] || "No factor note was persisted."}`
      : `${titleFor(criterion)}: ${round(Number(rawScore))}/100 (legacy factor without persisted evidence state). ${scorecard?.notes?.[criterion] || "No factor note was persisted."}`,
    evidenceIds: unique(scorecard?.evidenceRefs?.[criterion] || []),
    sourceUrls: [],
  }));
}

function section(key: string, title: string, ...statements: Statement[]): Section {
  return { key, title, summary: statements[0]?.text || "No decision-ready finding.", statements };
}
function missing(text: string): Statement { return { kind: "MissingEvidence", text, evidenceIds: [], sourceUrls: [] }; }
function evidenceForIds(evidence: Evidence[], ids: unknown) {
  const allowed = new Set(Array.isArray(ids) ? ids : []);
  return evidence.filter((item) => allowed.has(item.id));
}
function take<T>(values: T[], count: number) { return values.slice(0, count); }
function unique<T>(values: T[]): T[] { return [...new Set(values.filter(Boolean))]; }
function round(value: number) { return Math.round(value * 10) / 10; }
function domain(url: string) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } }
function confidenceBandFor(score: number) { return score >= 0.75 ? "High" : score >= 0.5 ? "Moderate" : score > 0 ? "Low" : "Insufficient"; }
function titleFor(value: string) { return value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function jobFrom(pain: string) { return pain ? `complete the underlying workflow without ${pain.toLowerCase()}` : "complete the core workflow with less delay and uncertainty"; }
function decisionHeadline(verdict: string, mode: string) {
  if (verdict === "Build") return "Evidence supports building the recommended narrow wedge.";
  if (verdict === "Build Now") return "Evidence supports a tightly scoped build.";
  if (verdict === "Validate First") return "Promising signals exist, but the next commitment should be validation.";
  if (verdict === "Niche Down") return "A narrower buyer and workflow are required.";
  if (verdict === "Weak Signal") return "Do not build beyond a cheap demand test.";
  if (verdict === "Reposition") return "The current wedge is not defensible; test a materially different position.";
  if (verdict === "Do Not Build Yet") return "The adversarial gate blocks a build until an explicit upgrade condition is met.";
  return mode === "quick_scan" ? "Do not advance to Full Validation until the missing demand or payment signal is found." : "Do not commit to a build; resolve the decisive evidence gaps first.";
}
export function primaryFounderAction(experiment: any) {
  if (!experiment) return "No founder action is available because the experiment specification is incomplete.";
  return `Founder action: recruit ${experiment.sampleSize} from ${experiment.targetParticipant} via ${experiment.recruitmentMethod} Offer and artefact: ${experiment.method} Timing: ${experiment.duration}. Success threshold: ${experiment.successCriterion} Failure threshold: ${experiment.failureCriterion} Decision unlocked: ${experiment.decisionUnlocked}`;
}
function chart(chartKey: string, chartType: string, sourceData: Record<string, unknown>, supportingEvidenceIds: string[], sourceExplanation: string): Chart {
  return { chartKey, chartType, sourceData, supportingEvidenceIds, chartConfig: { title: titleFor(chartKey), sourceExplanation } };
}
function dedupeCharts(charts: Chart[]) {
  const found = new Map<string, Chart>();
  for (const chart of charts) if (!found.has(chart.chartKey)) found.set(chart.chartKey, chart);
  return [...found.values()];
}

function cleanSpecialistText(value: unknown) {
  return String(value || "")
    .replace(/\bSOURCE_ID\s*:?\s*[0-9a-f-]{8,}\b/gi, "")
    .replace(/\bsource[_\s-]?id\s*:?\s*[^\s,;.)]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}
