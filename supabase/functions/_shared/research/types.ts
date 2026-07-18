import type { ValidationReport } from "../report-schema.ts";
import type { ResearchMode } from "../types.ts";
import type { ResearchStatus } from "./status.ts";

export type EvidenceKind =
  | "user complaint"
  | "competitor pricing"
  | "competitor feature"
  | "market trend"
  | "distribution channel"
  | "risk"
  | "workaround";
export interface ResearchRequest {
  ideaName: string;
  ideaDescription: string;
  targetCustomer: string;
  marketType: string;
  targetRegion: string;
  mode: ResearchMode;
}
export interface SearchQuery {
  id: string;
  category: string;
  query: string;
  family?: "problem" | "solution";
  pass?: 1 | 2 | 3;
  objective?: "broad" | "targeted" | "disconfirming" | "market-sizing";
  triggeredByEvidenceIds?: string[];
}
export interface SearchResult {
  id: string;
  title: string;
  url: string;
  source: string;
  snippet: string;
  publishedAt?: string;
  sourceType: string;
}
export interface ExtractedSource extends SearchResult {
  text: string;
  date?: string;
}
export interface EvidenceRecord {
  id: string;
  sourceId: string;
  researchQueryId?: string | null;
  kind: EvidenceKind;
  confidence: number;
  title: string;
  snippet: string;
  url: string;
  source: string;
  verified: boolean;
  evidenceFamily?: "problem" | "solution";
  researchPass?: 1 | 2 | 3;
  sourceTier?: 1 | 2 | 3 | 4;
  sourceTierReason?: string | null;
  independentSourceCount?: number;
  independentDomainCount?: number;
  disconfirming?: boolean;
  inference?: string;
}
export interface PipelineRun {
  id: string;
  request: ResearchRequest;
  mode: ResearchMode;
  stage: ResearchStatus;
  progress: number;
  message: string;
  queries: SearchQuery[];
  sources: ExtractedSource[];
  evidence: EvidenceRecord[];
  report?: ValidationReport;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
