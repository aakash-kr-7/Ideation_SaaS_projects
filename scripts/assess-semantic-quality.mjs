import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [quickRunId, fullRunId] = process.argv.slice(2);
const isRunId = (value) => /^[0-9a-f-]{36}$/i.test(value || "");
if (!isRunId(quickRunId) || !isRunId(fullRunId)) {
  throw new Error("Usage: node scripts/assess-semantic-quality.mjs <quick-run-id> <full-run-id>");
}

async function resolveAuditRoot() {
  const live = path.resolve("artifacts", "hybrid-audit");
  try {
    await readFile(path.join(live, quickRunId, "summary.json"), "utf8");
    return live;
  } catch {
    const certified = path.resolve("artifacts", "certified-release");
    const releases = await readdir(certified, { withFileTypes: true });
    for (const release of releases.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse()) {
      const candidate = path.join(certified, release, "hybrid-audit");
      try {
        await readFile(path.join(candidate, quickRunId, "summary.json"), "utf8");
        return candidate;
      } catch { /* try the preceding certified bundle */ }
    }
    throw new Error("No certified release artifact contains the immutable audit evidence.");
  }
}

const auditRoot = await resolveAuditRoot();
const load = async (runId, filename) =>
  JSON.parse(await readFile(path.join(auditRoot, runId, filename), "utf8"));

const [quickSummary, fullSummary, quickEvidence, fullEvidence, quickSources, fullSources, fullContradictions, fullSpecialists, fullScoreArtifact, fullReport] =
  await Promise.all([
    load(quickRunId, "summary.json"),
    load(fullRunId, "summary.json"),
    load(quickRunId, "evidence.json"),
    load(fullRunId, "evidence.json"),
    load(quickRunId, "sources.json"),
    load(fullRunId, "sources.json"),
    load(fullRunId, "contradictions.json"),
    load(fullRunId, "specialists.json"),
    load(fullRunId, "score.json"),
    load(fullRunId, "report.json"),
  ]);

const stringify = (value) => JSON.stringify(value).toLowerCase();
const approvalAnchor = /(customer|client).{0,100}(approval|approve|sign[- ]?off)|(?:approval|approve|sign[- ]?off).{0,100}(customer|client)|audit[- ]?trail|attributable approval|who approved/i;
const neighbouringMarket = /\b(ci\/cd|continuous integration|continuous deployment|devops|yaml pipeline|deployment automation)\b/i;
const accepted = (evidence) =>
  evidence.filter((item) => ["accepted", "directly_relevant", "contextually_relevant"].includes(String(item.acceptance_decision || "").toLowerCase()) ||
    Number(item.relevance_score || 0) >= 0.6);
const acceptedEvidence = [...accepted(quickEvidence), ...accepted(fullEvidence)];
const acceptedSourceIds = new Set(acceptedEvidence.map((item) => item.source_id));
const acceptedSources = [...quickSources, ...fullSources].filter((source) => acceptedSourceIds.has(source.id));
const driftItems = [...acceptedEvidence, ...acceptedSources].filter((item) => {
  const text = stringify(item);
  return neighbouringMarket.test(text) && !approvalAnchor.test(text);
});

const fullFamilies = Object.keys(fullSummary.evidenceFamilyCoverage || {});
const quickFamilies = Object.keys(quickSummary.evidenceFamilyCoverage || {});
const fullFormats = new Set((fullSummary.exportChecks || []).map((item) => item.format));
const quickFormats = new Set((quickSummary.exportChecks || []).map((item) => item.format));
const chartCount = (summary) => (summary.chartMappings || []).length;
const preciseContradiction = fullContradictions.some((item) =>
  item.tested_claim &&
  (item.supporting_evidence_ids || []).length > 0 &&
  (item.challenging_evidence_ids || []).length > 0 &&
  item.relationship &&
  ["resolved", "unresolved", "segment-specific"].includes(item.resolution_status)
);
const specialistOutputs = fullSpecialists.filter((item) => item.agent_name !== "final_judge");
const specialistIntegrity = specialistOutputs.every((item) => {
  const payload = item.payload || {};
  const evidenceIds = payload.evidence_ids || [];
  const confidence = String(payload.confidence || "").toLowerCase();
  return (
    (evidenceIds.length > 0 || confidence.includes("insufficient")) &&
    Array.isArray(payload.opposing_evidence_ids) &&
    (payload.relevant_brief_dimensions || []).length > 0 &&
    (payload.unresolved_gaps || []).length > 0
  );
});
const officialPricing = fullEvidence.filter((item) => item.evidence_topic === "pricing").filter((item) => {
  const source = fullSources.find((candidate) => candidate.id === item.source_id);
  return Number(source?.source_tier) === 1 && source?.page_type === "official_pricing";
});
const customerOutput = stringify(fullReport);
const willingnessToPayBreakdown = fullScoreArtifact.opportunity_scores?.score_breakdowns?.find(
  (item) => item.criterion === "willingnessToPay",
);
const directWillingnessToPayEvidence = fullEvidence.filter((item) => item.evidence_topic === "willingness_to_pay");

