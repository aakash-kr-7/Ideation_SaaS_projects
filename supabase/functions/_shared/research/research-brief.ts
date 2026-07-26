export const BRIEF_DIMENSIONS = [
  "target_buyer",
  "user_workflow",
  "problem",
  "proposed_solution",
  "expected_outcome",
  "market_category",
] as const;

export type BriefDimension = typeof BRIEF_DIMENSIONS[number];
export type RelevanceClass = "directly_relevant" | "contextually_relevant" | "adjacent" | "out_of_scope";

export interface CanonicalResearchBrief {
  exactProductProposition: string;
  targetBuyer: string;
  endUser: string;
  workflowChanged: string;
  problemSolved: string;
  expectedOutcome: string;
  industry: string;
  geography: string;
  businessModel: string;
  directCompetitorCategory: string;
  adjacentOutOfScopeCategories: string[];
  terminology: string[];
  dimensionKeywords: Record<BriefDimension, string[]>;
}

export interface RelevanceAssessment {
  score: number;
  classification: RelevanceClass;
  matchedDimensions: BriefDimension[];
  mismatchReasons: string[];
  acceptanceDecision: "accepted_core" | "quarantined_context" | "rejected";
  deterministicChecks: string[];
}

export interface PageAuthority {
  sourceTier: 1 | 2 | 3 | 4;
  pageType: "official_pricing" | "official_documentation" | "official_product" | "case_study" | "buyer_review" | "community_discussion" | "regulatory" | "market_research" | "secondary_article" | "search_or_directory";
  authorityScore: number;
  directnessScore: number;
  promotionalBias: "low" | "medium" | "high";
  reason: string;
}

const STOP = new Set([
  "about", "after", "also", "being", "business", "could", "every", "from", "into", "need", "product",
  "service", "software", "that", "their", "they", "this", "using", "with", "workflow", "would",
]);

const APPROVAL_TERMS = [
  "approval", "approvals", "approve", "sign-off", "signoff", "customer sign-off", "client sign-off",
  "customer approval", "client approval", "acceptance", "proofing", "review and approval",
];
const AUDIT_TERMS = [
  "audit trail", "approval history", "attributable", "approver identity", "timestamped approval",
  "approval record", "record of approval", "who approved", "signed acceptance",
];
const BUYER_WORKFLOW_TERMS = [
  "service team", "agency", "professional services", "consultancy", "client", "customer", "deliverable",
  "project manager", "account manager", "operations lead", "customer success",
];
const OUTCOME_TERMS = ["reduce disputes", "avoid disputes", "proof", "accountability", "faster approval", "preserve history"];
const DEVOPS_TERMS = [
  "ci/cd", "continuous integration", "continuous delivery", "deployment automation", "deployment pipeline",
  "yaml pipeline", "devops pipeline", "build pipeline", "release pipeline", "github actions", "azure pipelines",
];

