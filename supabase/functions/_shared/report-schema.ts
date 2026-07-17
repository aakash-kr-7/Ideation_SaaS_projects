import { z } from "zod";
import { scoringCriteria } from "./scoring.ts";
import type {
  Competitor,
  EvidenceItem,
  LaunchPlan,
  MVPPlan,
  OpportunityScorecard,
  PricingModel,
  RiskItem,
} from "./types.ts";

// Original/Legacy frontend-facing schemas
export const evidenceSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceType: z.string(),
  title: z.string(),
  snippet: z.string(),
  url: z.string().url().or(z.string().startsWith("/")),
  signal: z.enum(["Pain", "Demand", "Pricing", "Risk"]),
  strength: z.enum(["High", "Medium", "Low"]),
  date: z.string(),
  evidenceFamily: z.enum(["problem", "solution"]).optional(),
  researchPass: z.number().int().min(1).max(3).optional(),
  researchQueryId: z.string().uuid().nullable().optional(),
  sourceTier: z.number().int().min(1).max(4).optional(),
  sourceTierReason: z.string().nullable().optional(),
  excluded: z.boolean().optional(),
  disconfirming: z.boolean().optional(),
  painPoint: z.string().optional(),
  independentSourceCount: z.number().int().nonnegative().optional(),
  independentDomainCount: z.number().int().nonnegative().optional(),
});
export const competitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  positioning: z.string(),
  pricing: z.string(),
  target: z.string(),
  strength: z.string(),
  gap: z.string(),
});
export const pricingModelSchema = z.object({
  model: z.string(),
  pricePoint: z.string(),
  rationale: z.string(),
  first_offer: z.string(),
  target_customers: z.number().int().nonnegative(),
});
export const launchPlanSchema = z.object({
  firstCustomerChannel: z.string(),
  weekOne: z.array(z.string()).min(1),
  outreachMessage: z.string(),
  successMetric: z.string(),
  firstTenStrategy: z.array(z.string()).min(1),
});
export const riskSchema = z.object({
  id: z.string(),
  category: z.enum(["Market", "Execution", "Platform", "Regulatory"]),
  severity: z.enum(["High", "Medium", "Low"]),
  description: z.string(),
  mitigation: z.string(),
});
export const mvpPlanSchema = z.object({
  outcome: z.string(),
  scope: z.array(z.string()).min(1),
  exclusions: z.array(z.string()),
  buildEstimate: z.string(),
  buildComplexity: z.enum(["Low", "Medium", "High"]),
});
const verdictSchema = z.enum([
  "Build Now",
  "Validate First",
  "Niche Down",
  "Weak Signal",
  "Avoid",
]);
export const scorecardSchema = z.object({
  scores: z.object(
    Object.fromEntries(
      scoringCriteria.map((c) => [c.key, z.number().min(0).max(100)]),
    ) as Record<string, z.ZodNumber>,
  ),
  notes: z.object(
    Object.fromEntries(
      scoringCriteria.map((c) => [c.key, z.string().min(1)]),
    ) as Record<string, z.ZodString>,
  ),
  evidenceRefs: z.record(z.string(), z.array(z.string())).default({}),
  weights: z.object(
    Object.fromEntries(
      scoringCriteria.map((c) => [c.key, z.number().min(0)]),
    ) as Record<string, z.ZodNumber>,
  ),
  total: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  verdict: verdictSchema,
  deterministicVerdict: verdictSchema.optional(),
  decisionStatus: z.enum(["Passed", "Challenged"]).optional(),
});
export const opportunitySchema = z.object({
  id: z.string(),
  name: z.string(),
  one_liner: z.string(),
  target_customer: z.string(),
  core_pain: z.string(),
  market: z.string(),
  scorecard: scorecardSchema,
  evidence: z.array(evidenceSchema),
  competitors: z.array(competitorSchema),
  pricing: pricingModelSchema,
  mvp: mvpPlanSchema,
  launch: launchPlanSchema,
  risks: z.array(riskSchema),
  createdAt: z.string(),
});
const marketSizeEntrySchema = z.object({
  figure: z.string(),
  evidenceItemId: z.string(),
  sourceId: z.string(),
  citationUrl: z.string().url(),
}).nullable();
export const marketSizingSchema = z.object({
  TAM: marketSizeEntrySchema,
  SAM: marketSizeEntrySchema,
  SOM: marketSizeEntrySchema,
  MarketSize: marketSizeEntrySchema,
  reason: z.string().nullable(),
});
export const reasoningFlagSchema = z.object({
  type: z.enum([
    "DisputedInterpretation",
    "AdversarialObjection",
    "AdversarialGateIncomplete",
    "FinalJudgeVerdictMismatch",
    "CitationIntegrityFailure",
  ]),
  severity: z.enum(["Warning", "Blocking"]),
  message: z.string(),
  evidenceIds: z.array(z.string().uuid()),
});
export const specialistDisputeSchema = z.object({
  specialist: z.enum([
    "competition",
    "market",
    "pricing",
    "risk",
    "demand",
    "gtm",
  ]),
  specialistDirection: z.enum([
    "SupportsOpportunity",
    "Mixed",
    "ChallengesOpportunity",
    "Insufficient",
    "Unavailable",
  ]),
  checkerDirection: z.enum([
    "SupportsOpportunity",
    "Mixed",
    "ChallengesOpportunity",
    "Insufficient",
    "Unavailable",
  ]),
  disputed: z.boolean(),
  reason: z.string(),
});
export const adversarialGateReportSchema = z.object({
  outcome: z.enum([
    "StrongObjection",
    "NoStrongDisproof",
    "InsufficientEvidence",
  ]),
  severity: z.enum(["High", "Medium", "Low", "None"]),
  objection: z.string(),
  evidence_ids: z.array(z.string().uuid()),
  unresolved: z.boolean(),
});
export const citationValidationReportSchema = z.object({
  valid: z.boolean(),
  claimsChecked: z.number().int().nonnegative(),
  claimsRemoved: z.number().int().nonnegative(),
  invalidClaims: z.array(z.record(z.string(), z.unknown())),
});
export const decisionIntegritySchema = z.object({
  deterministicVerdict: verdictSchema,
  effectiveVerdict: verdictSchema,
  finalJudgeWrittenVerdict: verdictSchema,
  finalJudgeScoreMismatch: z.boolean(),
  finalJudgeEffectiveMismatch: z.boolean(),
  adversarialDowngrade: z.boolean(),
  reason: z.string().nullable(),
});
export const validationReportSchema = z.object({
  id: z.string(),
  version: z.literal("1.0"),
  generatedAt: z.string(),
  executiveSummary: z.string(),
  opportunity: opportunitySchema,
  methodology: z.string(),
  marketSizing: marketSizingSchema.optional(),
  retrieval: z.record(z.string(), z.unknown()).optional(),
  reasoningFlags: z.array(reasoningFlagSchema).optional(),
  specialistDisputes: z.array(specialistDisputeSchema).optional(),
  adversarialGate: adversarialGateReportSchema.optional(),
  citationValidation: citationValidationReportSchema.optional(),
  decisionIntegrity: decisionIntegritySchema.optional(),
});

