import { ValidationReport } from "@/lib/report-schema";
import { ResearchMode } from "@/lib/types";

export type ResearchStage = "Queued" | "Searching" | "Extracting" | "Normalizing" | "Scoring" | "Generating" | "Completed" | "Failed" | "Cancelled";
export type EvidenceKind = "user complaint" | "competitor pricing" | "competitor feature" | "market trend" | "distribution channel" | "risk" | "workaround";
export interface ResearchRequest { ideaName: string; ideaDescription: string; targetCustomer: string; marketType: string; targetRegion: string; depth: "fast" | "deep"; }
export interface SearchQuery { id: string; category: string; query: string; }
export interface SearchResult { id: string; title: string; url: string; source: string; snippet: string; publishedAt?: string; sourceType: string; }
export interface ExtractedSource extends SearchResult { text: string; date?: string; }
export interface EvidenceRecord { id: string; sourceId: string; kind: EvidenceKind; confidence: number; title: string; snippet: string; url: string; source: string; verified: boolean; inference?: string; }
export interface PipelineRun { id: string; request: ResearchRequest; mode: ResearchMode; stage: ResearchStage; progress: number; message: string; queries: SearchQuery[]; sources: ExtractedSource[]; evidence: EvidenceRecord[]; report?: ValidationReport; error?: string; createdAt: string; updatedAt: string; }