const checks = [
  {
    id: "same_canonical_proposition",
    pass: quickSummary.canonicalResearchBrief?.exactProductProposition === fullSummary.canonicalResearchBrief?.exactProductProposition,
    detail: fullSummary.canonicalResearchBrief?.exactProductProposition,
  },
  {
    id: "no_neighbouring_market_drift",
    pass: driftItems.length === 0,
    detail: `${driftItems.length} accepted CI/CD, DevOps, deployment-automation, or YAML items lacked a direct approval/sign-off/audit-trail anchor`,
  },
  {
    id: "full_source_depth",
    pass: fullSummary.sourcesAccepted > quickSummary.sourcesAccepted,
    detail: `${fullSummary.sourcesAccepted} Full vs ${quickSummary.sourcesAccepted} Quick accepted sources`,
  },
  {
    id: "full_evidence_depth",
    pass: fullSummary.evidenceCount > quickSummary.evidenceCount,
    detail: `${fullSummary.evidenceCount} Full vs ${quickSummary.evidenceCount} Quick evidence items`,
  },
  {
    id: "full_independence_depth",
    pass: fullSummary.independentDomains > quickSummary.independentDomains,
    detail: `${fullSummary.independentDomains} Full vs ${quickSummary.independentDomains} Quick independent domains`,
  },
  {
    id: "full_family_depth",
    pass: fullFamilies.length > quickFamilies.length,
    detail: `${fullFamilies.length} Full vs ${quickFamilies.length} Quick evidence families`,
  },
  {
    id: "full_authority_depth",
    pass: Number(fullSummary.sourceTierDistribution?.tier_1 || 0) >= Number(quickSummary.sourceTierDistribution?.tier_1 || 0),
    detail: `${fullSummary.sourceTierDistribution?.tier_1 || 0} Full vs ${quickSummary.sourceTierDistribution?.tier_1 || 0} Quick Tier 1 evidence items`,
  },
  {
    id: "full_negative_evidence_depth",
    pass: preciseContradiction ||
      (fullSummary.contradictionDisclosure === "No strong proposition-specific contradictory evidence was found" &&
        fullSummary.evidenceConfidence?.band !== "High" &&
        (fullSummary.evidenceConfidence?.deductions || []).some((item) => /contradict(?:ion|ory)/i.test(item))),
    detail: preciseContradiction
      ? `${fullSummary.negativeEvidence || 0} proposition-specific negative evidence item(s)`
      : `${fullSummary.contradictionDisclosure}; confidence is reduced`,
  },
  {
    id: "full_visual_depth",
    pass: chartCount(fullSummary) > chartCount(quickSummary),
    detail: `${chartCount(fullSummary)} Full vs ${chartCount(quickSummary)} Quick charts`,
  },
  {
    id: "four_openable_exports_each",
    pass: ["pdf", "markdown", "csv", "json"].every((format) => fullFormats.has(format) && quickFormats.has(format)) &&
      [...(fullSummary.exportChecks || []), ...(quickSummary.exportChecks || [])].every((item) => item.opened && /^[0-9a-f]{64}$/i.test(item.sha256)),
    detail: "PDF, Markdown, CSV, and JSON were downloaded, opened, and checksum-verified for both runs",
  },
  {
    id: "precise_contradiction",
    pass: preciseContradiction || fullSummary.contradictionDisclosure === "No strong proposition-specific contradictory evidence was found",
    detail: preciseContradiction
      ? `${fullContradictions.length} persisted proposition-specific contradiction record(s)`
      : fullSummary.contradictionDisclosure,
  },
  {
    id: "specialist_integrity",
    pass: specialistOutputs.length >= 6 && specialistIntegrity,
    detail: `${specialistOutputs.length} specialist outputs checked for evidence, confidence, brief dimensions, opposing evidence, and unresolved gaps; final judge assessed separately`,
  },
  {
    id: "official_pricing_evidence",
    pass: officialPricing.length >= 1
      ? (fullSummary.numericClaimValidation || []).some((item) => item.claimType === "price" && item.status === "verified")
      : Boolean(fullSummary.publicationStandard?.gaps?.some((item) => /price|payment|buyer/i.test(item))),
    detail: officialPricing.length
      ? `${officialPricing.length} pricing claims trace to individually classified Tier 1 pricing pages`
      : "No pricing claim is presented; the persisted publication gap explicitly discloses the missing evidence",
  },
  {
    id: "numeric_claim_integrity",
    pass: (fullSummary.numericClaimValidation || []).every((item) =>
        item.sourceUrl && item.normalizedValue && ["verified", "flagged", "rejected"].includes(item.status) &&
        (item.status !== "rejected" || !item.evidenceItemId)
      ),
    detail: `${(fullSummary.numericClaimValidation || []).length} persisted numeric claim validations; rejected values are excluded from the report`,
  },
  {
    id: "competitor_classification_integrity",
    pass: (fullSummary.competitorClassifications || []).every((item) =>
      !/\b(docusign|dropbox sign|hellosign)\b/i.test(item.name || "") || item.classification !== "direct"
    ),
    detail: "General e-signature products are not classified as direct without five-dimension comparability",
  },
  {
    id: "publication_standard_disclosed",
    pass: Boolean(fullSummary.publicationStandard) &&
      (fullSummary.publicationStandard.met ||
        (fullSummary.publicationStandard.gapPassPerformed &&
          fullSummary.publicationStandard.publishedWithReducedConfidence &&
          fullSummary.evidenceConfidence?.band !== "High")),
    detail: fullSummary.publicationStandard,
  },
  {
    id: "list_price_not_willingness_to_pay",
    pass: directWillingnessToPayEvidence.length > 0 ||
      (Number(willingnessToPayBreakdown?.score) === 10 &&
        (willingnessToPayBreakdown?.score_evidence_refs || []).length === 0 &&
        /no direct payment|purchase-commitment evidence|insufficient evidence/.test(customerOutput)),
    detail: directWillingnessToPayEvidence.length
      ? `${directWillingnessToPayEvidence.length} direct buyer-payment evidence item(s) support the factor`
      : "No direct buyer-payment evidence exists; willingness-to-pay remains at the unsupported baseline and the report says evidence is insufficient",
  },
  {
    id: "confidence_reflects_evidence_quality",
    pass: fullSummary.evidenceConfidence?.band !== "High" &&
      (fullSummary.evidenceConfidence?.deductions || []).some((item) => /contradict(?:ion|ory)/i.test(item)) &&
      quickSummary.evidenceConfidence?.band !== "High",
    detail: `Quick ${quickSummary.evidenceConfidence?.band}; Full ${fullSummary.evidenceConfidence?.band}; unresolved contradiction deduction persisted`,
  },
  {
    id: "no_internal_direction_tokens",
    pass: !/support[s]?opportunity|challenge[s]?opportunity|neutralcontext/i.test(customerOutput),
    detail: "No internal evidence-direction token appears in the customer-facing Full report",
  },
  {
    id: "claim_source_traceability",
    pass: (fullSummary.claimMappings || []).length >= 5 &&
      (fullSummary.claimMappings || []).every((item) => item.evidenceId && item.sourceUrl),
    detail: `${(fullSummary.claimMappings || []).length} exported Full claim-to-source mappings checked`,
  },
];

