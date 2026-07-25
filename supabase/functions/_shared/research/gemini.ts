import { GoogleGenAI } from "@google/genai";
import { type CostBudget, incrementMetrics, recordModelCall, wait } from "./pipeline-utils.ts";
import { getEnv } from "./environment.ts";

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash" as const;
export const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
export const GEMINI_TIMEOUT_MS = 105_000;
// Durable queue attempts own retry behavior. Retrying inside an Edge request can
// outlive its visibility lease and duplicate provider spend.
export const GEMINI_MAX_RETRIES = 0;
export const GEMINI_PRICING_VERSION = "gemini-estimate-v1-2026-07-25" as const;
export const GEMINI_GROUNDING_MODES = ["required", "optional", "disabled"] as const;
export type GeminiGroundingMode = (typeof GEMINI_GROUNDING_MODES)[number];

export function getGeminiGroundingMode(): GeminiGroundingMode {
  const configured = getEnv("GEMINI_GROUNDING_MODE")?.trim().toLowerCase() || "optional";
  if (!GEMINI_GROUNDING_MODES.includes(configured as GeminiGroundingMode)) {
    throw new Error(`GEMINI_GROUNDING_MODE must be one of: ${GEMINI_GROUNDING_MODES.join(", ")}.`);
  }
  return configured as GeminiGroundingMode;
}

export interface GeminiQuotaDetails {
  metric: string | null;
  limit: number | null;
  retryDelayMs: number | null;
  dailyExhausted: boolean;
}

export class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly errorClass: "transient" | "timeout" | "permanent" | "quota",
    readonly quota: GeminiQuotaDetails | null = null,
  ) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

export interface GeminiModelConfig {
  research: string;
  synthesis: string;
}

export interface GeminiDiagnostic {
  geminiKeyPresent: boolean;
  configuredModels: GeminiModelConfig;
  modelChecks: Array<{ model: string; success: boolean }>;
  googleSearchGroundingMetadata: boolean;
}

export function getGeminiModelConfig(): GeminiModelConfig {
  return {
    research: getEnv("GEMINI_RESEARCH_MODEL")?.trim() || DEFAULT_GEMINI_MODEL,
    synthesis: getEnv("GEMINI_SYNTHESIS_MODEL")?.trim() || DEFAULT_GEMINI_MODEL,
  };
}

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
  model?: string;
  bypassCache?: boolean;
}
export interface GeminiResult { text: string; parsed?: unknown; groundingSources: GroundingSource[]; }
export interface GeminiGenerator {
  generate(args: GeminiCallArgs): Promise<GeminiResult>;
  diagnose(args: Omit<GeminiCallArgs, "taskType" | "prompt">): Promise<GeminiDiagnostic>;
  verifyConfiguration(args: Omit<GeminiCallArgs, "taskType" | "prompt">): Promise<GeminiDiagnostic>;
  verifySynthesisConfiguration(args: Omit<GeminiCallArgs, "taskType" | "prompt">): Promise<GeminiModelConfig>;
}

type GenerateResponse = {
  text?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  candidates?: Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> } }>;
};

export class GeminiClient implements GeminiGenerator {
  private readonly ai: GoogleGenAI;
  private readonly keyPresent: boolean;