export function buildCanonicalResearchBrief(run: {
  idea_name?: string;
  idea_description?: string;
  target_customer?: string;
  market_type?: string;
  target_region?: string;
  assumptions?: Record<string, unknown> | null;
}): CanonicalResearchBrief {
  const proposition = clean(run.idea_description) || clean(run.idea_name);
  const targetCustomer = clean(run.target_customer) || "The buyer named in the submitted idea";
  const assumptions = run.assumptions && typeof run.assumptions === "object" ? run.assumptions : {};
  const isApprovalAudit = hasAny(normalize(`${run.idea_name || ""} ${proposition}`), [...APPROVAL_TERMS, ...AUDIT_TERMS]);
  const targetBuyer = clean(String(assumptions.buyer || "")) || targetCustomer;
  const endUser = clean(String(assumptions.endUser || assumptions.end_user || "")) || targetCustomer;
  const workflowChanged = clean(String(assumptions.workflow || assumptions.workflowChanged || ""))
    || (isApprovalAudit
      ? "Requesting, collecting, recording, and retrieving customer approval or sign-off on service deliverables"
      : proposition);
  const problemSolved = clean(String(assumptions.problem || assumptions.problemSolved || ""))
    || (isApprovalAudit
      ? "Customer approvals are scattered or ambiguous, leaving service teams without attributable proof and exposed to disputes"
      : proposition);
  const expectedOutcome = clean(String(assumptions.expectedOutcome || assumptions.outcome || ""))
    || (isApprovalAudit
      ? "Faster customer sign-off, preserved attributable approval history, and fewer delivery or billing disputes"
      : `A measurable improvement in ${workflowChanged.toLowerCase()}`);
  const businessModel = clean(String(assumptions.businessModel || assumptions.priceHypothesis || ""))
    || clean(run.market_type) || "Unspecified";
  const directCompetitorCategory = clean(String(assumptions.directCompetitorCategory || ""))
    || (isApprovalAudit ? "Client approval, online proofing, and customer sign-off audit-trail software" : `${clean(run.market_type) || "Software"} alternatives serving the same buyer workflow`);
  const adjacentOutOfScopeCategories = unique([
    ...(Array.isArray(assumptions.adjacentOutOfScopeCategories) ? assumptions.adjacentOutOfScopeCategories.map(String) : []),
    ...(isApprovalAudit ? [
      "CI/CD pipelines",
      "deployment automation",
      "YAML pipelines",
      "generic DevOps workflows",
      "internal code-review approvals without customer sign-off",
      "general e-signature without the specified service-delivery approval workflow",
    ] : []),
  ]);
  const terminology = unique([
    ...terms(proposition),
    ...terms(targetCustomer),
    ...(isApprovalAudit ? [...APPROVAL_TERMS, ...AUDIT_TERMS, ...BUYER_WORKFLOW_TERMS, ...OUTCOME_TERMS] : []),
    ...(Array.isArray(assumptions.terminology) ? assumptions.terminology.map(String) : []),
  ]).slice(0, 48);

  const brief: CanonicalResearchBrief = {
    exactProductProposition: proposition,
    targetBuyer,
    endUser,
    workflowChanged,
    problemSolved,
    expectedOutcome,
    industry: clean(String(assumptions.industry || "")) || inferIndustry(targetCustomer, proposition, run.market_type),
    geography: clean(run.target_region) || "Not specified",
    businessModel,
    directCompetitorCategory,
    adjacentOutOfScopeCategories,
    terminology,
    dimensionKeywords: {
      target_buyer: unique([...terms(targetBuyer), ...terms(endUser), ...(isApprovalAudit ? BUYER_WORKFLOW_TERMS : [])]),
      user_workflow: unique([...terms(workflowChanged), ...(isApprovalAudit ? [...APPROVAL_TERMS, ...AUDIT_TERMS] : [])]),
      problem: unique([...terms(problemSolved), ...(isApprovalAudit ? ["scattered approval", "ambiguous approval", "dispute", "lost approval", "approval delay"] : [])]),
      proposed_solution: unique([...terms(proposition), ...(isApprovalAudit ? [...APPROVAL_TERMS, ...AUDIT_TERMS] : [])]),
      expected_outcome: unique([...terms(expectedOutcome), ...(isApprovalAudit ? OUTCOME_TERMS : [])]),
      market_category: unique([...terms(directCompetitorCategory), ...(isApprovalAudit ? ["online proofing", "client approval", "customer sign-off", "approval workflow"] : [])]),
    },
  };
  return brief;
}

