export const DECISION_PROPOSITIONS = [
  "pain_existence",
  "pain_frequency",
  "buyer_urgency",
  "budget_ownership",
  "current_spending",
  "alternative_inadequacy",
  "reachability",
  "switching_viability",
  "delivery_feasibility",
  "founder_advantage",
] as const;

export type DecisionPropositionKey = typeof DECISION_PROPOSITIONS[number];
export type EvidenceRole = "supporting" | "challenging";

export interface AtomicFinding {
  id: string;
  claim: string;
  excerpt: string;
  canonicalUrl: string;
  publishedOrUpdatedDate: string | null;
  buyerSegment: string;
  geography: string;
  role: EvidenceRole;
  limitations: string[];
  factorLinks: string[];
  propositionLinks: DecisionPropositionKey[];
  independenceKey: string;
  sourceClass: string;
  promotionalBias: "low" | "medium" | "high";
  directness: number;
  accepted: boolean;
  rejectionReason?: string;
}

export interface ResearchFunnel {
  sourcesDiscovered: number;
  sourcesReviewed: number;
  sourcesFetched: number;
  findingsAccepted: number;
  findingsRejected: number;
  independentEvidenceGroups: number;
  directOrOfficialSources: number;
  challengingFindings: number;
}

export type BurdenStatus =
  | "met"
  | "contested"
  | "unmet"
  | "insufficient_evidence";

export interface PropositionAdjudication {
  propositionKey: DecisionPropositionKey;
  supportingEvidence: string[];
  challengingEvidence: string[];
  burdenOfProofStatus: BurdenStatus;
  missingEvidence: string[];
  killCondition: string;
}

export interface AdversarialInvestigation {
  prosecution: {
    strongestSupportedCase: string[];
    evidenceIds: string[];
  };
  defense: {
    strongestSupportedCaseAgainst: string[];
    evidenceIds: string[];
  };
  adjudication: {
    propositions: PropositionAdjudication[];
    unresolvedDisputes: DecisionPropositionKey[];
    providerState: "available" | "unavailable";
    secondOpinionDisagreements: DecisionPropositionKey[];
    officialScoreOwner: "code";
  };
  strongestKillCondition: string;
  funnel: ResearchFunnel;
}

export function buildAtomicExtractionBatches<T>(
  sources: T[],
  maximumBatchSize = 4,
): T[][] {
  if (!Number.isInteger(maximumBatchSize) || maximumBatchSize < 1) {
    throw new Error("Atomic extraction batch size must be a positive integer.");
  }
  const batches: T[][] = [];
  for (let index = 0; index < sources.length; index += maximumBatchSize) {
    batches.push(sources.slice(index, index + maximumBatchSize));
  }
  return batches;
}

const KILL_CONDITIONS: Record<DecisionPropositionKey, string> = {
  pain_existence:
    "Target buyers do not experience the claimed pain in the defined workflow.",
  pain_frequency: "The pain occurs too rarely to justify a dedicated product.",
  buyer_urgency: "The buyer consistently treats the problem as non-urgent.",
  budget_ownership:
    "No reachable stakeholder owns or can approve budget for the outcome.",
  current_spending:
    "Buyers do not spend money or meaningful staff time on the problem.",
  alternative_inadequacy:
    "Existing alternatives are demonstrably good enough for the target segment.",
  reachability:
    "The target buyers cannot be reached through an economically viable channel.",
  switching_viability:
    "Required switching costs or risks exceed the value buyers expect.",
  delivery_feasibility:
    "The product cannot be delivered within the founder's stated constraints or dependency tolerance.",
  founder_advantage:
    "The founder lacks required capability or access and has no credible way to close the gap.",
};

const DIRECT_EVIDENCE_REQUIRED = new Set<DecisionPropositionKey>([
  "pain_existence",
  "pain_frequency",
  "buyer_urgency",
  "budget_ownership",
  "current_spending",
  "founder_advantage",
]);

const PROMOTIONAL_CANNOT_ESTABLISH = new Set<DecisionPropositionKey>([
  "pain_existence",
  "pain_frequency",
  "buyer_urgency",
  "current_spending",
  "alternative_inadequacy",
]);