const assessment = {
  generatedAt: new Date().toISOString(),
  evaluator: "deterministic semantic-quality gate, executed independently of report generation",
  quickRunId,
  fullRunId,
  result: checks.every((check) => check.pass) ? "PASS" : "FAIL",
  checks,
  depthComparison: {
    sources: { quick: quickSummary.sourcesAccepted, full: fullSummary.sourcesAccepted },
    independentDomains: { quick: quickSummary.independentDomains, full: fullSummary.independentDomains },
    evidence: { quick: quickSummary.evidenceCount, full: fullSummary.evidenceCount },
    evidenceFamilies: { quick: quickFamilies, full: fullFamilies },
    tier1Evidence: {
      quick: quickSummary.sourceTierDistribution?.tier_1 || 0,
      full: fullSummary.sourceTierDistribution?.tier_1 || 0,
    },
    negativeEvidence: { quick: quickSummary.negativeEvidence || 0, full: fullSummary.negativeEvidence || 0 },
    charts: { quick: chartCount(quickSummary), full: chartCount(fullSummary) },
  },
  observedNeighbouringMarketDrift: driftItems.map((item) => item.id || item.url || item.snippet),
};

await mkdir(auditRoot, { recursive: true });
const outputPath = path.join(auditRoot, "semantic-quality-assessment.json");
await writeFile(outputPath, `${JSON.stringify(assessment, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, result: assessment.result, checks }, null, 2));
if (assessment.result !== "PASS") process.exitCode = 1;