export function assessSemanticRelevance(
  brief: CanonicalResearchBrief,
  value: string,
  queryFamily = "",
): RelevanceAssessment {
  const text = normalize(value);
  const matchedDimensions = BRIEF_DIMENSIONS.filter((dimension) =>
    matchesKeywords(text, brief.dimensionKeywords[dimension])
  );
  const approvalBrief = hasAny(normalize(`${brief.exactProductProposition} ${brief.directCompetitorCategory}`), [...APPROVAL_TERMS, ...AUDIT_TERMS]);
  const approvalMatch = hasAny(text, APPROVAL_TERMS);
  const auditMatch = hasAny(text, AUDIT_TERMS);
  const buyerWorkflowMatch = hasAny(text, BUYER_WORKFLOW_TERMS);
  const devopsMatch = hasAny(text, DEVOPS_TERMS);
  const checks: string[] = [];

  if (approvalBrief && devopsMatch && !(approvalMatch && (auditMatch || buyerWorkflowMatch))) {
    return {
      score: 0.05,
      classification: "out_of_scope",
      matchedDimensions,
      mismatchReasons: ["Neighbouring DevOps/CI/CD subject lacks direct customer approval, sign-off, attributable audit-trail, or specified buyer-workflow applicability."],
      acceptanceDecision: "rejected",
      deterministicChecks: ["approval-audit DevOps drift guard"],
    };
  }
  if (approvalBrief && !approvalMatch && !auditMatch) {
    checks.push("missing approval/sign-off/audit-trail anchor");
  }
  if (approvalMatch) checks.push("approval/sign-off anchor matched");
  if (auditMatch) checks.push("attributable audit-trail anchor matched");
  if (buyerWorkflowMatch) checks.push("service-team/customer workflow anchor matched");

  const weights: Record<BriefDimension, number> = {
    target_buyer: 0.13,
    user_workflow: 0.22,
    problem: 0.17,
    proposed_solution: 0.20,
    expected_outcome: 0.13,
    market_category: 0.15,
  };
  let score = matchedDimensions.reduce((sum, dimension) => sum + weights[dimension], 0);
  if (approvalBrief && approvalMatch && (auditMatch || buyerWorkflowMatch)) score = Math.max(score, 0.62);
  if (approvalBrief && approvalMatch && auditMatch && buyerWorkflowMatch) score = Math.max(score, 0.82);
  if (/pricing|competitor|alternative|review|complaint|case_study|documentation/.test(queryFamily) && approvalMatch) score += 0.05;
  score = Number(Math.min(1, score).toFixed(2));

  const classification: RelevanceClass = score >= 0.72 && matchedDimensions.length >= 3
    ? "directly_relevant"
    : score >= 0.52 && (matchedDimensions.includes("user_workflow") || matchedDimensions.includes("proposed_solution"))
    ? "contextually_relevant"
    : score >= 0.25
    ? "adjacent"
    : "out_of_scope";
  const mismatchReasons = BRIEF_DIMENSIONS
    .filter((dimension) => !matchedDimensions.includes(dimension))
    .map((dimension) => `No deterministic match for ${dimension.replaceAll("_", " ")}.`);
  if (approvalBrief && !(approvalMatch && (auditMatch || buyerWorkflowMatch))) {
    mismatchReasons.unshift("Does not directly connect approval/sign-off to attributable history or the service-team/customer workflow.");
  }
  return {
    score,
    classification,
    matchedDimensions,
    mismatchReasons,
    acceptanceDecision: classification === "directly_relevant" || (classification === "contextually_relevant" && score >= 0.58)
      ? "accepted_core"
      : classification === "contextually_relevant" || classification === "adjacent"
      ? "quarantined_context"
      : "rejected",
    deterministicChecks: checks,
  };
}

