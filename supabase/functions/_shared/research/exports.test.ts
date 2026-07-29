import { renderCsv, renderJson, renderMarkdown, renderPdf } from "./exports.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}
const input = {
  runId: "00000000-0000-4000-8000-000000000001",
  ideaName: "Actual run content",
  total: 84,
  verdict: "Validate First",
  confidence: 75,
  executiveSummary: "Evidence-backed summary.",
  methodology: "Deterministic method.",
  breakdowns: [{
    criterion: "painSeverity",
    score: 80,
    weight: 12,
    note: "Verified pain.",
    evidenceIds: ["00000000-0000-4000-8000-000000000002"],
    rawScore: 90,
    evidenceCoefficient: 0.75,
    effectiveScore: 80,
    evidenceState: "EVIDENCED",
    supportingEvidenceIds: ["00000000-0000-4000-8000-000000000002"],
    confidenceDeductions: [],
    unresolvedGaps: [],
  }],
  payload: {
    id: "00000000-0000-4000-8000-000000000001",
    version: "2.0",
    researchAvailabilityState: "research_completed",
    score: 84,
    verdict: "Validate First",
    content: "Actual run content",
    evidenceSufficiency: {
      acceptedEvidenceCount: 1,
      independentEvidenceGroups: 1,
      independentDomains: 1,
      sourceFamilyCoverage: ["customer_pain"],
      primaryDirectEvidenceCount: 1,
      supportingEvidenceCount: 1,
      challengingEvidenceCount: 0,
      coveredFactors: ["painSeverity"],
      assumedFactors: ["willingnessToPay"],
      missingEvidenceFamilies: ["willingness_to_pay"],
      sourceConcentration: 1,
      overallEvidenceConfidence: "Low",
      mostImportantLimitation: "Direct willingness-to-pay evidence is missing.",
    },
    verdictChangeConditions: {
      nearestBoundary: 85,
      highestLeverageUncertainFactor: "willingnessToPay",
      upgradeCondition: "We would upgrade this verdict if independent buyers make paid commitments.",
      downgradeCondition: "We would downgrade it if current alternatives remove switching friction.",
    },
    researchExecution: {
      packStatuses: [
        { packKey: "quick_primary", status: "completed", acceptedEvidenceCount: 1 },
        { packKey: "quick_adversarial", status: "completed_no_evidence", acceptedEvidenceCount: 0 },
        { packKey: "quick_pricing_wtp", status: "completed", acceptedEvidenceCount: 1 },
        { packKey: "quick_coverage_repair", status: "skipped", acceptedEvidenceCount: 0 },
      ],
    },
    fullValidationDecision: {
      verdictStructure: {
        scoreRange: "70-91",
        evidenceConfidence: "Low",
        recommendedTargetSegment: "Independent operators",
        recommendedProductWedge: "Narrow approval workflow",
        strongestAssumption: "Paid commitment is unresolved.",
        upgradeCondition: "Upgrade after two attributable paid commitments.",
        downgradeCondition: "Downgrade if bundled alternatives satisfy buyers.",
        killCondition: "Kill after a time-boxed test produces no commitment.",
      },
      segmentRankings: [{ segment: "Independent operators", score: 72, rankReason: "Best supported segment." }],
      economicsScenarios: [{ name: "base", price: null, currency: null, customersRequired: null, grossMarginRange: null, breakEvenCustomers: null }],
      founderActionPlan: { days: [{ days: "1-5", action: "Recruit qualified buyers." }] },
    },
    reasoningFlags: [{
      type: "AdversarialObjection",
      severity: "Blocking",
      message: "A dominant incumbent invalidates the optimistic tier.",
      evidenceIds: ["00000000-0000-4000-8000-000000000002"],
    }],
    adversarialGate: {
      outcome: "StrongObjection",
      severity: "High",
      objection: "A dominant incumbent invalidates the optimistic tier.",
      evidence_ids: ["00000000-0000-4000-8000-000000000002"],
      unresolved: true,
    },
    citationValidation: {
      valid: true,
      claimsChecked: 3,
      claimsRemoved: 0,
      invalidClaims: [],
    },
    decisionIntegrity: {
      deterministicVerdict: "Validate First",
      effectiveVerdict: "Weak Signal",
      finalJudgeWrittenVerdict: "Validate First",
      finalJudgeScoreMismatch: false,
      finalJudgeEffectiveMismatch: true,
      adversarialDowngrade: true,
      reason: "Unresolved evidence-cited objection.",
    },
    opportunity: {
      scorecard: {
        scoreBand: {
          minimum: 70,
          maximum: 91,
          label: "Low Evidence Confidence",
          display: "70–91 · Low Evidence Confidence",
        },
      },
      evidence: [{
        id: "00000000-0000-4000-8000-000000000002",
        source: "Buyer interview archive",
        canonicalDomain: "buyer.example.test",
        sourceType: "Direct buyer evidence",
        evidenceRole: "supporting",
        associatedFactorIds: ["painSeverity"],
        title: "Attributable buyer pain",
        snippet: "Service teams report approval disputes.",
        url: "https://example.test/evidence",
      }],
    },
  },
};

