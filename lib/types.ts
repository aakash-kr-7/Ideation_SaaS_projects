export type ValidationVerdict = "Build now" | "Validate first" | "Avoid for now";
export type EngineVerdict = "Build Now" | "Validate First" | "Niche Down" | "Weak Signal" | "Avoid";
export type ScoringCriterion = "painSeverity" | "purchaseUrgency" | "willingnessToPay" | "buyerReachability" | "mvpSpeed" | "competitionGap" | "retentionPotential" | "platformDependencyRisk" | "regulatoryRisk" | "founderFit" | "distributionClarity" | "speedToFirstRevenue";
export type ScoringWeights = Record<ScoringCriterion, number>;
export type CriterionScores = Record<ScoringCriterion, number>;
export type CriterionNotes = Record<ScoringCriterion, string>;
export type CriterionEvidence = Partial<Record<ScoringCriterion, string[]>>;
export interface OpportunityScorecard { scores: CriterionScores; notes: CriterionNotes; evidenceRefs: CriterionEvidence; weights: ScoringWeights; total: number; confidence: number; verdict: EngineVerdict; }
export type MarketType = "B2B" | "D2C" | "Creator" | "Developer Tool" | "Local Business" | "Agency Tool" | "Student/Career" | "Other";
export type ResearchMode = "Fast Scan" | "Deep Validation" | "Compare Ideas" | "Find Opportunities in Market";

export interface EvidenceItem { id: string; source: string; sourceType: string; title: string; snippet: string; url: string; signal: "Pain" | "Demand" | "Pricing" | "Risk"; strength: "High" | "Medium" | "Low"; date: string; }
export interface Competitor { id: string; name: string; positioning: string; pricing: string; target: string; strength: string; gap: string; }
export interface ScoreBreakdown { pain: number; urgency: number; willingnessToPay: number; reachability: number; competition: number; complexity: number; platformRisk: number; founderFit: number; total: number; }
export interface PricingModel { model: string; pricePoint: string; rationale: string; firstOffer: string; targetCustomers: number; }
export interface MVPPlan { outcome: string; scope: string[]; exclusions: string[]; buildEstimate: string; };
export interface LaunchPlan { firstCustomerChannel: string; weekOne: string[]; outreachMessage: string; successMetric: string; }
export interface RiskItem { id: string; category: "Market" | "Execution" | "Platform" | "Regulatory"; severity: "High" | "Medium" | "Low"; description: string; mitigation: string; }
export interface Opportunity { id: string; name: string; oneLiner: string; targetCustomer: string; market: MarketType; score: ScoreBreakdown; verdict: ValidationVerdict; confidence: number; evidence: EvidenceItem[]; competitors: Competitor[]; pricing: PricingModel; mvp: MVPPlan; launch: LaunchPlan; risks: RiskItem[]; }
export interface ResearchRun { id: string; ideaName: string; ideaDescription: string; targetCustomer: string; marketType: MarketType; targetRegion: string; mode: ResearchMode; status: "Queued" | "Researching" | "Complete" | "Failed"; createdAt: string; progress: number; opportunity?: Opportunity; }