export interface ReportOpportunity {
  id: string;
  name: string;
  oneLiner: string;
  targetCustomer: string;
  corePain: string;
  currentWorkaround?: string;
  whyUsersPay?: string;
  market: string;
  scorecard: OpportunityScorecard;
  evidence: EvidenceItem[];
  competitors: Competitor[];
  pricing: PricingModel;
  mvp: MVPPlan & { buildComplexity: "Low" | "Medium" | "High" };
  launch: LaunchPlan & {
    firstTenStrategy: string[];
    firstHundredStrategy?: string[];
    launchChannels?: string[];
    validationExperiment?: string[];
  };
  risks: RiskItem[];
  technicalStack?: string[];
  apiDependencies?: string[];
  notToBuildFirst?: string[];
  createdAt: string;
}
export interface ValidationReport {
  id: string;
  version: "1.0";
  generatedAt: string;
  executiveSummary: string;
  opportunity: ReportOpportunity;
  methodology: string;
  marketSizing?: z.infer<typeof marketSizingSchema>;
  retrieval?: Record<string, unknown>;
  reasoningFlags?: z.infer<typeof reasoningFlagSchema>[];
  specialistDisputes?: z.infer<typeof specialistDisputeSchema>[];
  adversarialGate?: z.infer<typeof adversarialGateReportSchema>;
  citationValidation?: z.infer<typeof citationValidationReportSchema>;
  decisionIntegrity?: z.infer<typeof decisionIntegritySchema>;
}

