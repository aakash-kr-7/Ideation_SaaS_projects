import { z } from "zod";
import type { SearchResult } from "./types.ts";

declare const Deno: any;
export function getEnv(key: string): string | undefined {
  if (typeof Deno !== "undefined" && Deno.env) {
    try {
      return Deno.env.get(key);
    } catch {
      return undefined;
    }
  }
  if (typeof process !== "undefined" && process.env) return process.env[key];
  return undefined;
}

function providerRequestSignal() {
  const timeoutMs = Number(getEnv("PROVIDER_REQUEST_TIMEOUT_MS") || "30000");
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("PROVIDER_REQUEST_TIMEOUT_MS must be positive.");
  }
  return AbortSignal.timeout(timeoutMs);
}

export const evidenceItemLLMSchema = z.object({
  title: z.string().min(1),
  snippet: z.string().min(1),
  signal_type: z.enum(["Pain", "Demand", "Pricing", "Risk"]),
  strength: z.enum(["High", "Medium", "Low"]),
  rationale: z.string().min(1),
  pain_point: z.string().min(1),
  author: z.string().nullable().default(null),
  named_entities: z.array(z.string().min(2)).max(8).default([]),
  disconfirming: z.boolean().default(false),
  market_size_metric: z.enum(["TAM", "SAM", "SOM", "MarketSize", "None"]).default("None"),
  market_size_figure: z.string().nullable().default(null),
});
export const evidenceListLLMSchema = z.object({
  evidence: z.array(evidenceItemLLMSchema),
});

export interface ProviderUsage {
  prompt?: number;
  completion?: number;
}
export interface SearchProvider {
  name: string;
  lastUsage?: ProviderUsage;
  search(query: string): Promise<SearchResult[]>;
}
export interface PageExtractor {
  name: string;
  lastUsage?: ProviderUsage;
  extract(url: string): Promise<string>;
}
export interface EmbeddingProvider {
  name: string;
  lastUsage?: ProviderUsage;
  embed(texts: string[]): Promise<number[][]>;
}
export interface ReasoningProvider {
  name: string;
  lastUsage?: ProviderUsage;
  extractEvidence(
    idea: string,
    customer: string,
    chunk: string,
    context?: { family: "problem" | "solution"; pass: 1 | 2 | 3; objective: string },
  ): Promise<z.infer<typeof evidenceListLLMSchema>>;
  generateStructured<TSchema extends z.ZodTypeAny>(
    systemPrompt: string,
    userPrompt: string,
    schema: TSchema,
  ): Promise<z.output<TSchema>>;
}

export class TavilySearchProvider implements SearchProvider {
  name = "tavily";
  constructor(private apiKey: string) {}
  async search(query: string): Promise<SearchResult[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      signal: providerRequestSignal(),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        search_depth: "basic",
        max_results: 5,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Tavily search request failed: ${response.status} ${response.statusText}`,
      );
    }
    const data = await response.json();
    return (data.results || []).map((r: any, idx: number) => ({
      id: `tav-${idx}-${Date.now()}`,
      title: r.title || "Untitled source",
      url: r.url || "",
      source: new URL(r.url).hostname.replace("www.", "") || "web",
      snippet: r.content || "",
      publishedAt: new Date().toISOString(),
      sourceType: "web",
    }));
  }
}

export class FirecrawlExtractor implements PageExtractor {
  name = "firecrawl";
  constructor(private apiKey: string) {}
  async extract(url: string): Promise<string> {
    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      signal: providerRequestSignal(),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, formats: ["markdown"] }),
    });
    if (!response.ok) {
      throw new Error(
        `Firecrawl scrape request failed: ${response.status} ${response.statusText}`,
      );
    }
    const res = await response.json();
    if (!res.success || !res.data?.markdown) {
      throw new Error(
        `Firecrawl failed to scrape: ${res.error || "unknown error"}`,
      );
    }
    return res.data.markdown;
  }
}

export class CohereEmbeddingProvider implements EmbeddingProvider {
  name = "cohere";
  lastUsage?: ProviderUsage;
  constructor(private apiKey: string) {}
  async embed(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const response = await fetch("https://api.cohere.com/v1/embed", {
      method: "POST",
      signal: providerRequestSignal(),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        texts,
        model: "embed-english-v3.0",
        input_type: "search_document",
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Cohere embedding request failed: ${response.status} ${response.statusText}`,
      );
    }
    const data = await response.json();
    this.lastUsage = { prompt: data.meta?.billed_units?.input_tokens };
    if (!Array.isArray(data.embeddings)) {
      throw new Error("Invalid Cohere embeddings response.");
    }
    return data.embeddings;
  }
}

