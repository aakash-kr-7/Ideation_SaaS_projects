import { z } from "zod";
import { scoringCriteria } from "./scoring.ts";
import type { Competitor, EvidenceItem, LaunchPlan, MVPPlan, OpportunityScorecard, PricingModel, RiskItem } from "./types.ts";

// Original/Legacy frontend-facing schemas
export const evidenceSchema = z.object({ id: z.string(), source: z.string(), sourceType: z.string(), title: z.string(), snippet: z.string(), url: z.string().url().or(z.string().startsWith("/")), signal: z.enum(["Pain", "Demand", "Pricing", "Risk"]), strength: z.enum(["High", "Medium", "Low"]), date: z.string() });
export const competitorSchema = z.object({ id: z.string(), name: z.string(), positioning: z.string(), pricing: z.string(), target: z.string(), strength: z.string(), gap: z.string() });
export const pricingModelSchema = z.object({ model: z.string(), pricePoint: z.string(), rationale: z.string(), first_offer: z.string(), target_customers: z.number().int().nonnegative() });
export const launchPlanSchema = z.object({ firstCustomerChannel: z.string(), weekOne: z.array(z.string()).min(1), outreachMessage: z.string(), successMetric: z.string(), firstTenStrategy: z.array(z.string()).min(1) });
export const riskSchema = z.object({ id: z.string(), category: z.enum(["Market", "Execution", "Platform", "Regulatory"]), severity: z.enum(["High", "Medium", "Low"]), description: z.string(), mitigation: z.string() });
export const mvpPlanSchema = z.object({ outcome: z.string(), scope: z.array(z.string()).min(1), exclusions: z.array(z.string()), buildEstimate: z.string(), buildComplexity: z.enum(["Low", "Medium", "High"]) });
export const scorecardSchema = z.object({ scores: z.object(Object.fromEntries(scoringCriteria.map(c => [c.key, z.number().min(0).max(100)])) as Record<string, z.ZodNumber>), notes: z.object(Object.fromEntries(scoringCriteria.map(c => [c.key, z.string().min(1)])) as Record<string, z.ZodString>), evidenceRefs: z.record(z.string(), z.array(z.string())).default({}), weights: z.object(Object.fromEntries(scoringCriteria.map(c => [c.key, z.number().min(0)])) as Record<string, z.ZodNumber>), total: z.number().min(0).max(100), confidence: z.number().min(0).max(100), verdict: z.enum(["Build Now", "Validate First", "Niche Down", "Weak Signal", "Avoid"]) });
export const opportunitySchema = z.object({ id: z.string(), name: z.string(), one_liner: z.string(), target_customer: z.string(), core_pain: z.string(), market: z.string(), scorecard: scorecardSchema, evidence: z.array(evidenceSchema), competitors: z.array(competitorSchema), pricing: pricingModelSchema, mvp: mvpPlanSchema, launch: launchPlanSchema, risks: z.array(riskSchema), createdAt: z.string() });
export const validationReportSchema = z.object({ id: z.string(), version: z.literal("1.0"), generatedAt: z.string(), executiveSummary: z.string(), opportunity: opportunitySchema, methodology: z.string() });

export interface ReportOpportunity { id: string; name: string; oneLiner: string; targetCustomer: string; corePain: string; currentWorkaround?: string; whyUsersPay?: string; market: string; scorecard: OpportunityScorecard; evidence: EvidenceItem[]; competitors: Competitor[]; pricing: PricingModel; mvp: MVPPlan & { buildComplexity: "Low" | "Medium" | "High" }; launch: LaunchPlan & { firstTenStrategy: string[]; firstHundredStrategy?: string[]; launchChannels?: string[]; validationExperiment?: string[] }; risks: RiskItem[]; technicalStack?: string[]; apiDependencies?: string[]; notToBuildFirst?: string[]; createdAt: string; }
export interface ValidationReport { id: string; version: "1.0"; generatedAt: string; executiveSummary: string; opportunity: ReportOpportunity; methodology: string; }

// Database-specific schema constraints for Server Actions inputs
export const dbSignalTypeSchema = z.enum(["Pain", "Demand", "Pricing", "Risk"]);
export const dbStrengthLevelSchema = z.enum(["High", "Medium", "Low"]);
export const dbRiskCategorySchema = z.enum(["Market", "Execution", "Platform", "Regulatory"]);
export const dbBuildComplexitySchema = z.enum(["Low", "Medium", "High"]);
export const dbValidationVerdictSchema = z.enum(["Build Now", "Validate First", "Niche Down", "Weak Signal", "Avoid"]);

export const dbEvidenceSchema = z.object({ id: z.string().uuid(), signal_type: dbSignalTypeSchema, strength: dbStrengthLevelSchema, title: z.string(), snippet: z.string(), verified: z.boolean() });
export const dbCompetitorSchema = z.object({ id: z.string().uuid(), name: z.string(), positioning: z.string(), pricing: z.string(), target: z.string(), strength: z.string(), gap: z.string() });
export const dbRiskSchema = z.object({ id: z.string().uuid(), category: dbRiskCategorySchema, severity: dbStrengthLevelSchema, description: z.string(), mitigation: z.string() });
export const dbPricingModelSchema = z.object({ id: z.string().uuid(), model: z.string(), price_point: z.string(), rationale: z.string(), first_offer: z.string(), target_customers: z.number().int().nonnegative() });
export const dbMvpScopeItemSchema = z.object({ id: z.string().uuid(), item_type: z.enum(["Scope", "Exclusion"]), description: z.string() });
export const dbMvpPlanSchema = z.object({ id: z.string().uuid(), outcome: z.string(), build_estimate: z.string(), build_complexity: dbBuildComplexitySchema, items: z.array(dbMvpScopeItemSchema).default([]) });
export const dbLaunchStrategySchema = z.object({ id: z.string().uuid(), strategy_type: z.enum(["WeekOne", "FirstTen"]), description: z.string() });
export const dbLaunchPlanSchema = z.object({ id: z.string().uuid(), first_customer_channel: z.string(), outreach_message: z.string(), success_metric: z.string(), strategies: z.array(dbLaunchStrategySchema).default([]) });

// Database Form / Action inputs
export const createProjectSchema = z.object({ name: z.string().min(1), description: z.string().optional() });
export const startResearchRunSchema = z.object({ project_id: z.string().uuid(), idea_name: z.string().min(1), idea_description: z.string().min(10), target_customer: z.string().min(1), market_type: z.enum(["B2B", "D2C", "Creator", "Developer Tool", "Local Business", "Agency Tool", "Student/Career", "Other"]), target_region: z.string().min(1), mode: z.enum(["Fast Scan", "Deep Validation", "Compare Ideas", "Find Opportunities in Market"]) });