Deno.test("all export formats carry consistent run facts", () => {
  const outputs = [
    renderJson(input),
    renderMarkdown(input),
    renderCsv(input),
    new TextDecoder().decode(renderPdf(input)),
  ];
  for (const [index, output] of outputs.entries()) {
    assert(output.includes("Actual run content"), "idea missing");
    assert(index === 3 ? output.includes("Report reference 00000000") : output.includes(input.runId), "report reference missing");
    assert(output.includes("84"), "score missing");
    assert(output.includes("Validate First"), "verdict missing");
    assert(
      output.includes("A dominant incumbent invalidates the optimistic tier."),
      "adversarial objection missing",
    );
    assert(
      output.includes("claimsChecked") || output.includes("Claims checked"),
      "citation audit missing",
    );
    assert(
      output.includes("effectiveVerdict") ||
        output.includes("Effective verdict"),
      "decision integrity missing",
    );
    assert(
      output.includes("Evidence Sufficiency") ||
        output.includes("evidenceSufficiency") ||
        output.includes("evidence_sufficiency_json") ||
        output.includes("EVIDENCE SUFFICIENCY"),
      "Evidence Sufficiency missing",
    );
    assert(output.includes("Research Completed") || output.includes("research_completed") || output.includes("RESEARCH COMPLETED"), "research availability missing");
    assert(output.includes("quick_primary") || output.toLowerCase().includes("quick primary"), "research pack status missing");
    assert(output.includes("70") && output.includes("91"), "displayed uncertainty range missing");
    assert(output.includes("Independent operators"), "segment recommendation missing");
    assert(output.includes("Narrow approval workflow"), "product wedge missing");
    assert(output.includes("Upgrade after two attributable paid commitments."), "upgrade condition missing");
    assert(output.includes("Downgrade if bundled alternatives satisfy buyers."), "downgrade condition missing");
    assert(output.includes("Kill after a time-boxed test produces no commitment."), "kill condition missing");
  }
  assert(
    outputs[1].includes("[S1] Attributable buyer pain (Buyer interview archive)"),
    "human-readable markdown citation missing",
  );
  assert(!outputs[1].includes(input.breakdowns[0].evidenceIds[0]), "Markdown exposed a raw evidence UUID");
  assert(
    outputs[2].includes(input.breakdowns[0].evidenceIds[0]),
    "csv citation missing",
  );
  assert(outputs[3].startsWith("%PDF-1.4"), "invalid PDF signature");
  assert(outputs[3].includes("[S1] buyer.example.test"), "canonical-domain PDF citation missing");
  assert(!outputs[3].includes(input.breakdowns[0].evidenceIds[0]), "PDF exposed a raw evidence UUID");
});

Deno.test("PDF wraps citations across pages without truncating them", () => {
  const evidenceIds = Array.from(
    { length: 12 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const pdf = new TextDecoder().decode(renderPdf({
    ...input,
    breakdowns: Array.from({ length: 12 }, (_, index) => ({
      criterion: `criterion${index}`,
      score: 50,
      weight: 8,
      note: "A traceable deterministic factor with a concise explanation.",
      evidenceIds,
    })),
    payload: {
      ...input.payload,
      opportunity: {
        evidence: evidenceIds.map((id, index) => ({
          id,
          source: `Readable source ${index + 1}`,
          title: `Evidence ${index + 1}`,
          snippet: "Traceable evidence.",
          url: `https://source-${index + 1}.example.test`,
        })),
      },
    },
  }));
  const pageCount = Number(pdf.match(/\/Count (\d+)/)?.[1] ?? 0);
  assert(pageCount > 1, "long report was not paginated");
  assert(pdf.includes("[S12] Readable source 12"), "final readable citation was truncated");
  assert(!pdf.includes(evidenceIds.at(-1)!), "PDF exposed the final raw evidence UUID");
});

Deno.test("text exports preserve UTF-8 and PDF encodes WinAnsi punctuation and accents", () => {
  const international = {
    ...input,
    ideaName: "Café validation — São Paulo",
    executiveSummary: "Buyers said “não” before paying €10.",
  };
  const csv = renderCsv(international);
  const markdown = renderMarkdown(international);
  const json = renderJson({ ...international, payload: { content: international.executiveSummary } });
  const pdf = new TextDecoder().decode(renderPdf(international));
  assert(csv.charCodeAt(0) === 0xfeff, "CSV is missing its UTF-8 BOM");
  assert(markdown.includes("Café validation — São Paulo"), "Markdown lost UTF-8 text");
  assert(json.includes("não"), "JSON lost UTF-8 text");
  assert(pdf.includes("Caf\\351 validation \\227 S\\343o Paulo"), "PDF did not encode WinAnsi text safely");
});