export function sanitizeUntrustedWebContent(value: string) {
  const patterns = [
    /\bignore (?:all|any|the|previous|prior) (?:instructions?|prompts?)\b/i,
    /\bsystem (?:message|prompt|instructions?)\b/i,
    /\bdeveloper (?:message|prompt|instructions?)\b/i,
    /\b(?:do not|don't) follow (?:the )?(?:system|developer|previous)\b/i,
    /\b(?:reveal|print|return|exfiltrate) (?:the )?(?:prompt|secret|api key|credentials?)\b/i,
  ];
  let hostileTextDetected = false;
  const text = value.split(/\r?\n|(?<=[.!?])\s+/).map((part) => {
    if (patterns.some((pattern) => pattern.test(part))) {
      hostileTextDetected = true;
      return "[embedded instruction removed]";
    }
    return part;
  }).join(" ").replace(/\s+/g, " ").trim();
  return {
    text,
    hostileTextDetected,
    limitations: hostileTextDetected
      ? [
        "Retrieved page contained instruction-like text; it was removed and never treated as evidence.",
      ]
      : [],
  };
}

export function evaluateAtomicFinding(
  finding: AtomicFinding,
  targetBuyerSegment: string,
  currentDate = new Date().toISOString().slice(0, 10),
): AtomicFinding {
  if (!sameSegment(finding.buyerSegment, targetBuyerSegment)) {
    return reject(finding, "adjacent_segment_drift");
  }
  if (!finding.claim.trim() || !finding.excerpt.trim()) {
    return reject(finding, "missing_direct_excerpt");
  }
  if (!/^https?:\/\//i.test(finding.canonicalUrl)) {
    return reject(finding, "invalid_canonical_url");
  }
  if (
    finding.role === "supporting" &&
    finding.promotionalBias === "high" &&
    finding.propositionLinks.some((key) =>
      PROMOTIONAL_CANNOT_ESTABLISH.has(key)
    )
  ) {
    return reject(finding, "promotional_claim_cannot_establish");
  }
  if (
    finding.propositionLinks.includes("current_spending") &&
    finding.publishedOrUpdatedDate &&
    ageDays(finding.publishedOrUpdatedDate, currentDate) > 365
  ) {
    return reject(finding, "stale_pricing");
  }
  return { ...finding, accepted: true, rejectionReason: undefined };
}

export function adjudicateInvestigation(input: {
  findings: AtomicFinding[];
  targetBuyerSegment: string;
  sourcesDiscovered: number;
  sourcesReviewed: number;
  sourcesFetched: number;
  providerState?: "available" | "unavailable";
  secondOpinion?: Partial<Record<DecisionPropositionKey, BurdenStatus>>;
  currentDate?: string;
  preExtractionRejectedFindings?: number;
}): AdversarialInvestigation {
  const reviewed = input.findings.map((finding) =>
    evaluateAtomicFinding(
      finding,
      input.targetBuyerSegment,
      input.currentDate,
    )
  );
  const accepted = reviewed.filter((finding) => finding.accepted);
  const uniqueAccepted = uniqueBy(
    accepted,
    (finding) =>
      `${finding.independenceKey}:${finding.role}:${
        finding.propositionLinks.join(",")
      }`,
  );
  const propositions = DECISION_PROPOSITIONS.map((propositionKey) => {
    const relevant = uniqueAccepted.filter((finding) =>
      finding.propositionLinks.includes(propositionKey)
    );
    const supporting = relevant.filter((finding) =>
      finding.role === "supporting"
    );
    const challenging = relevant.filter((finding) =>
      finding.role === "challenging"
    );
    const directSupport = supporting.some((finding) =>
      finding.directness >= 0.7 ||
      ["primary", "official", "community"].includes(finding.sourceClass)
    );
    const missingEvidence: string[] = [];
    if (!supporting.length) missingEvidence.push("supporting evidence");
    if (!challenging.length) missingEvidence.push("challenging evidence");
    if (DIRECT_EVIDENCE_REQUIRED.has(propositionKey) && !directSupport) {
      missingEvidence.push(
        "direct evidence from the defined buyer or official decision owner",
      );
    }
    const burdenOfProofStatus: BurdenStatus = challenging.length &&
        supporting.length
      ? "contested"
      : challenging.length
      ? "unmet"
      : supporting.length &&
          (!DIRECT_EVIDENCE_REQUIRED.has(propositionKey) || directSupport)
      ? "met"
      : "insufficient_evidence";
    return {
      propositionKey,
      supportingEvidence: supporting.map((finding) => finding.id),
      challengingEvidence: challenging.map((finding) => finding.id),
      burdenOfProofStatus,
      missingEvidence,
      killCondition: KILL_CONDITIONS[propositionKey],
    };
  });
  const secondOpinionDisagreements = propositions.filter((proposition) => {
    const opinion = input.secondOpinion?.[proposition.propositionKey];
    return opinion && opinion !== proposition.burdenOfProofStatus;
  }).map((proposition) => proposition.propositionKey);
  const prosecution = uniqueAccepted.filter((finding) =>
    finding.role === "supporting"
  );
  const defense = uniqueAccepted.filter((finding) =>
    finding.role === "challenging"
  );
  const kill =
    propositions.find((proposition) =>
      proposition.burdenOfProofStatus === "unmet"
    ) ||
    propositions.find((proposition) =>
      proposition.burdenOfProofStatus === "contested"
    ) ||
    propositions.find((proposition) =>
      proposition.burdenOfProofStatus === "insufficient_evidence"
    ) || propositions[0];

  return {
    prosecution: {
      strongestSupportedCase: prosecution.slice(0, 5).map((finding) =>
        finding.claim
      ),
      evidenceIds: prosecution.slice(0, 5).map((finding) => finding.id),
    },
    defense: {
      strongestSupportedCaseAgainst: defense.slice(0, 5).map((finding) =>
        finding.claim
      ),
      evidenceIds: defense.slice(0, 5).map((finding) => finding.id),
    },
    adjudication: {
      propositions,
      unresolvedDisputes: propositions.filter((proposition) =>
        ["contested", "insufficient_evidence"].includes(
          proposition.burdenOfProofStatus,
        )
      ).map((proposition) => proposition.propositionKey),
      providerState: input.providerState || "available",
      secondOpinionDisagreements,
      officialScoreOwner: "code",
    },
    strongestKillCondition: kill.killCondition,
    funnel: researchFunnel({
      sourcesDiscovered: input.sourcesDiscovered,
      sourcesReviewed: input.sourcesReviewed,
      sourcesFetched: input.sourcesFetched,
      findings: reviewed,
      additionalRejectedFindings: input.preExtractionRejectedFindings || 0,
    }),
  };
}

export function researchFunnel(input: {
  sourcesDiscovered: number;
  sourcesReviewed: number;
  sourcesFetched: number;
  findings: AtomicFinding[];
  additionalRejectedFindings?: number;
}): ResearchFunnel {
  const accepted = input.findings.filter((finding) => finding.accepted);
  return {
    sourcesDiscovered: input.sourcesDiscovered,
    sourcesReviewed: input.sourcesReviewed,
    sourcesFetched: input.sourcesFetched,
    findingsAccepted: accepted.length,
    findingsRejected: input.findings.length - accepted.length +
      Number(input.additionalRejectedFindings || 0),
    independentEvidenceGroups:
      new Set(accepted.map((finding) => finding.independenceKey)).size,
    directOrOfficialSources: new Set(
      accepted.filter((finding) =>
        finding.directness >= 0.7 ||
        ["primary", "official"].includes(finding.sourceClass)
      ).map((finding) => finding.canonicalUrl),
    ).size,
    challengingFindings:
      accepted.filter((finding) => finding.role === "challenging").length,
  };
}

function reject(
  finding: AtomicFinding,
  rejectionReason: string,
): AtomicFinding {
  return { ...finding, accepted: false, rejectionReason };
}

function sameSegment(left: string, right: string) {
  return normalize(left) === normalize(right);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function ageDays(from: string, to: string) {
  return Math.max(
    0,
    (Date.parse(to) - Date.parse(from)) / (24 * 60 * 60 * 1000),
  );
}

function uniqueBy<T>(values: T[], key: (value: T) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const fingerprint = key(value);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