  constructor(apiKey = getEnv("GEMINI_API_KEY")) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is missing from the server environment.");
    this.keyPresent = true;
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generate(args: GeminiCallArgs): Promise<GeminiResult> {
    const models = getGeminiModelConfig();
    const model = args.model || (args.useGrounding ? models.research : models.synthesis);
    const promptHash = await sha256(JSON.stringify({
      model,
      systemInstruction: args.systemInstruction ?? "",
      useGrounding: Boolean(args.useGrounding),
      responseSchema: args.responseSchema ?? null,
      prompt: args.prompt,
    }));
    const cached = args.bypassCache ? null : await this.readCache(args, promptHash, model);
    if (cached) return cached;

    const interactionId = `gemini-${crypto.randomUUID()}`;
    let lastError: unknown;
    for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
      const started = new Date();
      try {
        const response = await withTimeout(
          this.ai.models.generateContent({
            model,
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
        await this.logUsage(args, model, interactionId, attempt, started, new Date(), "success", cost, inputTokens, outputTokens, groundingSources.length > 0, null, null);
        if (!args.bypassCache) await this.writeCache(args, promptHash, model, text, groundingSources);
        return { text, parsed, groundingSources };
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const quota = parseGeminiQuotaError(message);
        const errorClass = quota ? "quota" : classifyError(message);
        await this.logUsage(args, model, interactionId, attempt, started, new Date(), "failed", 0, 0, 0, false, errorClass, message, quota);
        const wrapped = new GeminiRequestError(message, errorClass, quota);
        if (errorClass === "permanent" || quota?.dailyExhausted || attempt === GEMINI_MAX_RETRIES) throw wrapped;
        await wait((/429|quota/i.test(message) ? 5_000 : 1_000) * (2 ** attempt) + Math.random() * 250);
      }
    }
    throw lastError;
  }

  async diagnose(args: Omit<GeminiCallArgs, "taskType" | "prompt">): Promise<GeminiDiagnostic> {
    const configuredModels = getGeminiModelConfig();
    const checks = new Map<string, boolean>();
    let googleSearchGroundingMetadata = false;
    try {
      const result = await this.generate({
        ...args,
        taskType: "configuration_research",
        model: configuredModels.research,
        useGrounding: true,
        bypassCache: true,
        prompt: "Using Google Search, identify one official public source that states today's UTC date. Answer in one short sentence.",
      });
      checks.set(configuredModels.research, true);
      googleSearchGroundingMetadata = result.groundingSources.length > 0;
    } catch {
      checks.set(configuredModels.research, false);
    }
    try {
      await this.generate({
        ...args,
        taskType: "configuration_synthesis",
        model: configuredModels.synthesis,
        useGrounding: false,
        bypassCache: true,
        prompt: "Reply with exactly: OK",
      });
      checks.set(configuredModels.synthesis, (checks.get(configuredModels.synthesis) ?? true) && true);
    } catch {
      checks.set(configuredModels.synthesis, false);
    }
    return {
      geminiKeyPresent: this.keyPresent,
      configuredModels,
      modelChecks: [...checks].map(([model, success]) => ({ model, success })),
      googleSearchGroundingMetadata,
    };
  }

  async verifyConfiguration(args: Omit<GeminiCallArgs, "taskType" | "prompt">): Promise<GeminiDiagnostic> {
    const diagnostic = await this.diagnose(args);
    const unavailable = diagnostic.modelChecks.filter((check) => !check.success).map((check) => check.model);
    if (unavailable.length) {
      throw new Error(`Gemini configuration error: configured model(s) unavailable: ${unavailable.join(", ")}.`);
    }
    if (!diagnostic.googleSearchGroundingMetadata) {
      throw new Error("Gemini configuration error: Google Search grounding returned no metadata.");
    }
    return diagnostic;
  }

  async verifySynthesisConfiguration(args: Omit<GeminiCallArgs, "taskType" | "prompt">): Promise<GeminiModelConfig> {
    const configuredModels = getGeminiModelConfig();
    await this.generate({
      ...args,
      taskType: "configuration_synthesis",
      model: configuredModels.synthesis,
      useGrounding: false,
      bypassCache: true,
      prompt: "Reply with exactly: OK",
    });
    return configuredModels;
  }

  private async readCache(args: GeminiCallArgs, promptHash: string, model: string): Promise<GeminiResult | null> {
    const { data, error } = await args.db.from("gemini_cache").select("response_text,grounding_sources")
      .eq("run_id", args.runId).eq("prompt_hash", promptHash).eq("model", model).maybeSingle();
    if (error || !data?.response_text) return null;
    try {
      const parsed = args.responseSchema ? JSON.parse(data.response_text) : undefined;
      await incrementMetrics(args.runId, args.db, { cache_hits: 1 });
      return { text: data.response_text, parsed, groundingSources: normalizeCachedSources(data.grounding_sources) };
    } catch { return null; }
  }

  private async writeCache(args: GeminiCallArgs, promptHash: string, model: string, text: string, sources: GroundingSource[]) {
    const { error } = await args.db.from("gemini_cache").upsert({
      run_id: args.runId, prompt_hash: promptHash, model,
      response_text: text, grounding_sources: sources,
    }, { onConflict: "run_id,prompt_hash,model" });
    if (error) console.warn("Gemini cache write failed", { runId: args.runId, message: error.message });
  }

  private async logUsage(
    args: GeminiCallArgs, model: string, interactionId: string, retryCount: number, start: Date, end: Date,
    status: "success" | "failed", cost: number, inputTokens: number, outputTokens: number,
    groundingMetadataPresent: boolean,
    errorClass: string | null, errorMessage: string | null,
    quota: GeminiQuotaDetails | null = null,
  ) {
    const durationMs = end.getTime() - start.getTime();
    const { error } = await args.db.from("api_usage_logs").insert({
      run_id: args.runId, provider: "gemini", operation: args.taskType, task_type: args.taskType,
      model, prompt_tokens: inputTokens, completion_tokens: outputTokens, cost, estimated_cost_usd: cost, status,
      error_message: errorMessage, start_time: start.toISOString(), end_time: end.toISOString(),
      duration_ms: durationMs, grounded_search_requested: Boolean(args.useGrounding),
      grounded_search_usage: groundingMetadataPresent ? 1 : 0,
      grounding_metadata_present: groundingMetadataPresent, cache_status: "miss",
      quota_metric: quota?.metric ?? null, quota_limit: quota?.limit ?? null,
      retry_delay_ms: quota?.retryDelayMs ?? null, pipeline_stage: args.taskType,
      grounding_degraded: Boolean(args.useGrounding && quota),
      pricing_version: GEMINI_PRICING_VERSION,
      retry_count: retryCount, error_class: errorClass, fallback_state: null, interaction_id: interactionId,
    });
    if (error) throw new Error(`Failed to persist Gemini usage: ${error.message}`);
    await incrementMetrics(args.runId, args.db, {
      provider_cost_usd: cost, provider_calls: 1,
      grounded_calls: args.useGrounding ? 1 : 0,
      input_tokens: inputTokens, output_tokens: outputTokens,
      retry_count: retryCount > 0 ? 1 : 0,
      cache_misses: 1, duration_ms: durationMs,
    });
    await recordModelCall(args.runId, args.db, model);
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
  // Internal estimate only. Provider pricing can change independently of this versioned configuration.
  return inputTokens / 1_000_000 * 0.075 + outputTokens / 1_000_000 * 0.30 + (grounded ? 0.035 : 0);
}

export function parseGeminiQuotaError(message: string): GeminiQuotaDetails | null {
  if (!/429|RESOURCE_EXHAUSTED|quota exceeded/i.test(message)) return null;
  const metricMatch = message.match(/Quota exceeded for metric:\s*([^,\s]+)/i);
  const limitMatch = message.match(/\blimit:\s*([0-9.]+)/i);
  const retryMatch = message.match(/"retryDelay"\s*:\s*"([0-9.]+)s"/i)
    || message.match(/retry in\s*([0-9.]+)s/i);
  const metric = metricMatch?.[1] || null;
  return {
    metric,
    limit: limitMatch ? Number(limitMatch[1]) : null,
    retryDelayMs: retryMatch ? Math.round(Number(retryMatch[1]) * 1_000) : null,
    dailyExhausted: /PerDay|per-project daily|requests per day/i.test(message)
      || Boolean(metric && /requests/i.test(metric) && /limit:\s*20/i.test(message)),
  };
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