export function classifyPageAuthority(input: {
  url: string;
  title: string;
  text: string;
  provider: string;
  relevanceScore: number;
}): PageAuthority {
  const url = new URL(input.url);
  const path = url.pathname.toLowerCase();
  const text = normalize(`${input.title} ${input.text.slice(0, 4_000)}`);
  const isPricing = /(?:^|\/)(pricing|plans|packages)(?:\/|$)/.test(path) && /\$|€|£|₹|per month|monthly|annual|plan/.test(text);
  const isDocs = /(?:^|\/)(docs?|help|support|knowledge-base|guides?)(?:\/|$)/.test(path)
    && /how to|documentation|configure|create|approval|workflow/.test(text);
  const isRegulatory = /\.(gov)$/.test(url.hostname) || /(?:^|\.)gc\.ca$|(?:^|\.)europa\.eu$/.test(url.hostname);
  const isReview = /review|rating|pros and cons|verified user/.test(text) && /g2|capterra|trustpilot|gartner|getapp/.test(url.hostname);
  const isCommunity = input.provider === "hacker_news" || /reddit\.com|news\.ycombinator\.com|community|forum|discussion/.test(`${url.hostname}${path}`);
  const isCaseStudy = /case stud|customer stor|success stor/.test(`${path} ${text}`);
  const researchMarkers = ["methodology", "survey", "respondents", "sample size", "research report"]
    .filter((marker) => text.includes(marker)).length;
  const isMarketResearch = researchMarkers >= 2 && !/\/(?:blog|articles?|best)(?:\/|$)/.test(path);
  const isDirectory = input.provider === "wikipedia" || /directory|list of|best .* software/.test(text);

  let pageType: PageAuthority["pageType"] = "secondary_article";
  let authorityScore = 0.55;
  let directnessScore = 0.55;
  let promotionalBias: PageAuthority["promotionalBias"] = "medium";
  if (isRegulatory) [pageType, authorityScore, directnessScore, promotionalBias] = ["regulatory", 0.96, 0.9, "low"];
  else if (isPricing) [pageType, authorityScore, directnessScore, promotionalBias] = ["official_pricing", 0.92, 0.96, "high"];
  else if (isDocs) [pageType, authorityScore, directnessScore, promotionalBias] = ["official_documentation", 0.9, 0.9, "medium"];
  else if (isReview) [pageType, authorityScore, directnessScore, promotionalBias] = ["buyer_review", 0.72, 0.86, "medium"];
  else if (isCommunity) [pageType, authorityScore, directnessScore, promotionalBias] = ["community_discussion", 0.46, 0.74, "low"];
  else if (isCaseStudy) [pageType, authorityScore, directnessScore, promotionalBias] = ["case_study", 0.7, 0.82, "high"];
  else if (isMarketResearch) [pageType, authorityScore, directnessScore, promotionalBias] = ["market_research", 0.78, 0.72, "medium"];
  else if (isDirectory) [pageType, authorityScore, directnessScore, promotionalBias] = ["search_or_directory", 0.35, 0.35, "medium"];
  else if (!/\/(?:blog|articles?|resources)(?:\/|$)/.test(path) && /features|product|solutions|approval|proofing/.test(`${path} ${text.slice(0, 1_000)}`)) {
    [pageType, authorityScore, directnessScore, promotionalBias] = ["official_product", 0.72, 0.82, "high"];
  }
  const applicability = Math.max(0, Math.min(1, input.relevanceScore));
  const composite = authorityScore * 0.38 + directnessScore * 0.34 + applicability * 0.28
    - (promotionalBias === "high" ? 0.07 : 0);
  const sourceTier: 1 | 2 | 3 | 4 = composite >= 0.79 && ["official_pricing", "official_documentation", "regulatory", "market_research"].includes(pageType)
    ? 1
    : composite >= 0.62
    ? 2
    : composite >= 0.38
    ? 3
    : 4;
  return {
    sourceTier,
    pageType,
    authorityScore: Number(authorityScore.toFixed(2)),
    directnessScore: Number(directnessScore.toFixed(2)),
    promotionalBias,
    reason: `${pageType.replaceAll("_", " ")} page; authority ${authorityScore.toFixed(2)}, directness ${directnessScore.toFixed(2)}, promotional bias ${promotionalBias}, applicability ${applicability.toFixed(2)}.`,
  };
}

function inferIndustry(target: string, proposition: string, marketType?: string) {
  const text = normalize(`${target} ${proposition}`);
  if (/agency|consult|professional service|service team/.test(text)) return "Professional services and client-service operations";
  return clean(marketType) || "Not specified";
}
function normalize(value: string) {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9$€£₹/+.-]+/g, " ").replace(/\s+/g, " ").trim();
}
function terms(value: string) {
  const normalized = normalize(value);
  const phrases = normalized.split(/[;,]/).map((term) => term.trim()).filter((term) => term.split(" ").length >= 2 && term.length <= 80);
  const tokens = normalized.match(/[a-z][a-z0-9/-]{2,}/g) || [];
  return unique([...phrases, ...tokens.filter((token) => !STOP.has(token))]);
}
function matchesKeywords(text: string, keywords: string[]) {
  if (!text) return false;
  const normalizedKeywords = keywords.map(normalize).filter((term) => term.length >= 3);
  const phraseMatch = normalizedKeywords.some((term) => term.includes(" ") && text.includes(term));
  const tokenMatches = normalizedKeywords.filter((term) => !term.includes(" ") && new RegExp(`(?:^|\\s)${escapeRegExp(term)}(?:$|\\s)`).test(text));
  return phraseMatch || tokenMatches.length >= 2;
}
function hasAny(text: string, values: string[]) {
  return values.some((value) => text.includes(normalize(value)));
}
function clean(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
function unique<T>(values: T[]): T[] {
  return [...new Set(values.map((value) => typeof value === "string" ? value.trim() : value).filter(Boolean) as T[])];
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
