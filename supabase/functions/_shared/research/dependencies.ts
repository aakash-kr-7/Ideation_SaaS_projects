/** Narrow external I/O contracts used by the staged research executors. */
import type { z } from "zod";
import type { SearchResult } from "./types.ts";
import type { EmbeddingProvider, ReasoningProvider } from "./providers.ts";
import { createAnalysisProvider, createEmbeddingProvider, createPageExtractor, createSearchProvider } from "./providers.ts";
import { TavilyDiscoveryAdapter, BraveDiscoveryAdapter, CommonCrawlDiscoveryAdapter, SitemapRssDiscoveryAdapter, discoverWithAvailableProviders } from "./discovery.ts";
import { retrieveWithLadder } from "./retrieval.ts";
import { callProvider } from "./pipeline-utils.ts";

export interface DiscoveryRequest { query: string; family: string; pass: number; }
export interface DiscoveryProvider { name: string; discover(request: DiscoveryRequest): Promise<SearchResult[]>; }
export interface ExtractionProvider { name: string; extract(url: string): Promise<string>; }
export interface StorageProvider { upload(path: string, bytes: Uint8Array, options: { contentType: string; upsert: boolean }): Promise<{ path: string }>; }
export interface StructuredReasoningProvider {
  generate<T extends z.ZodTypeAny>(args: { runId: string; operation: string; systemPrompt: string; userPrompt: string; schema: T; db: any; budget: any; }): Promise<z.output<T>>;
  extractEvidence(args: { runId: string; operation: string; idea: string; customer: string; chunk: string; context: { family: "problem" | "solution"; pass: 1 | 2 | 3; objective: string }; db: any; budget: any; }): Promise<Awaited<ReturnType<ReasoningProvider["extractEvidence"]>>>;
}
export interface ResearchDependencies { discovery: DiscoveryProvider; extraction: ExtractionProvider; embeddings: EmbeddingProvider; reasoning: StructuredReasoningProvider; storage: StorageProvider; }

export function createProductionDependencies(db: any): ResearchDependencies {
  const search = createSearchProvider();
  const extractor = createPageExtractor();
  const groq = createAnalysisProvider(false);
  const cerebras = createAnalysisProvider(true);
  return {
    discovery: { name: "discovery", discover: (request) => discoverWithAvailableProviders([new TavilyDiscoveryAdapter(search), new BraveDiscoveryAdapter(), new CommonCrawlDiscoveryAdapter(), new SitemapRssDiscoveryAdapter()], request) },
    extraction: { name: "retrieval", async extract(url) { return (await retrieveWithLadder(url, extractor)).text; } },
    embeddings: createEmbeddingProvider(),
    reasoning: {
      async generate({ runId, operation, systemPrompt, userPrompt, schema, budget }) {
        try { return await callProvider(runId, groq, operation, budget, db, () => groq.generateStructured(systemPrompt, userPrompt, schema)); }
        catch (groqError) {
          try { return await callProvider(runId, cerebras, operation, budget, db, () => cerebras.generateStructured(systemPrompt, userPrompt, schema)); }
          catch (cerebrasError) { throw new StructuredReasoningError(groqError, cerebrasError); }
        }
      },
      async extractEvidence({ runId, operation, idea, customer, chunk, context, budget }) {
        try { return await callProvider(runId, groq, operation, budget, db, () => groq.extractEvidence(idea, customer, chunk, context)); }
        catch (groqError) {
          try { return await callProvider(runId, cerebras, operation, budget, db, () => cerebras.extractEvidence(idea, customer, chunk, context)); }
          catch (cerebrasError) { throw new StructuredReasoningError(groqError, cerebrasError); }
        }
      },
    },
    storage: { async upload(path, bytes, options) { const { error } = await db.storage.from("exports").upload(path, bytes, options); if (error) throw error; return { path }; } },
  };
}

export class StructuredReasoningError extends Error {
  constructor(readonly groqError: unknown, readonly cerebrasError: unknown) { super(`Structured reasoning failed: Groq=${String(groqError)}; Cerebras=${String(cerebrasError)}`); this.name = "StructuredReasoningError"; }
}
