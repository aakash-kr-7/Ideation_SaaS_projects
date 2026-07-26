import { buildDecisionCharts, buildDecisionProduct } from "./decision-product.ts";

function assert(value: unknown, message: string) {
  if (!value) throw new Error(message);
}

const positiveId = "00000000-0000-4000-8000-000000000001";
const negativeId = "00000000-0000-4000-8000-000000000002";
const criteria = [
  "painSeverity", "purchaseUrgency", "willingnessToPay", "buyerReachability", "mvpSpeed", "competitionGap",
  "retentionPotential", "platformDependencyRisk", "regulatoryRisk", "founderFit", "distributionClarity", "speedToFirstRevenue",
];
const scorecard = {
  scores: Object.fromEntries(criteria.map((key, index) => [key, 20 + index])),
  notes: Object.fromEntries(criteria.map((key) => [key, `Deterministic note for ${key}.`])),
  evidenceRefs: Object.fromEntries(criteria.map((key) => [key, [positiveId]])),
  weights: Object.fromEntries(criteria.map((key) => [key, 1])),
  total: 31,
  confidence: 60,
  verdict: "Avoid",
};
const payload: any = {
  id: "00000000-0000-4000-8000-000000000010",
  version: "2.0",
  reportMode: "quick_scan",
  generatedAt: new Date().toISOString(),
  executiveSummary: "Do not build before resolving payment evidence.",
  methodology: "External retrieval, attributable evidence, Gemini synthesis, deterministic scoring.",
  evidenceGaps: ["No direct payment evidence."],
  limitations: ["No frequency estimate."],
  strongestPositiveEvidenceId: positiveId,
  strongestNegativeEvidenceId: negativeId,
  opportunity: {
    name: "Approval workflow",
    oneLiner: "Approval workflow for small teams.",
    targetCustomer: "Small software agencies",
    corePain: "approval delays",
    market: "B2B SaaS",
    scorecard,
    evidence: [
      { id: positiveId, title: "Pain signal", snippet: "Teams wait for approvals.", url: "https://source.test/pain", signal: "Pain", strength: "Medium", sourceTier: 2, disconfirming: false },
      { id: negativeId, title: "Alternative signal", snippet: "Existing platforms include approval rules.", url: "https://source-two.test/risk", signal: "Risk", strength: "Medium", sourceTier: 2, disconfirming: true },
    ],
    competitors: [{ id: "c1", name: "Incumbent", target: "Software teams", positioning: "Integrated approvals", pricing: "Not public", strength: "Integrated", gap: "Client sign-off", evidenceIds: [negativeId] }],
    pricing: { model: "Subscription hypothesis", pricePoint: "Unvalidated", rationale: "No direct payment evidence.", firstOffer: "Paid pilot", targetCustomers: 3 },
    mvp: { outcome: "Prove repeat approval use", scope: ["Request", "Reminder", "Audit record"], exclusions: ["Analytics"], buildEstimate: "Two weeks", buildComplexity: "Low" },
    launch: { firstCustomerChannel: "Founder-led agency outreach", weekOne: ["Interview buyers", "Run concierge pilot", "Ask for payment"], outreachMessage: "Show the last delayed approval.", successMetric: "Two paid pilots", firstTenStrategy: ["Direct outreach"] },
    risks: [{ id: "r1", category: "Market", severity: "High", description: "Incumbents may be sufficient.", mitigation: "Test the narrow gap.", evidenceIds: [negativeId] }],
    createdAt: new Date().toISOString(),
  },
};

Deno.test("Quick Scan decision product has the required structure and chart provenance", () => {
  const charts = buildDecisionCharts(payload);
  const product = buildDecisionProduct(payload, charts, { band: "Low", score: 0.4, reasons: ["two domains"] });
  assert(product.sections.length === 13, "Quick Scan section count changed");
  assert(product.experiments.length === 3, "Quick Scan experiments are incomplete");
  assert(product.charts.length === 4, "Quick Scan must expose four chart states");
  assert(product.sections.flatMap((section) => section.statements).some((item) => item.kind === "MissingEvidence"), "missing evidence is not explicit");
  assert(product.sections.flatMap((section) => section.statements).some((item) => item.kind === "Fact" && item.evidenceIds.length), "facts are not cited");
});

