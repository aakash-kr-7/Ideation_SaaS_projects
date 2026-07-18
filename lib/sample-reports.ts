// Frozen public fixtures only. Authenticated report routes never import this module.
import { calculateConfidenceScore, calculateWeightedScore, defaultWeights, getVerdictFromScore } from "./scoring";
import { validationReportSchema, type ValidationReport } from "./report-schema";
import type { CriterionEvidence, CriterionNotes, CriterionScores, EvidenceItem, OpportunityScorecard } from "./types";

const generatedAt = "2026-07-18T00:00:00.000Z";
const idea = {
  id: "sample-whatsapp-appointments",
  name: "WhatsApp Appointment Assistant",
  oneLiner: "A WhatsApp-based appointment reminder and follow-up assistant for independent salons and small clinics that reduces no-shows, confirms bookings, automatically fills cancelled slots, and requests customer reviews.",
  targetCustomer: "Independent salons and small clinics",
  corePain: "Missed appointments and late cancellations leave bookable time unused while confirmations, waitlists, and review follow-up remain manual.",
  market: "Local Business",
};

const evidence: EvidenceItem[] = [
  { id: "10000000-0000-4000-8000-000000000001", source: "Systematic review (PMC)", sourceType: "Peer-reviewed systematic review", title: "Text reminders improve clinic attendance", snippet: "A systematic review found consistent evidence that reminder systems improve attendance, while also noting that reminder systems are not optimally deployed.", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4831598/", signal: "Pain", strength: "High", date: "2016-04-20", evidenceFamily: "problem", researchPass: 1, sourceTier: 1, sourceTierReason: "Peer-reviewed synthesis of reminder interventions", disconfirming: false },
  { id: "10000000-0000-4000-8000-000000000002", source: "Square Appointments", sourceType: "Official product documentation", title: "Established appointment tools already automate reminders", snippet: "Square supports automated confirmation requests and text or email reminders, showing both a validated workflow and meaningful incumbent coverage.", url: "https://squareup.com/help/us/en/article/6729-customer-confirmations-with-square-appointments", signal: "Demand", strength: "High", date: "2026-07-18", evidenceFamily: "solution", researchPass: 1, sourceTier: 2, sourceTierReason: "First-party documentation for an incumbent workflow", disconfirming: true },
  { id: "10000000-0000-4000-8000-000000000003", source: "Fresha", sourceType: "Official product documentation", title: "No-show protection is already monetized by incumbents", snippet: "Fresha lets businesses apply no-show and late-cancellation fees, indicating buyer attention to the problem while raising the bar for a standalone entrant.", url: "https://www.fresha.com/help-center/knowledge-base/payments/617-charge-no-show-and-cancellation-fees", signal: "Pricing", strength: "High", date: "2026-07-18", evidenceFamily: "solution", researchPass: 3, sourceTier: 2, sourceTierReason: "First-party documentation of an incumbent paid workflow", disconfirming: true },
  { id: "10000000-0000-4000-8000-000000000004", source: "Digital notification meta-analysis (PMC)", sourceType: "Peer-reviewed meta-analysis", title: "Digital notifications reduce missed clinic appointments", snippet: "The review reports that text notifications improve attendance and reduce no-shows across healthcare settings, supporting the underlying intervention rather than this specific product.", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5093388/", signal: "Demand", strength: "High", date: "2016-10-24", evidenceFamily: "problem", researchPass: 2, sourceTier: 1, sourceTierReason: "Peer-reviewed meta-analysis", disconfirming: false },
  { id: "10000000-0000-4000-8000-000000000005", source: "Fresha", sourceType: "Official product documentation", title: "Automated customer messages are a bundled feature", snippet: "Fresha includes configurable automated client messages, so salons may prefer an existing booking suite over another standalone tool.", url: "https://www.fresha.com/help-center/knowledge-base/marketing/125-automated-messages-overview", signal: "Risk", strength: "High", date: "2026-07-18", evidenceFamily: "solution", researchPass: 3, sourceTier: 2, sourceTierReason: "First-party incumbent documentation", disconfirming: true },
  { id: "10000000-0000-4000-8000-000000000006", source: "Meta for Developers", sourceType: "Official platform documentation", title: "WhatsApp messaging depends on approved templates and platform rules", snippet: "Business-initiated WhatsApp messaging relies on message templates and platform controls, creating policy, approval, and delivery dependencies for the proposed workflow.", url: "https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates/", signal: "Risk", strength: "High", date: "2026-07-18", evidenceFamily: "solution", researchPass: 3, sourceTier: 2, sourceTierReason: "Official platform documentation", disconfirming: true },
];

const scores: CriterionScores = {
  painSeverity: 78, purchaseUrgency: 68, willingnessToPay: 58, buyerReachability: 76,
  mvpSpeed: 73, competitionGap: 46, retentionPotential: 79, platformDependencyRisk: 72,
  regulatoryRisk: 48, founderFit: 50, distributionClarity: 69, speedToFirstRevenue: 64,
};
const notes: CriterionNotes = {
  painSeverity: "Peer-reviewed evidence supports missed appointments as a persistent operational problem.",
  purchaseUrgency: "The pain affects perishable appointment capacity, but urgency varies by operator and existing workflow.",
  willingnessToPay: "Incumbents monetize protection and automation, but no direct willingness-to-pay amount for this standalone product was verified.",
  buyerReachability: "Independent salons and clinics are identifiable locally and through trade communities.",
  mvpSpeed: "A narrow confirmation and cancellation workflow is feasible without replacing the booking system.",
  competitionGap: "Square and Fresha already cover reminders and no-show controls; the wedge must be interoperability and WhatsApp execution.",
  retentionPotential: "Appointments, confirmations, cancellations, and follow-ups recur continuously.",
  platformDependencyRisk: "The product depends materially on WhatsApp templates, policies, approvals, and delivery behavior.",
  regulatoryRisk: "Clinic use introduces consent, sensitive-data, and jurisdiction-specific privacy considerations.",
  founderFit: "No founder-specific distribution or domain advantage was supplied in the sample brief.",
  distributionClarity: "A narrow local-business segment supports direct outreach, partnerships, and concierge pilots.",
  speedToFirstRevenue: "A manually assisted pilot can test value before broad integrations are built.",
};
const fullRefs: CriterionEvidence = {
  painSeverity: [evidence[0].id, evidence[3].id], purchaseUrgency: [evidence[0].id], willingnessToPay: [evidence[2].id],
  buyerReachability: [evidence[1].id, evidence[4].id], mvpSpeed: [evidence[5].id], competitionGap: [evidence[1].id, evidence[4].id],
  retentionPotential: [evidence[0].id, evidence[3].id], platformDependencyRisk: [evidence[5].id], regulatoryRisk: [evidence[5].id],
  founderFit: [], distributionClarity: [evidence[1].id, evidence[4].id], speedToFirstRevenue: [evidence[2].id],
};

function scorecard(refs: CriterionEvidence): OpportunityScorecard {
  const total = calculateWeightedScore(scores, defaultWeights);
  const base = { scores, notes, evidenceRefs: refs, weights: defaultWeights, total, confidence: 0, verdict: getVerdictFromScore(total), deterministicVerdict: getVerdictFromScore(total), decisionStatus: "Passed" as const };
  return { ...base, confidence: calculateConfidenceScore(base) };
}

const competitors = [
  { id: "square", name: "Square Appointments", positioning: "Booking and business-management suite", pricing: "Pricing exists; no amount used in this frozen fixture", target: "Service businesses", strength: "Native booking, reminders, and payments", gap: "A focused cross-booking-system WhatsApp workflow may be simpler for some operators" },
  { id: "fresha", name: "Fresha", positioning: "Beauty and wellness marketplace and booking platform", pricing: "Pricing exists; no amount used in this frozen fixture", target: "Salons and wellness businesses", strength: "Automated messages and no-show protection are already bundled", gap: "The proposed wedge depends on operators who will not migrate booking systems" },
];
const risks = [
  { id: "platform", category: "Platform" as const, severity: "High" as const, description: "WhatsApp template approvals, policies, and delivery behavior are outside the product's control.", mitigation: "Design a consent-aware template library and maintain a fallback notification channel." },
  { id: "competition", category: "Market" as const, severity: "High" as const, description: "Booking suites already bundle reminders, automated messages, and no-show controls.", mitigation: "Validate a narrow interoperability wedge with businesses unwilling to migrate their booking system." },
  { id: "privacy", category: "Regulatory" as const, severity: "Medium" as const, description: "Clinic workflows may expose sensitive appointment context and consent obligations.", mitigation: "Avoid clinical detail in messages, minimize stored data, and obtain jurisdiction-specific privacy review." },
];

function buildReport(mode: "quick_scan" | "full_validation"): ValidationReport {
  const full = mode === "full_validation";
  const usedEvidence = full ? evidence : evidence.slice(0, 3);
  const card = scorecard(full ? fullRefs : {
    painSeverity: [evidence[0].id], purchaseUrgency: [evidence[0].id], willingnessToPay: [evidence[2].id],
    buyerReachability: [evidence[1].id], competitionGap: [evidence[1].id], retentionPotential: [evidence[0].id], platformDependencyRisk: [], regulatoryRisk: [], founderFit: [], distributionClarity: [], speedToFirstRevenue: [evidence[2].id], mvpSpeed: [],
  });
  const topRecommendation = "Validate a narrow WhatsApp confirmation-and-cancellation pilot with one operator segment before building booking-system breadth.";
  return validationReportSchema.parse({
    id: `sample-${mode}-v1`, version: "1.0", reportMode: mode, generatedAt,
    executiveSummary: full
      ? "The problem and reminder intervention are well supported, but incumbent booking suites and WhatsApp dependency weaken the standalone case. Validate an interoperability wedge with one segment before committing to a full product."
      : "The idea shows enough real problem evidence to justify deeper validation, but incumbent coverage and platform dependency make the initial wedge uncertain.",
    methodology: `Frozen sample assembled with the production report schema and deterministic 12-factor scoring engine. ${full ? "Six" : "Three"} cited sources were used; the figures are illustrative of this frozen report, not live market data.`,
    topRecommendation, strongestPositiveEvidenceId: evidence[0].id, strongestNegativeEvidenceId: evidence[1].id,
    evidenceGaps: ["No direct paid-pilot evidence for the proposed standalone product", "No verified segment-specific willingness-to-pay amount", "No founder-specific distribution advantage supplied"],
    limitations: [full ? "The evidence supports appointment reminders generally, not the proposed WhatsApp product in every market." : "Quick Scan is a rapid screen and is not exhaustive.", "No verifiable market-size figure was used in this report."],
    reportSections: full ? ["executive", "evidence", "demand", "competition", "market", "pricing", "mvp", "gtm", "risks", "adversarial", "score", "sources", "exports"] : ["executive", "evidence", "competition", "pricing", "risks", "score", "sources"],
    availableExports: full ? ["pdf", "markdown", "csv", "json"] : ["pdf"],
    marketSizing: { TAM: null, SAM: null, SOM: null, MarketSize: null, reason: "No verifiable market-size figure was used in this report." },
    retrieval: { frozenFixture: true, sourcesAnalyzed: usedEvidence.length, independentlyAddressableSources: usedEvidence.length, researchPasses: full ? 3 : 2 },
    citationValidation: { valid: true, claimsChecked: full ? 12 : 6, claimsRemoved: 0, invalidClaims: [] },
    adversarialGate: { outcome: "StrongObjection", severity: "High", objection: "Incumbent booking suites already bundle much of the proposed value, while WhatsApp creates a material platform dependency.", evidence_ids: [evidence[1].id, evidence[4].id, evidence[5].id].filter(id => usedEvidence.some(item => item.id === id)), unresolved: true },
    decisionIntegrity: { deterministicVerdict: card.verdict, effectiveVerdict: card.verdict, finalJudgeWrittenVerdict: card.verdict, finalJudgeScoreMismatch: false, finalJudgeEffectiveMismatch: false, adversarialDowngrade: false, reason: null },
    specialistDisputes: full ? [{ specialist: "demand", specialistDirection: "SupportsOpportunity", checkerDirection: "Mixed", disputed: true, reason: "Reminder efficacy is supported, but direct demand for a standalone WhatsApp product is unproven." }] : [],
    reasoningFlags: full ? [{ type: "AdversarialObjection", severity: "Warning", message: "Incumbent bundling and platform dependence remain unresolved.", evidenceIds: [evidence[1].id, evidence[4].id, evidence[5].id] }] : [],
    specialistSections: full ? {
      demand: "Reminder interventions have credible support, but direct demand for this packaging still requires interviews and a paid pilot.",
      market: "No verifiable market-size figure was used. Start with a reachable segment instead of a top-down market claim.",
      competition: "Square and Fresha validate the workflow while making a generic reminder product difficult to defend.",
      pricing: "Use a paid concierge pilot to discover value and purchasing behavior; no unsupported price point is asserted.",
      risk: "Platform dependency, incumbent bundling, and privacy obligations are the principal constraints.",
      gtm: "Recruit ten operators from one segment, run a manual-assisted pilot, and measure confirmations and reclaimed slots.",
    } : undefined,
    opportunity: {
      ...idea, createdAt: generatedAt, scorecard: card, evidence: usedEvidence, competitors: full ? competitors : competitors.slice(0, 2), risks,
      currentWorkaround: "Booking-suite reminders, manual calls or messages, cancellation policies, and staff-managed waitlists.",
      whyUsersPay: "A buyer may pay when recovered appointment capacity and reduced staff follow-up are measurable; this must be proven in a paid pilot.",
      pricing: { model: "Paid concierge pilot, then subscription if value is proven", pricePoint: "Amount not asserted; validate with buyers", rationale: "No verified willingness-to-pay amount exists in the fixture, so the first price must be discovered through a paid pilot.", firstOffer: "One-segment assisted pilot with a pre-agreed success metric", targetCustomers: 5 },
      mvp: { outcome: "Confirm bookings and expose cancellations early enough for staff to refill slots.", scope: ["Consent-aware WhatsApp confirmation", "Cancellation response handling", "Staff waitlist alert", "Delivery and response audit trail"], exclusions: ["Booking-system replacement", "Clinical messaging", "AI sales agent", "Broad CRM"], buildEstimate: "Validate operationally before committing to an estimate", buildComplexity: "Medium" },
      launch: { firstCustomerChannel: "Direct outreach to one local operator segment", weekOne: ["Interview five operators using the same booking workflow", "Map consent and cancellation handling", "Offer a paid assisted pilot"], outreachMessage: "I am studying how appointment businesses handle confirmations and cancelled slots. Could you walk me through the last three missed or late-cancelled bookings?", successMetric: "At least two operators commit to a paid pilot with a measurable reclaimed-slot or staff-time outcome.", firstTenStrategy: ["Choose salons or small clinics, not both", "Recruit ten operators from one city or trade group", "Run the workflow manually before integrating", "Measure confirmations, early cancellations, and refill attempts", "Expand only if operators renew"] },
      technicalStack: full ? ["Existing web application", "Supabase/Postgres", "Queued worker", "WhatsApp Business Platform"] : undefined,
      apiDependencies: full ? ["WhatsApp Business Platform", "Booking-system calendars or exports"] : undefined,
      notToBuildFirst: ["Booking-system replacement", "Clinical messaging", "Generic CRM", "Autonomous upselling"],
    },
  }) as unknown as ValidationReport;
}

export const sampleQuickScan = buildReport("quick_scan");
export const sampleFullValidation = buildReport("full_validation");
export const validationReports: ValidationReport[] = [sampleQuickScan, sampleFullValidation];