// Database-specific schema constraints for Server Actions inputs
export const dbSignalTypeSchema = z.enum(["Pain", "Demand", "Pricing", "Risk"]);
export const dbStrengthLevelSchema = z.enum(["High", "Medium", "Low"]);
export const dbRiskCategorySchema = z.enum([
  "Market",
  "Execution",
  "Platform",
  "Regulatory",
]);
export const dbBuildComplexitySchema = z.enum(["Low", "Medium", "High"]);
export const dbValidationVerdictSchema = z.enum([
  "Build Now",
  "Validate First",
  "Niche Down",
  "Weak Signal",
  "Avoid",
]);

export const dbEvidenceSchema = z.object({
  id: z.string().uuid(),
  signal_type: dbSignalTypeSchema,
  strength: dbStrengthLevelSchema,
  title: z.string(),
  snippet: z.string(),
  verified: z.boolean(),
});
export const dbCompetitorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  positioning: z.string(),
  pricing: z.string(),
  target: z.string(),
  strength: z.string(),
  gap: z.string(),
});
export const dbRiskSchema = z.object({
  id: z.string().uuid(),
  category: dbRiskCategorySchema,
  severity: dbStrengthLevelSchema,
  description: z.string(),
  mitigation: z.string(),
});
export const dbPricingModelSchema = z.object({
  id: z.string().uuid(),
  model: z.string(),
  price_point: z.string(),
  rationale: z.string(),
  first_offer: z.string(),
  target_customers: z.number().int().nonnegative(),
});
export const dbMvpScopeItemSchema = z.object({
  id: z.string().uuid(),
  item_type: z.enum(["Scope", "Exclusion"]),
  description: z.string(),
});
export const dbMvpPlanSchema = z.object({
  id: z.string().uuid(),
  outcome: z.string(),
  build_estimate: z.string(),
  build_complexity: dbBuildComplexitySchema,
  items: z.array(dbMvpScopeItemSchema).default([]),
});
export const dbLaunchStrategySchema = z.object({
  id: z.string().uuid(),
  strategy_type: z.enum(["WeekOne", "FirstTen"]),
  description: z.string(),
});
export const dbLaunchPlanSchema = z.object({
  id: z.string().uuid(),
  first_customer_channel: z.string(),
  outreach_message: z.string(),
  success_metric: z.string(),
  strategies: z.array(dbLaunchStrategySchema).default([]),
});

// Database Form / Action inputs
export const createProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});
export const startResearchRunSchema = z.object({
  project_id: z.string().uuid(),
  idea_name: z.string().min(1),
  idea_description: z.string().min(10),
  target_customer: z.string().min(1),
  market_type: z.enum([
    "B2B",
    "D2C",
    "Creator",
    "Developer Tool",
    "Local Business",
    "Agency Tool",
    "Student/Career",
    "Other",
  ]),
  target_region: z.string().min(1),
  mode: z.enum([
    "Fast Scan",
    "Deep Validation",
    "Compare Ideas",
    "Find Opportunities in Market",
  ]),
});