Deno.test("Full Validation specialists are distinct, opposing, confidence-labelled decision outputs", () => {
  const names = ["competition", "market", "pricing", "risk", "demand", "gtm"];
  const full = {
    ...payload,
    reportMode: "full_validation",
    specialistAssessments: names.map((name) => ({
      name, direction: name === "risk" ? "ChallengesOpportunity" : "Mixed",
      assessment: `${name} assessment`, findings: [`${name} finding`], evidenceIds: [positiveId],
    })),
    fullValidationInsights: {
      targetSegments: [{ name: "Small agencies", jobsToBeDone: ["Get client sign-off"], evidenceIds: [positiveId] }],
      willingnessToPay: { finding: "Unproven", strength: "Insufficient", evidenceIds: [] },
      marketContext: { summary: "No market sizing.", metrics: [] },
      gtmFindings: [{ finding: "Founder-led outreach", evidenceIds: [positiveId] }],
    },
    adversarialGate: { outcome: "StrongObjection", objection: "Incumbents may be sufficient.", evidence_ids: [negativeId] },
  };
  const product = buildDecisionProduct(full, buildDecisionCharts(full), { band: "Low", score: 0.4, reasons: ["two domains"] });
  assert(product.sections.length === 23, "Full Validation section count changed");
  assert(product.specialistOutputs.length === 6, "six specialist outputs are required");
  assert(new Set(product.specialistOutputs.map((item: any) => item.decisionImplication)).size === 6, "specialist implications repeat");
  assert(product.specialistOutputs.every((item: any) => item.confidence && item.unresolvedGaps.length), "specialist confidence or gaps missing");
  assert(product.specialistOutputs.some((item: any) => item.opposingEvidenceIds.length), "opposing evidence missing");
});

Deno.test("adjacent competitors stay classified and specialist output never exposes raw source tokens", () => {
  const full = {
    ...payload,
    reportMode: "full_validation",
    opportunity: {
      ...payload.opportunity,
      competitors: [{
        ...payload.opportunity.competitors[0],
        name: "DocuSign",
        classification: "adjacent",
        evidenceIds: [positiveId],
      }],
    },
    specialistAssessments: ["competition", "market", "pricing", "risk", "demand", "gtm"].map((name) => ({
      name,
      direction: "Mixed",
      assessment: "Assessment SOURCE_ID: 11111111-1111-4111-8111-111111111111",
      findings: ["Finding SOURCE_ID 11111111-1111-4111-8111-111111111111"],
      evidenceIds: [positiveId, "99999999-9999-4999-8999-999999999999"],
      opposingEvidenceIds: [],
      unresolvedGaps: ["Buyer proof missing"],
      relevantBriefDimensions: ["workflow"],
    })),
    fullValidationInsights: {
      targetSegments: [],
      willingnessToPay: { finding: "Insufficient evidence", strength: "Insufficient", evidenceIds: [] },
      marketContext: { summary: "Insufficient evidence", metrics: [] },
      gtmFindings: [],
    },
  };
  const product = buildDecisionProduct(full, buildDecisionCharts(full), { band: "Low", score: 0.4 });
  assert(JSON.stringify(product.charts).includes("adjacent"), "chart lost competitor classification");
  assert(!JSON.stringify(product.specialistOutputs).includes("SOURCE_ID"), "raw source token leaked");
  assert(product.specialistOutputs.every((item: any) => item.evidenceIds.every((id: string) => id === positiveId)), "foreign dossier reference survived");
  assert(product.primaryRecommendation.includes("Success threshold") && product.primaryRecommendation.includes("Failure threshold"), "founder action is incomplete");
});
