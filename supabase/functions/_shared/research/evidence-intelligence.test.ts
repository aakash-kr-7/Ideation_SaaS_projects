import { clusterEvidence, evidenceConfidence, normalizeBillingPeriod, normalizeCurrency, normalizeEntity, reportCompleteness, semanticPublicationQuality } from "./evidence-intelligence.ts";
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
const evidence = [
  { id: "a", source_id: "s1", source_domain: "a.test", source_tier: 1, signal_type: "Pain", snippet: "Operators spend 4 hours manually reconciling claims.", pain_point: "manual claim reconciliation", created_at: "2026-01-01" },
  { id: "b", source_id: "s2", source_domain: "b.test", source_tier: 2, signal_type: "Pain", snippet: "Manual claim reconciliation takes hours.", pain_point: "manual claim reconciliation", created_at: "2026-02-01" },
  { id: "c", source_id: "s3", source_domain: "c.test", source_tier: 2, signal_type: "Pain", snippet: "Existing spreadsheets are good enough.", pain_point: "manual claim reconciliation", disconfirming: true, created_at: "2026-03-01" },
];
Deno.test("normalizes deterministic fields", () => { assert(normalizeCurrency("$49/month")?.currency === "USD", "currency"); assert(normalizeBillingPeriod("billed annually") === "year", "period"); assert(normalizeEntity("Acme Inc.") === "acme", "entity"); });
Deno.test("clusters claims without deleting contradiction", () => { const clusters = clusterEvidence(evidence); assert(clusters.length === 1, "one cluster"); assert(clusters[0].supportingEvidenceIds.length === 2 && clusters[0].contradictingEvidenceIds.length === 1, "preserves both directions"); assert(clusters[0].unresolvedDisagreement, "marks disagreement"); });
Deno.test("confidence is evidence-bound and deductions cap sparse contradictory dossiers", () => { const clusters = clusterEvidence(evidence); const confidence = evidenceConfidence(evidence, clusters); assert(confidence.band === "Insufficient", "sparse contradictory evidence must be insufficient"); assert(confidence.deductions.some((reason) => reason.includes("Fewer than four")), "sparse-evidence deduction missing"); });
Deno.test("report completeness refuses unsupported reports", () => { const check = reportCompleteness("quick_scan", { evidenceCount: 0, confidenceBand: "Insufficient", hasPositive: false, hasNegative: false, hasPricing: false, hasCompetitor: false, citationsValid: false }); assert(!check.complete && check.missing.includes("valid citations"), "incomplete"); });
Deno.test("Quick Scan cannot publish with incomplete coverage", () => { const check = reportCompleteness("quick_scan", { evidenceCount: 2, confidenceBand: "Moderate", hasPositive: true, hasNegative: false, hasPricing: true, hasCompetitor: true, citationsValid: true }); assert(!check.complete && check.missing.includes("contradictory evidence"), "quick scan requires a complete, cited evidence set"); });
Deno.test("Full Validation cannot publish with incomplete coverage", () => { const check = reportCompleteness("full_validation", { evidenceCount: 4, confidenceBand: "Moderate", hasPositive: true, hasNegative: true, hasPricing: false, hasCompetitor: true, citationsValid: true }); assert(!check.complete && check.missing.includes("pricing or willingness-to-pay evidence"), "full validation blocks incomplete coverage"); });
Deno.test("six of eleven families without payment or contradiction cannot be High confidence", () => {
  const families = ["customer_pain", "behavior_demand", "segments", "alternatives", "competitors", "pricing"];
  const dossier = Array.from({ length: 12 }, (_, index) => ({
    id: `e${index}`,
    source_id: `s${index}`,
    source_domain: `domain-${index}.test`,
    source_tier: index < 2 ? 1 : 2,
    signal_type: index % 2 ? "Demand" : "Pain",
    snippet: "Client approval workflow evidence with attributable history.",
    evidence_topic: families[index % families.length],
    relevance_score: 0.9,
    relevance_class: "directly_relevant",
    matched_brief_dimensions: ["target_buyer", "workflow"],
    acceptance_decision: "accepted_core",
    verified: true,
    relevant_excerpt: "Client approval workflow evidence with attributable history.",
  }));
  const confidence = evidenceConfidence(dossier);
  assert(confidence.band !== "High", "incomplete dossier received High confidence");
  assert(confidence.deductions.some((reason) => reason.includes("6/11")), "family deduction missing");
  assert(confidence.deductions.some((reason) => reason.includes("buyer-payment")), "payment deduction missing");
  assert(confidence.deductions.some((reason) => reason.includes("proposition-specific")), "contradiction deduction missing");
});
Deno.test("semantic publication quality records gaps without converting weak research into technical failure", () => {
  const quality = semanticPublicationQuality({
    mode: "full_validation",
    evidence,
    competitors: [{ classification: "adjacent", evidence_ids: ["a"] }],
    contradictions: [],
    specialists: [],
    charts: [],
    numericValidations: [],
  });
  assert(!quality.met && quality.publishedWithReducedConfidence, "weak technical success was not publishable with reduced confidence");
  assert(quality.gapPassPerformed, "bounded gap pass was not recorded");
  assert(quality.gaps.includes("No strong proposition-specific contradictory evidence was found"), "honest contradiction gap missing");
});
