// TypeScript definitions for SignalFit (Generated & Normalized)

// Enums / Literal Types matching DB constraints
export type ValidationVerdict = "Build now" | "Validate first" | "Avoid for now" | "Build Now" | "Validate First" | "Niche Down" | "Weak Signal" | "Avoid";
export type EngineVerdict = "Build Now" | "Validate First" | "Niche Down" | "Weak Signal" | "Avoid";
export type ScoringCriterion = "painSeverity" | "purchaseUrgency" | "willingnessToPay" | "buyerReachability" | "mvpSpeed" | "competitionGap" | "retentionPotential" | "platformDependencyRisk" | "regulatoryRisk" | "founderFit" | "distributionClarity" | "speedToFirstRevenue";
export type ScoringWeights = Record<ScoringCriterion, number>;
export type CriterionScores = Record<ScoringCriterion, number>;
export type CriterionNotes = Record<ScoringCriterion, string>;
export type CriterionEvidence = Partial<Record<ScoringCriterion, string[]>>;
export interface OpportunityScorecard { scores: CriterionScores; notes: CriterionNotes; evidenceRefs: CriterionEvidence; weights: ScoringWeights; total: number; confidence: number; verdict: EngineVerdict; }

export type MarketType = "B2B" | "D2C" | "Creator" | "Developer Tool" | "Local Business" | "Agency Tool" | "Student/Career" | "Other";
export type ResearchMode = "Fast Scan" | "Deep Validation" | "Compare Ideas" | "Find Opportunities in Market";
export type SignalType = "Pain" | "Demand" | "Pricing" | "Risk";
export type StrengthLevel = "High" | "Medium" | "Low";
export type RiskCategory = "Market" | "Execution" | "Platform" | "Regulatory";
export type BuildComplexity = "Low" | "Medium" | "High";
export type TeamRole = "owner" | "admin" | "member";
export type JobStatus = "Queued" | "Researching" | "Processing" | "Complete" | "Failed";
export type ReportStatus = "Draft" | "Published";

// Legacy Frontend Entity definitions (retained for UI components)
export interface EvidenceItem { id: string; source: string; sourceType: string; title: string; snippet: string; url: string; signal: "Pain" | "Demand" | "Pricing" | "Risk"; strength: "High" | "Medium" | "Low"; date: string; }
export interface Competitor { id: string; name: string; positioning: string; pricing: string; target: string; strength: string; gap: string; }
export interface ScoreBreakdown { pain: number; urgency: number; willingnessToPay: number; reachability: number; competition: number; complexity: number; platformRisk: number; founderFit: number; total: number; }
export interface PricingModel { model: string; pricePoint: string; rationale: string; firstOffer: string; targetCustomers: number; }
export interface MVPPlan { outcome: string; scope: string[]; exclusions: string[]; buildEstimate: string; }
export interface LaunchPlan { firstCustomerChannel: string; weekOne: string[]; outreachMessage: string; successMetric: string; }
export interface RiskItem { id: string; category: "Market" | "Execution" | "Platform" | "Regulatory"; severity: "High" | "Medium" | "Low"; description: string; mitigation: string; }

export interface Opportunity { id: string; name: string; oneLiner: string; targetCustomer: string; market: MarketType; score: ScoreBreakdown; verdict: ValidationVerdict; confidence: number; evidence: EvidenceItem[]; competitors: Competitor[]; pricing: PricingModel; mvp: MVPPlan; launch: LaunchPlan; risks: RiskItem[]; }
export interface ResearchRun { id: string; ideaName: string; ideaDescription: string; targetCustomer: string; marketType: MarketType; targetRegion: string; mode: ResearchMode; status: JobStatus; createdAt: string; progress: number; opportunity?: Opportunity; }

