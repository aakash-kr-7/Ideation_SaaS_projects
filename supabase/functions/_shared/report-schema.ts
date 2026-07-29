import { z } from "zod";
import { reportModeSchema } from "./research/mode-config.ts";
import type {
  Competitor,
  EvidenceItem,
  LaunchPlan,
  MVPPlan,
  OpportunityScorecard,
  PricingModel,
  RiskItem,
  ScoringCriterion,
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
  researchPass: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  researchQueryId: z.string().uuid().nullable().optional(),
  sourceTier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  sourceTierReason: z.string().nullable().optional(),
  excluded: z.boolean().optional(),
  disconfirming: z.boolean().optional(),
  painPoint: z.string().nullish().transform((value) => value ?? undefined),
  independentSourceCount: z.number().int().nonnegative().optional(),
  independentDomainCount: z.number().int().nonnegative().optional(),
  evidenceTopic: z.string().optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  relevanceClass: z.enum(["directly_relevant", "contextually_relevant", "adjacent", "out_of_scope"]).optional(),
  matchedBriefDimensions: z.array(z.string()).optional(),
  mismatchReasons: z.array(z.string()).optional(),
  acceptanceDecision: z.string().optional(),
  claimId: z.string().optional(),
  canonicalSourceId: z.string().uuid().nullable().optional(),
  canonicalDomain: z.string().optional(),
  sourceFamily: z.string().optional(),
  sourceAuthority: z.number().min(0).max(1).optional(),
  evidenceDirectness: z.number().min(0).max(1).optional(),
  semanticRelevance: z.number().min(0).max(1).optional(),
  independenceKey: z.string().optional(),
  syndicationGroup: z.string().optional(),
  claimFingerprint: z.string().optional(),
  evidenceRole: z.enum(["supporting", "challenging"]).optional(),
  associatedFactorIds: z.array(z.string()).optional(),
  extractionConfidence: z.number().min(0).max(1).optional(),
  numericValidationState: z.enum(["verified", "flagged", "rejected", "not_applicable", "not_checked"]).optional(),
  modelClassificationMetadata: z.record(z.string(), z.unknown()).nullable().optional(),
});
export const competitorSchema = z.object({
  id: z.string(),
  name: z.string(),
  positioning: z.string(),
  pricing: z.string(),
  target: z.string(),
  strength: z.string(),
  gap: z.string(),
  classification: z.enum(["direct", "adjacent", "substitute", "workflow_workaround"]).default("adjacent"),
  comparability: z.object({
    targetBuyer: z.boolean(),
    workflow: z.boolean(),
    approvalModel: z.boolean(),
    attributionAudit: z.boolean(),
    productUseCase: z.boolean(),
  }).default({
    targetBuyer: false,
    workflow: false,
    approvalModel: false,
    attributionAudit: false,
    productUseCase: false,
  }),
  evidenceIds: z.array(z.string().uuid()).default([]),
  verificationStatus: z.enum([
    "discovered_candidate",
    "live_verified_competitor",
    "adjacent_alternative",
    "unverified_seed",
  ]).optional(),
  verifiedAt: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  canonicalHomepage: z.string().url().nullable().optional(),
  categoryRationale: z.string().nullable().optional(),
  candidateType: z.enum(["direct", "adjacent"]).nullable().optional(),
  seedLastReviewedAt: z.string().nullable().optional(),
});
export const pricingModelSchema = z.object({
  model: z.string(),
  pricePoint: z.string(),
  rationale: z.string(),
  firstOffer: z.string(),
  targetCustomers: z.number().int().nonnegative().nullable(),
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
  buildComplexity: z.enum(["Low", "Medium", "High"]).nullable(),
});
const scoreNumber = () => z.number().min(0).max(100);
const weightNumber = () => z.number().min(0);
const criterionScoreShape = {
  painSeverity: scoreNumber(), purchaseUrgency: scoreNumber(), willingnessToPay: scoreNumber(), buyerReachability: scoreNumber(),
  mvpSpeed: scoreNumber(), competitionGap: scoreNumber(), retentionPotential: scoreNumber(), platformDependencyRisk: scoreNumber(),
  regulatoryRisk: scoreNumber(), founderFit: scoreNumber(), distributionClarity: scoreNumber(), speedToFirstRevenue: scoreNumber(),
} satisfies Record<ScoringCriterion, z.ZodNumber>;
const criterionStringShape = {
  painSeverity: z.string().min(1), purchaseUrgency: z.string().min(1), willingnessToPay: z.string().min(1), buyerReachability: z.string().min(1),
  mvpSpeed: z.string().min(1), competitionGap: z.string().min(1), retentionPotential: z.string().min(1), platformDependencyRisk: z.string().min(1),
  regulatoryRisk: z.string().min(1), founderFit: z.string().min(1), distributionClarity: z.string().min(1), speedToFirstRevenue: z.string().min(1),
} satisfies Record<ScoringCriterion, z.ZodString>;
const criterionWeightShape = {
  painSeverity: weightNumber(), purchaseUrgency: weightNumber(), willingnessToPay: weightNumber(), buyerReachability: weightNumber(),
  mvpSpeed: weightNumber(), competitionGap: weightNumber(), retentionPotential: weightNumber(), platformDependencyRisk: weightNumber(),
  regulatoryRisk: weightNumber(), founderFit: weightNumber(), distributionClarity: weightNumber(), speedToFirstRevenue: weightNumber(),
} satisfies Record<ScoringCriterion, z.ZodNumber>;
const verdictSchema = z.enum([
  "Build Now",
  "Validate First",
  "Niche Down",
  "Weak Signal",
  "Avoid",
]);
const factorEvidenceSchema = z.object({
  rawScore: scoreNumber(),
  evidenceCoefficient: z.number().min(0).max(1),
  effectiveScore: scoreNumber(),
  evidenceState: z.enum(["EVIDENCED", "SUGGESTIVE", "ASSUMED"]),
  supportingEvidenceIds: z.array(z.string().uuid()),
  challengingEvidenceIds: z.array(z.string().uuid()).default([]),
  confidenceDeductions: z.array(z.string()).default([]),
  unresolvedGaps: z.array(z.string()).default([]),
});
const scoreBandSchema = z.object({
  minimum: z.number().min(0).max(100),
  maximum: z.number().min(0).max(100),
  label: z.enum([
    "High Evidence Confidence",
    "Moderate Evidence Confidence",
    "Low Evidence Confidence",
  ]),
  display: z.string().min(1),
});
export const scorecardSchema = z.object({
  scores: z.object(criterionScoreShape),
  notes: z.object(criterionStringShape),
  evidenceRefs: z.record(z.string(), z.array(z.string())).default({}),
  weights: z.object(criterionWeightShape),
  total: z.number().min(0).max(100),
  confidence: z.number().min(0).max(100),
  verdict: verdictSchema,
  deterministicVerdict: verdictSchema.optional(),
  decisionStatus: z.enum(["Passed", "Challenged"]).optional(),
  factorEvidence: z.record(z.string(), factorEvidenceSchema).default({}),
  scoreBand: scoreBandSchema.optional(),
});
export const opportunitySchema = z.object({
  id: z.string(),
  name: z.string(),
  oneLiner: z.string(),
  targetCustomer: z.string(),
  corePain: z.string(),
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
export const narrativeClaimSchema = z.object({
  text: z.string().min(1),
  evidence_ids: z.array(z.string().uuid()).min(1),
  score_criteria: z.array(z.string()).default([]),
});
export const narrativeCitationsSchema = z.object({
  written_verdict: verdictSchema,
  executive_summary: z.array(narrativeClaimSchema).min(1),
  methodology: z.array(narrativeClaimSchema).min(1),
});
export const specialistAssessmentSchema = z.object({
  name: z.enum(["competition", "market", "pricing", "risk", "demand", "gtm"]),
  status: z.enum(["Complete", "Incomplete"]),
  direction: z.enum(["Supports opportunity", "Mixed evidence", "Challenges opportunity", "Insufficient evidence"]),
  assessment: z.string().min(1),
  findings: z.array(z.string()),
  evidenceIds: z.array(z.string().uuid()).default([]),
  sourceCitations: z.array(z.object({ sourceId: z.string().uuid(), url: z.string().url() })).default([]),
  opposingEvidenceIds: z.array(z.string().uuid()).default([]),
  confidence: z.enum(["High", "Moderate", "Low", "Insufficient"]).default("Insufficient"),
  relevantBriefDimensions: z.array(z.string()).default([]),
  unresolvedGaps: z.array(z.string()).default([]),
});
export const fullValidationInsightsSchema = z.object({
  targetSegments: z.array(z.object({
    name: z.string().min(1),
    jobsToBeDone: z.array(z.string()).min(1),
    evidenceSourceUrls: z.array(z.string().url()).default([]),
    evidenceIds: z.array(z.string().uuid()).default([]),
    sourceCitations: z.array(z.object({ sourceId: z.string().uuid(), url: z.string().url() })).default([]),
  })).default([]),
  willingnessToPay: z.object({
    finding: z.string().default("Insufficient public willingness-to-pay evidence."),
    strength: z.enum(["Strong", "Moderate", "Weak", "Insufficient"]).default("Insufficient"),
    evidenceSourceUrls: z.array(z.string().url()).default([]),
    evidenceIds: z.array(z.string().uuid()).default([]),
  }),
  marketContext: z.object({
    summary: z.string(),
    metrics: z.array(z.object({
      label: z.string(), value: z.string(), sourceUrl: z.string().url(), evidenceId: z.string().uuid().nullable(),
      numericValidation: z.record(z.string(), z.unknown()).nullable().optional(),
    })).default([]),
  }),
  gtmFindings: z.array(z.object({
    finding: z.string(),
    evidenceSourceUrls: z.array(z.string().url()).default([]),
    evidenceIds: z.array(z.string().uuid()).default([]),
    sourceCitations: z.array(z.object({ sourceId: z.string().uuid(), url: z.string().url() })).default([]),
  })).default([]),
});
export const decisionStatementSchema = z.object({
  kind: z.enum(["Fact", "Inference", "Hypothesis", "Recommendation", "MissingEvidence"]),
  text: z.string().min(1),
  evidenceIds: z.array(z.string().uuid()).default([]),
  sourceUrls: z.array(z.string().url()).default([]),
});
export const decisionSectionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  statements: z.array(decisionStatementSchema).min(1),
});
export const validationExperimentSchema = z.object({
  name: z.string().min(1),
  hypothesis: z.string().min(1),
  method: z.string().min(1),
  targetParticipant: z.string().min(1),
  recruitmentMethod: z.string().min(1),
  sampleSize: z.string().min(1),
  successCriterion: z.string().min(1),
  failureCriterion: z.string().min(1),
  duration: z.string().min(1),
  decisionUnlocked: z.string().min(1),
});
export const specialistDecisionOutputSchema = z.object({
  name: z.enum(["competition", "market", "pricing", "risk", "demand", "gtm"]),
  keyFindings: z.array(z.string().min(1)).min(1),
  evidenceIds: z.array(z.string().uuid()),
  opposingEvidenceIds: z.array(z.string().uuid()),
  confidence: z.enum(["High", "Moderate", "Low", "Insufficient"]),
  relevantBriefDimensions: z.array(z.string()),
  unresolvedGaps: z.array(z.string()),
  decisionImplication: z.string().min(1),
});
export const decisionChartSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  sourceData: z.record(z.string(), z.unknown()),
  evidenceIds: z.array(z.string().uuid()),
  sourceExplanation: z.string().min(1),
  unavailable: z.boolean(),
});
export const decisionProductSchema = z.object({
  schemaVersion: z.literal(1),
  headline: z.string().min(1),
  decision: verdictSchema,
  score: z.number().min(0).max(100),
  scoreConfidence: z.number().min(0).max(100),
  evidenceConfidence: z.object({
    band: z.enum(["High", "Moderate", "Low", "Insufficient"]),
    score: z.number().min(0).max(1),
    explanation: z.string().min(1),
    missingEvidence: z.array(z.string()),
    deductions: z.array(z.string()).default([]),
  }),
  reportCompleteness: z.object({
    score: z.number().min(0).max(100),
    complete: z.boolean(),
    explanation: z.string().min(1),
    missing: z.array(z.string()),
  }),
  sections: z.array(decisionSectionSchema).min(13),
  experiments: z.array(validationExperimentSchema).length(3),
  primaryRecommendation: z.string().min(1),
  specialistOutputs: z.array(specialistDecisionOutputSchema),
  charts: z.array(decisionChartSchema).min(4),
  fullValidationRecommended: z.boolean().optional(),
});
export const validationReportSchema = z.object({
  id: z.string(),
  version: z.enum(["1.0", "2.0"]),
  reportMode: reportModeSchema.default("full_validation"),
  generatedAt: z.string(),
  executiveSummary: z.string(),
  opportunity: opportunitySchema,
  methodology: z.string(),
  marketSizing: marketSizingSchema.optional(),
  retrieval: z.record(z.string(), z.unknown()).optional(),
  reasoningFlags: z.array(reasoningFlagSchema).optional(),
  adversarialGate: adversarialGateReportSchema.optional(),
  citationValidation: citationValidationReportSchema.optional(),
  decisionIntegrity: decisionIntegritySchema.optional(),
  narrativeCitations: narrativeCitationsSchema.optional(),
  specialistAssessments: z.array(specialistAssessmentSchema).length(6).optional(),
  fullValidationInsights: fullValidationInsightsSchema.optional(),
  evidenceGaps: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  reportSections: z.array(z.string()).default([]),
  availableExports: z.array(z.enum(["pdf", "markdown", "csv", "json"]))
    .default(["pdf", "markdown", "csv", "json"]),
  topRecommendation: z.string().optional(),
  strongestPositiveEvidenceId: z.string().optional(),
  strongestNegativeEvidenceId: z.string().optional(),
  decisionProduct: decisionProductSchema.optional(),
  canonicalResearchBrief: z.record(z.string(), z.unknown()).optional(),
  contradictions: z.array(z.object({
    exactClaimTested: z.string(),
    supportingEvidenceIds: z.array(z.string().uuid()),
    challengingEvidenceIds: z.array(z.string().uuid()),
    relationship: z.string(),
    resolutionStatus: z.enum(["resolved", "unresolved", "segment_specific"]),
    resolutionNote: z.string().nullable().optional(),
    proposition: z.string().optional(),
    segmentApplicability: z.string().nullable().optional(),
    geographyApplicability: z.string().nullable().optional(),
    contradictionStatus: z.string().optional(),
    unresolvedImplication: z.string().nullable().optional(),
  })).default([]),
  confidenceDimensions: z.object({
    evidence: z.record(z.string(), z.unknown()),
    scoring: z.record(z.string(), z.unknown()),
    completeness: z.record(z.string(), z.unknown()),
  }).optional(),
  publicationStandard: z.object({
    met: z.boolean(),
    gaps: z.array(z.string()),
    gapPassPerformed: z.boolean(),
    publishedWithReducedConfidence: z.boolean(),
    dimensions: z.record(z.string(), z.number()),
  }).optional(),
  researchAvailabilityState: z.enum([
    "research_completed",
    "insufficient_evidence",
  ]).optional(),
  evidenceSufficiency: z.object({
    acceptedEvidenceCount: z.number().int().nonnegative(),
    independentEvidenceGroups: z.number().int().nonnegative(),
    independentDomains: z.number().int().nonnegative(),
    sourceFamilyCoverage: z.array(z.string()),
    primaryDirectEvidenceCount: z.number().int().nonnegative(),
    supportingEvidenceCount: z.number().int().nonnegative(),
    challengingEvidenceCount: z.number().int().nonnegative(),
    coveredFactors: z.array(z.string()),
    assumedFactors: z.array(z.string()),
    missingEvidenceFamilies: z.array(z.string()),
    sourceConcentration: z.number().min(0).max(1),
    overallEvidenceConfidence: z.enum(["High", "Moderate", "Low", "Insufficient"]),
    mostImportantLimitation: z.string().min(1),
  }).optional(),
  verdictChangeConditions: z.object({
    nearestBoundary: z.number().nullable(),
    highestLeverageUncertainFactor: z.string(),
    upgradeCondition: z.string().min(1),
    downgradeCondition: z.string().min(1),
  }).optional(),
  researchExecution: z.object({
    maximumGroundedCalls: z.number().int().min(0).max(4),
    groundedCalls: z.number().int().min(0).max(4),
    conditionalCallTrigger: z.array(z.string()),
    packStatuses: z.array(z.object({
      packKey: z.string(),
      status: z.enum([
        "completed",
        "completed_no_evidence",
        "quota_blocked",
        "provider_failed",
        "timed_out",
        "skipped",
      ]),
      acceptedEvidenceCount: z.number().int().nonnegative(),
      failureReason: z.string().nullable().optional(),
    })).default([]),
    adversarialFinding: z.string().min(1),
    calls: z.array(z.object({
      callPurpose: z.string(),
      queryFamily: z.string(),
      grounded: z.boolean(),
      conditionalCallTrigger: z.array(z.string()),
      provider: z.string(),
      model: z.string().nullable().optional(),
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      sourcesDiscovered: z.number().int().nonnegative(),
      sourcesAccepted: z.number().int().nonnegative(),
      independentEvidenceGroupsAdded: z.number().int().nonnegative(),
      evidenceFamiliesAdded: z.array(z.string()),
      contradictionsAdded: z.number().int().nonnegative(),
      pricingClaimsValidated: z.number().int().nonnegative(),
      cacheHits: z.number().int().nonnegative(),
      durationMs: z.number().int().nonnegative(),
      quotaFailure: z.boolean(),
    })),
  }).optional(),
  pricingIntegrity: z.object({
    verifiedCompetitorPricing: z.array(z.object({
      sourceId: z.string().uuid().nullable().optional(),
      sourceUrl: z.string().url(),
      planName: z.string().nullable(),
      pricePoint: z.string(),
      pricingModel: z.enum([
        "subscription",
        "usage",
        "one_time",
        "custom",
        "unknown",
      ]),
      exactExcerpt: z.string(),
      validationState: z.literal("verified"),
    })),
    buyerPaymentEvidenceIds: z.array(z.string().uuid()),
    inferredMonetisationPotential: z.string(),
    missingWtpEvidence: z.boolean(),
  }).optional(),
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
  mvp: MVPPlan & { buildComplexity: "Low" | "Medium" | "High" | null };
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
  version: "1.0" | "2.0";
  reportMode: z.infer<typeof reportModeSchema>;
  generatedAt: string;
  executiveSummary: string;
  opportunity: ReportOpportunity;
  methodology: string;
  marketSizing?: z.infer<typeof marketSizingSchema>;
  retrieval?: Record<string, unknown>;
  reasoningFlags?: z.infer<typeof reasoningFlagSchema>[];
  adversarialGate?: z.infer<typeof adversarialGateReportSchema>;
  citationValidation?: z.infer<typeof citationValidationReportSchema>;
  decisionIntegrity?: z.infer<typeof decisionIntegritySchema>;
  narrativeCitations?: z.infer<typeof narrativeCitationsSchema>;
  specialistAssessments?: z.infer<typeof specialistAssessmentSchema>[];
  fullValidationInsights?: z.infer<typeof fullValidationInsightsSchema>;
  evidenceGaps: string[];
  limitations: string[];
  reportSections: string[];
  availableExports: Array<"pdf" | "markdown" | "csv" | "json">;
  topRecommendation?: string;
  strongestPositiveEvidenceId?: string;
  strongestNegativeEvidenceId?: string;
  decisionProduct?: z.infer<typeof decisionProductSchema>;
  contradictions: z.infer<typeof validationReportSchema.shape.contradictions>;
  researchAvailabilityState?: z.infer<typeof validationReportSchema.shape.researchAvailabilityState>;
  evidenceSufficiency?: z.infer<typeof validationReportSchema.shape.evidenceSufficiency>;
  verdictChangeConditions?: z.infer<typeof validationReportSchema.shape.verdictChangeConditions>;
  researchExecution?: z.infer<typeof validationReportSchema.shape.researchExecution>;
  pricingIntegrity?: z.infer<typeof validationReportSchema.shape.pricingIntegrity>;
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
  assumptions: z.object({
    industry: z.string().max(120).optional(),
    revenueTarget: z.string().max(100).optional(),
    monetization: z.string().max(100).optional(),
    complexityTolerance: z.string().max(100).optional(),
    platformTolerance: z.string().max(100).optional(),
    regulatoryTolerance: z.string().max(100).optional(),
  }).default({}),
  mode: reportModeSchema,
  idempotency_key: z.string().uuid(),
});
