import { ExtractedSource, SearchQuery, SearchResult } from "./types";

export interface SearchProvider { name: string; search(queries: SearchQuery[], context: { ideaName: string; targetCustomer: string; marketType: string }): Promise<SearchResult[]>; }
export interface PageExtractor { name: string; extract(results: SearchResult[]): Promise<ExtractedSource[]>; }
export interface StructuredAnalysisProvider { name: string; analyze(input: { ideaName: string; ideaDescription: string; targetCustomer: string; marketType: string; targetRegion: string; evidence: Array<{ id: string; kind: string; snippet: string; source: string; url: string; confidence: number }> }): Promise<unknown>; }

export class MockSearchProvider implements SearchProvider { name = "mock-search"; async search(queries: SearchQuery[]) { return queries.map((q, index): SearchResult => ({ id: `source-${index + 1}`, title: `${q.category} signal for ${q.query}`, url: `https://mock.buildsignal.local/source/${index + 1}`, source: index % 3 === 0 ? "Reddit (mock)" : index % 3 === 1 ? "G2 (mock)" : "Competitor pricing page (mock)", snippet: q.category === "complaint" ? `Operators describe repeated friction with ${q.query}; the workaround is costly and still leaves uncertainty.` : q.category === "pricing" ? `Adjacent products charge for this workflow, suggesting an existing budget anchor worth validating.` : `A focused opportunity may exist around ${q.query}, but this signal needs direct buyer confirmation.`, publishedAt: "2026-07-11", sourceType: q.category })); } }
export class MockPageExtractor implements PageExtractor { name = "mock-extractor"; async extract(results: SearchResult[]) { return results.map(result => ({ ...result, text: result.snippet, date: result.publishedAt })); } }
export class MockStructuredAnalysisProvider implements StructuredAnalysisProvider { name = "mock-llm"; async analyze(input: Parameters<StructuredAnalysisProvider["analyze"]>[0]) { return { provider: this.name, evidenceIds: input.evidence.map(e => e.id), assumptions: ["Mock analysis is a decision aid, not a forecast.", "Pricing and demand should be confirmed with paid conversations."], supported: true }; } }

export function createSearchProvider(): SearchProvider { return process.env.TAVILY_API_KEY ? new MockSearchProvider() : new MockSearchProvider(); }
export function createPageExtractor(): PageExtractor { return new MockPageExtractor(); }
export function createAnalysisProvider(): StructuredAnalysisProvider { return new MockStructuredAnalysisProvider(); }