// Database Normalized Tables Interfaces (DbPrefix to prevent collision with Legacy)
export interface DbUser { id: string; display_name: string | null; email: string | null; avatar_url: string | null; onboarding_completed: boolean; tour_completed: boolean; created_at: string; updated_at: string; }
export interface DbTeam { id: string; name: string; slug: string; created_by: string | null; created_at: string; updated_at: string; }
export interface DbTeamMember { id: string; team_id: string; user_id: string; role: TeamRole; created_at: string; }
export interface DbUserPreference { user_id: string; experience_level?: string; preferred_market?: string; target_customer_type?: string; revenue_goal?: string; business_model?: string; technical_level?: string; region?: string; launch_channels?: string[]; theme_preference: string; email_notifications: boolean; created_at: string; updated_at: string; }
export interface DbFeatureLimit { team_id: string; max_projects: number; used_projects: number; max_research_runs: number; used_research_runs: number; max_team_members: number; created_at: string; updated_at: string; }

export interface DbProject { id: string; team_id: string; name: string; description?: string; created_by?: string; created_at: string; updated_at: string; }
export interface DbResearchRun { id: string; project_id: string; created_by?: string; idea_name: string; idea_description: string; target_customer: string; market_type: MarketType; target_region: string; mode: ResearchMode; status: JobStatus; progress: number; error_message?: string; created_at: string; updated_at: string; }
export interface DbResearchStage { id: string; run_id: string; stage_name: string; status: "Pending" | "Active" | "Complete" | "Failed"; error_message?: string; started_at?: string; completed_at?: string; created_at: string; updated_at: string; }
export interface DbSavedComparison { id: string; project_id: string; name: string; run_ids: string[]; created_by?: string; created_at: string; }

export interface DbOpportunity { id: string; run_id: string; name: string; one_liner: string; target_customer: string; core_pain: string; market: string; created_at: string; updated_at: string; }
export interface DbSource { id: string; run_id: string; title: string; url: string; source_type: string; text_content: string; published_at?: string; created_at: string; }
export interface DbEvidenceItem { id: string; run_id: string; opportunity_id?: string; source_id?: string; signal_type: SignalType; strength: StrengthLevel; title: string; snippet: string; verified: boolean; created_at: string; }
export interface DbCompetitor { id: string; opportunity_id: string; name: string; positioning: string; pricing: string; target: string; strength: string; gap: string; created_at: string; }
export interface DbRisk { id: string; opportunity_id: string; category: RiskCategory; severity: StrengthLevel; description: string; mitigation: string; created_at: string; }
export interface DbPricingModel { id: string; opportunity_id: string; model: string; price_point: string; rationale: string; first_offer: string; target_customers: number; created_at: string; }
export interface DbMVPPlan { id: string; opportunity_id: string; outcome: string; build_estimate: string; build_complexity: BuildComplexity; created_at: string; }
export interface DbMVPScopeItem { id: string; mvp_plan_id: string; item_type: "Scope" | "Exclusion"; description: string; created_at: string; }
export interface DbLaunchPlan { id: string; opportunity_id: string; first_customer_channel: string; outreach_message: string; success_metric: string; created_at: string; }
export interface DbLaunchStrategy { id: string; launch_plan_id: string; strategy_type: "WeekOne" | "FirstTen"; description: string; created_at: string; }

export interface DbOpportunityScore { id: string; opportunity_id: string; total: number; confidence: number; verdict: EngineVerdict; created_at: string; }
export interface DbScoreBreakdown { id: string; score_id: string; criterion: string; score: number; notes: string; weight: number; created_at: string; }
export interface DbScoreEvidenceRef { id: string; score_breakdown_id: string; evidence_id: string; created_at: string; }
export interface DbReport { id: string; run_id: string; opportunity_id: string; status: ReportStatus; executive_summary: string; methodology: string; generated_at: string; updated_at: string; }
export interface DbReportVersion { id: string; report_id: string; version_number: number; payload: any; created_at: string; }

// Combined Types for UI Convenience in Database context
export interface FullDbOpportunity extends DbOpportunity { scorecard?: DbOpportunityScore & { breakdowns: (DbScoreBreakdown & { evidence: DbEvidenceItem[] })[] }; evidence: DbEvidenceItem[]; competitors: DbCompetitor[]; pricing?: DbPricingModel; mvp?: DbMVPPlan & { items: DbMVPScopeItem[] }; launch?: DbLaunchPlan & { strategies: DbLaunchStrategy[] }; risks: DbRisk[]; }
