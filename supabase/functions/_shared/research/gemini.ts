import { GoogleGenAI } from "@google/genai";
import { type CostBudget, incrementMetrics, wait } from "./pipeline-utils.ts";
import { getEnv } from "./environment.ts";

export const GEMINI_MODEL = "gemini-2.5-flash" as const;
export const GEMINI_TIMEOUT_MS = 105_000;
// Durable queue attempts own retry behavior. Retrying inside an Edge request can
// outlive its visibility lease and duplicate provider spend.
export const GEMINI_MAX_RETRIES = 0;

export interface GroundingSource { url: string; title: string; }
export interface GeminiCallArgs {
  runId: string;
  taskType: string;
  prompt: string;
  systemInstruction?: string;
  useGrounding?: boolean;
  responseSchema?: Record<string, unknown>;
  budget: CostBudget;
  db: any;
}
export interface GeminiResult { text: string; parsed?: unknown; groundingSources: GroundingSource[]; }
export interface GeminiGenerator { generate(args: GeminiCallArgs): Promise<GeminiResult>; }

type GenerateResponse = {
  text?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } }>;
};

export class GeminiClient implements GeminiGenerator {
  private readonly ai: GoogleGenAI;

  constructor(apiKey = getEnv("GEMINI_API_KEY")) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing from the server environment.");
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(args: GeminiCallArgs): Promise<GeminiResult> {
    const promptHash = await sha256(JSON.stringify({
      model: GEMINI_MODEL,
      systemInstruction: args.systemInstruction ?? "",
      useGrounding: Boolean(args.useGrounding),
      responseSchema: args.responseSchema ?? null,
      prompt: args.prompt,
    }));
    const cached = await this.readCache(args, promptHash);
    if (cached) return cached;

    const interactionId = `gemini-${crypto.randomUUID()}`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      const started = new Date();
      try {
        const response = await withTimeout(
          this.ai.models.generateContent({
            model: GEMINI_MODEL,
            contents: args.prompt,
            config: {
              temperature: 0.1,
              maxOutputTokens: 8_192,
              // Structured extraction does not benefit from hidden reasoning,
              // and thinking tokens share the output budget on Gemini 2.5.
              ...(args.responseSchema ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
              ...(args.useGrounding ? { tools: [{ googleSearch: {} }] } : {}),
              ...(args.systemInstruction ? { systemInstruction: args.systemInstruction } : {}),
              ...(args.responseSchema ? { responseMimeType: "application/json", responseSchema: args.responseSchema } : {}),
            },
          }) as Promise<GenerateResponse>,
          GEMINI_TIMEOUT_MS,
        );
        const text = response.text ?? "";
        if (!text.trim()) throw new Error("Gemini returned an empty response.");
        const parsed = args.responseSchema ? JSON.parse(text) : undefined;
        const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
        const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
        const groundingSources = parseGroundingSources(response);
        const cost = estimateCost(inputTokens, outputTokens, Boolean(args.useGrounding));
        args.budget.reserve(cost);
        await this.logUsage(args, interactionId, attempt, started, new Date(), "success", cost, inputTokens, outputTokens, null, null);
        await this.writeCache(args, promptHash, text, groundingSources);
        return { text, parsed, groundingSources };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const errorClass = classifyError(message);
        await this.logUsage(args, interactionId, attempt, started, new Date(), "failed", 0, 0, 0, errorClass, message);
        if (errorClass === "permanent" || attempt === GEMINI_MAX_RETRIES) throw error;
        await wait((/429|quota/i.test(message) ? 5_000 : 1_000) * (2 ** attempt) + Math.random() * 250);
      }
    }
    throw lastError;
  }

  private async readCache(args: GeminiCallArgs, promptHash: string): Promise<GeminiResult | null> {
    const { data, error } = await args.db.from("gemini_cache").select("response_text,grounding_sources")
      .eq("run_id", args.runId).eq("prompt_hash", promptHash).eq("model", GEMINI_MODEL).maybeSingle();
    if (error || !data?.response_text) return null;
    try {
      const parsed = args.responseSchema ? JSON.parse(data.response_text) : undefined;
      await incrementMetrics(args.runId, args.db, { cache_hits: 1 });
      return { text: data.response_text, parsed, groundingSources: normalizeCachedSources(data.grounding_sources) };
    } catch { return null; }
  }

  private async writeCache(args: GeminiCallArgs, promptHash: string, text: string, sources: GroundingSource[]) {
    const { error } = await args.db.from("gemini_cache").upsert({
      run_id: args.runId, prompt_hash: promptHash, model: GEMINI_MODEL,
      response_text: text, grounding_sources: sources,
    }, { onConflict: "run_id,prompt_hash,model" });
    if (error) console.warn("Gemini cache write failed", { runId: args.runId, message: error.message });
  }

  private async logUsage(
    args: GeminiCallArgs, interactionId: string, retryCount: number, start: Date, end: Date,
    status: "success" | "failed", cost: number, inputTokens: number, outputTokens: number,
    errorClass: string | null, errorMessage: string | null,
  ) {
    const { error } = await args.db.from("api_usage_logs").insert({
      run_id: args.runId, provider: "gemini", operation: args.taskType, task_type: args.taskType,
      model: GEMINI_MODEL, prompt_tokens: inputTokens, completion_tokens: outputTokens, cost, status,
      error_message: errorMessage, start_time: start.toISOString(), end_time: end.toISOString(),
      grounded_search_usage: args.useGrounding && status === "success" ? 1 : 0,
      retry_count: retryCount, error_class: errorClass, fallback_state: null, interaction_id: interactionId,
    });
    if (error) throw new Error(`Failed to persist Gemini usage: ${error.message}`);
    await incrementMetrics(args.runId, args.db, {
      provider_cost_usd: cost, provider_calls: 1,
      grounded_calls: args.useGrounding && status === "success" ? 1 : 0,
      duration_ms: end.getTime() - start.getTime(),
    });
  }
}

export function parseGroundingSources(response: GenerateResponse): GroundingSource[] {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const unique = new Map<string, GroundingSource>();
  for (const chunk of chunks) {
    const url = chunk.web?.uri?.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    unique.set(url, { url, title: chunk.web?.title?.trim() || new URL(url).hostname });
  }
  return [...unique.values()];
}

function normalizeCachedSources(value: unknown): GroundingSource[] {
  return Array.isArray(value) ? value.filter((item): item is GroundingSource =>
    Boolean(item && typeof item === "object" && typeof item.url === "string" && typeof item.title === "string")) : [];
}

function estimateCost(inputTokens: number, outputTokens: number, grounded: boolean) {
  return inputTokens / 1_000_000 * 0.075 + outputTokens / 1_000_000 * 0.30 + (grounded ? 0.035 : 0);
}

function classifyError(message: string): "transient" | "timeout" | "permanent" {
  if (/timeout/i.test(message)) return "timeout";
  if (/401|403|api key|invalid argument|bad request|schema/i.test(message)) return "permanent";
  return "transient";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms.`)), timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}