abstract class OpenAICompatibleReasoningProvider implements ReasoningProvider {
  abstract name: string;
  abstract endpoint: string;
  abstract model: string;
  lastUsage?: ProviderUsage;
  constructor(
    protected apiKey: string,
    protected maxCompletionTokens = 2048,
  ) {
    if (!Number.isInteger(maxCompletionTokens) || maxCompletionTokens <= 0) {
      throw new Error(
        "REASONING_MAX_COMPLETION_TOKENS must be a positive integer.",
      );
    }
  }
  protected extraHeaders(): Record<string, string> {
    return {};
  }
  async generateStructured<TSchema extends z.ZodTypeAny>(
    systemPrompt: string,
    userPrompt: string,
    schema: TSchema,
  ): Promise<z.output<TSchema>> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      signal: providerRequestSignal(),
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        ...this.extraHeaders(),
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "system", content: systemPrompt }, {
          role: "user",
          content: userPrompt,
        }],
        temperature: 0.1,
        max_completion_tokens: this.maxCompletionTokens,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `${this.name} reasoning request failed: ${response.status} ${response.statusText}`,
      );
    }
    const res = await response.json();
    this.lastUsage = {
      prompt: res.usage?.prompt_tokens,
      completion: res.usage?.completion_tokens,
    };
    const content = res.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`Empty message content returned from ${this.name}`);
    }
    return schema.parse(JSON.parse(content));
  }
  async extractEvidence(
    idea: string,
    customer: string,
    chunk: string,
    context: { family: "problem" | "solution"; pass: 1 | 2 | 3; objective: string } = { family: "problem", pass: 1, objective: "broad" },
  ) {
    return this.generateStructured(
      `Extract only concrete evidence from the supplied source for startup idea "${idea}" and target customer "${customer}". This source was retrieved in ${context.family}-space research pass ${context.pass} with objective ${context.objective}. Never invent, score, or infer a market-size number. snippet must be a verbatim excerpt. pain_point is a short normalized label for the underlying pain, workaround, objection, or competitive fact. author is the visible individual reviewer/post author, otherwise null. named_entities contains only explicitly named companies/products/communities. disconfirming is true only when the excerpt argues against demand, shows failure/shutdown/saturation, rejects payment, or shows an incumbent already solving the exact job well. market_size_metric is TAM, SAM, SOM, or MarketSize only when the excerpt itself states a numeric figure and names its source; market_size_figure must then preserve that stated figure, otherwise use None and null. Return JSON: {"evidence":[{"title":"...","snippet":"verbatim excerpt","signal_type":"Pain|Demand|Pricing|Risk","strength":"High|Medium|Low","rationale":"...","pain_point":"...","author":null,"named_entities":[],"disconfirming":false,"market_size_metric":"None","market_size_figure":null}]}.`,
      chunk,
      evidenceListLLMSchema,
    );
  }
}

export class GroqReasoningProvider extends OpenAICompatibleReasoningProvider {
  name = "groq";
  endpoint = "https://api.groq.com/openai/v1/chat/completions";
  model = "llama-3.3-70b-versatile";
}
export class CerebrasReasoningProvider
  extends OpenAICompatibleReasoningProvider {
  name = "cerebras";
  endpoint = "https://api.cerebras.ai/v1/chat/completions";
  model: string;
  constructor(
    apiKey: string,
    model = "gpt-oss-120b",
    maxCompletionTokens = 2048,
  ) {
    super(apiKey, maxCompletionTokens);
    this.model = model;
  }
}

function reasoningMaxCompletionTokens() {
  return Number(getEnv("REASONING_MAX_COMPLETION_TOKENS") || "2048");
}

function normalizedSecret(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const first = trimmed[0], last = trimmed[trimmed.length - 1];
  return (first === '"' && last === '"') || (first === "'" && last === "'")
    ? trimmed.slice(1, -1)
    : trimmed;
}

export function createSearchProvider(): SearchProvider {
  const key = getEnv("TAVILY_API_KEY");
  if (!key) {
    throw new Error(
      "TAVILY_API_KEY is required; simulated search is disabled.",
    );
  }
  return new TavilySearchProvider(key);
}
export function createPageExtractor(): PageExtractor {
  const key = getEnv("FIRECRAWL_API_KEY");
  if (!key) {
    throw new Error(
      "FIRECRAWL_API_KEY is required; simulated extraction is disabled.",
    );
  }
  return new FirecrawlExtractor(key);
}
export function createEmbeddingProvider(): EmbeddingProvider {
  const key = getEnv("COHERE_API_KEY");
  if (!key) {
    throw new Error(
      "COHERE_API_KEY is required; simulated embeddings are disabled.",
    );
  }
  return new CohereEmbeddingProvider(key);
}
export function createAnalysisProvider(
  useFallback = false,
  maxCompletionTokens = reasoningMaxCompletionTokens(),
): ReasoningProvider {
  const groq = normalizedSecret(getEnv("GROQ_API_KEY")),
    cerebras = normalizedSecret(getEnv("CEREBRAS_API_KEY"));
  if (useFallback) {
    if (!cerebras) {
      throw new Error("CEREBRAS_API_KEY is required for reasoning fallback.");
    }
    return new CerebrasReasoningProvider(
      cerebras,
      getEnv("CEREBRAS_MODEL") || "gpt-oss-120b",
      maxCompletionTokens,
    );
  }
  if (!groq) {
    throw new Error(
      "GROQ_API_KEY is required; simulated reasoning is disabled.",
    );
  }
  return new GroqReasoningProvider(groq, maxCompletionTokens);
}
