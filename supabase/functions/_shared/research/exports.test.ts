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
  }],
  payload: {
    id: "00000000-0000-4000-8000-000000000001",
    score: 84,
    verdict: "Validate First",
    content: "Actual run content",
    reasoningFlags: [{
      type: "AdversarialObjection",
      severity: "Blocking",
      message: "A dominant incumbent invalidates the optimistic tier.",
      evidenceIds: ["00000000-0000-4000-8000-000000000002"],
    }],
    specialistDisputes: [{
      specialist: "pricing",
      specialistDirection: "SupportsOpportunity",
      checkerDirection: "ChallengesOpportunity",
      disputed: true,
      reason: "Pricing evidence was interpreted differently.",
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
  },
};

Deno.test("all export formats carry consistent run facts", () => {
  const outputs = [
    renderJson(input),
    renderMarkdown(input),
    renderCsv(input),
    new TextDecoder().decode(renderPdf(input)),
  ];
  for (const output of outputs) {
    assert(output.includes("Actual run content"), "idea missing");
    assert(output.includes(input.runId), "run ID missing");
    assert(output.includes("84"), "score missing");
    assert(output.includes("Validate First"), "verdict missing");
    assert(
      output.includes("A dominant incumbent invalidates the optimistic tier."),
      "adversarial objection missing",
    );
    assert(output.includes("pricing"), "specialist dispute missing");
    assert(
      output.includes("claimsChecked") || output.includes("Claims checked"),
      "citation audit missing",
    );
    assert(
      output.includes("effectiveVerdict") ||
        output.includes("Effective verdict"),
      "decision integrity missing",
    );
  }
  assert(
    outputs[1].includes(input.breakdowns[0].evidenceIds[0]),
    "markdown citation missing",
  );
  assert(
    outputs[2].includes(input.breakdowns[0].evidenceIds[0]),
    "csv citation missing",
  );
  assert(outputs[3].startsWith("%PDF-1.4"), "invalid PDF signature");
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
  }));
  assert(/\/Count [2-9]/.test(pdf), "long report was not paginated");
  assert(pdf.includes(evidenceIds.at(-1)!), "final evidence ID was truncated");
});
