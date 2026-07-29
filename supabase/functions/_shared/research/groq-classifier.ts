import { getEnv } from "./environment.ts";
import { incrementMetrics, recordModelCall } from "./pipeline-utils.ts";
import { persistResearchCallMetric } from "./research-call-metrics.ts";
import type { CanonicalResearchBrief } from "./research-brief.ts";

export interface SecondModelClassification {
  claimFingerprint: string;
  evidenceRole: "supporting" | "challenging" | "mixed" | "unclear";
  semanticAlignment: "direct" | "contextual" | "adjacent" | "unclear";
  confidence: number;
}

export interface OptionalGroqAdversarialReview {
  available: boolean;
  concerns: Array<{
    claimFingerprint: string;
    concern: string;
    material: boolean;
  }>;
  disagreements: Array<{
    claimFingerprint: string;
    codeRole: string;
    groqRole: string;
  }>;
  failure?: string;
}

export async function classifyWithOptionalGroq(args: {
  runId: string;
  db: any;
  brief: CanonicalResearchBrief;
  claims: Array<{
    fingerprint: string;
    title?: string;
    snippet?: string;
    sourceId?: string;
  }>;
}): Promise<Map<string, SecondModelClassification>> {
  const apiKey = getEnv("GROQ_API_KEY");
  const enabled = getEnv("GROQ_CLASSIFICATION_ENABLED")?.toLowerCase();
  if (!apiKey || enabled === "false" || !args.claims.length) return new Map();
  const model = getEnv("GROQ_CLASSIFICATION_MODEL") ||
    "llama-3.3-70b-versatile";
  const startedAt = Date.now();
  const taskType = "optional_groq_evidence_classification";
  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Classify only the supplied accepted evidence. Do not add facts, sources, scores, recommendations, or official evidence states. Return JSON with a classifications array.",
            },
            {
              role: "user",
              content: JSON.stringify({
                canonicalBrief: args.brief,
                claims: args.claims.map((claim) => ({
                  claimFingerprint: claim.fingerprint,
                  sourceId: claim.sourceId,
                  title: claim.title,
                  excerpt: claim.snippet,
                })),
                requiredShape: {
                  classifications: [{
                    claimFingerprint: "string",
                    evidenceRole:
                      "supporting|challenging|mixed|unclear",
                    semanticAlignment: "direct|contextual|adjacent|unclear",
                    confidence: "number 0..1",
                  }],
                },
              }).slice(0, 28_000),
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.message || `Groq ${response.status}`);
    }
    const parsed = JSON.parse(body.choices?.[0]?.message?.content || "{}") as {
      classifications?: Array<Record<string, unknown>>;
    };
    const allowed = new Set(args.claims.map((claim) => claim.fingerprint));
    const classifications = (parsed.classifications || []).flatMap((item) => {
      const claimFingerprint = String(item.claimFingerprint || "");
      const evidenceRole = String(item.evidenceRole || "");
      const semanticAlignment = String(item.semanticAlignment || "");
      const confidence = Number(item.confidence);
      return allowed.has(claimFingerprint) &&
          ["supporting", "challenging", "mixed", "unclear"].includes(
            evidenceRole,
          ) &&
          ["direct", "contextual", "adjacent", "unclear"].includes(
            semanticAlignment,
          ) &&
          Number.isFinite(confidence)
        ? [{
          claimFingerprint,
          evidenceRole:
            evidenceRole as SecondModelClassification["evidenceRole"],
          semanticAlignment:
            semanticAlignment as SecondModelClassification["semanticAlignment"],
          confidence: Math.max(0, Math.min(1, confidence)),
        }]
        : [];
    });
    const durationMs = Date.now() - startedAt;
    const promptTokens = Number(body.usage?.prompt_tokens || 0);
    const completionTokens = Number(body.usage?.completion_tokens || 0);
    await args.db.from("api_usage_logs").insert({
      run_id: args.runId,
      provider: "groq",
      operation: taskType,
      task_type: taskType,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost: 0,
      estimated_cost_usd: 0,
      status: "success",
      start_time: new Date(startedAt).toISOString(),
      end_time: new Date().toISOString(),
      duration_ms: durationMs,
      grounded_search_requested: false,
      grounded_search_usage: 0,
      grounding_metadata_present: false,
      cache_status: "miss",
      pipeline_stage: "validate_normalize",
      pricing_version: "unpriced-optional-classification-v1",
      retry_count: 0,
    });
    await incrementMetrics(args.runId, args.db, {
      provider_calls: 1,
      input_tokens: promptTokens,
      output_tokens: completionTokens,
      cache_misses: 1,
      duration_ms: durationMs,
    });
    await recordModelCall(args.runId, args.db, model);
    await persistResearchCallMetric(args.db, {
      runId: args.runId,
      callPurpose: "optional_second_model_classification",
      queryFamily: taskType,
      grounded: false,
      provider: "groq",
      model,
      sourcesAccepted: args.claims.length,
      durationMs,
      metadata: {
        classificationsReturned: classifications.length,
        authoritative: false,
      },
    });
    return new Map(
      classifications.map((item) => [item.claimFingerprint, item]),
    );
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const quotaFailure = /429|quota|resource_exhausted/i.test(
      error instanceof Error ? error.message : String(error),
    );
    await persistResearchCallMetric(args.db, {
      runId: args.runId,
      callPurpose: "optional_second_model_classification",
      queryFamily: taskType,
      grounded: false,
      provider: "groq",
      model,
      durationMs,
      quotaFailure,
      metadata: {
        nonBlockingFailure: true,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return new Map();
  }
}

export async function reviewWithOptionalGroq(args: {
  runId: string;
  db: any;
  brief: CanonicalResearchBrief;
  claims: Array<{
    fingerprint: string;
    title: string;
    snippet: string;
    codeRole: "supporting" | "challenging";
  }>;
  risks: Array<{ category: string; severity: string; description: string }>;
  fetcher?: typeof fetch;
}): Promise<OptionalGroqAdversarialReview> {
  const apiKey = getEnv("GROQ_API_KEY");
  const enabled = getEnv("GROQ_CLASSIFICATION_ENABLED")?.toLowerCase();
  if (!apiKey || enabled === "false" || !args.claims.length) {
    return { available: false, concerns: [], disagreements: [] };
  }
  return runOptionalGroqAdversarialReview(args, apiKey, args.fetcher ?? fetch);
}

export async function runOptionalGroqAdversarialReview(
  args: {
    runId: string;
    db: any;
    brief: CanonicalResearchBrief;
    claims: Array<{
      fingerprint: string;
      title: string;
      snippet: string;
      codeRole: "supporting" | "challenging";
    }>;
    risks: Array<{ category: string; severity: string; description: string }>;
  },
  apiKey: string,
  fetcher: typeof fetch,
): Promise<OptionalGroqAdversarialReview> {
  const model = getEnv("GROQ_ADVERSARIAL_MODEL") ||
    getEnv("GROQ_CLASSIFICATION_MODEL") || "llama-3.3-70b-versatile";
  const startedAt = Date.now();
  const taskType = "optional_groq_adversarial_review";
  try {
    const response = await fetcher(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Review only supplied evidence and risks as a skeptical second classifier. Do not assign or infer any score, verdict, recommendation, or market size. Return JSON only.",
            },
            {
              role: "user",
              content: JSON.stringify({
                canonicalBrief: args.brief,
                claims: args.claims,
                risks: args.risks,
                requiredShape: {
                  concerns: [{
                    claimFingerprint: "string",
                    concern: "string",
                    material: "boolean",
                    evidenceRole: "supporting|challenging|mixed|unclear",
                  }],
                },
              }).slice(0, 28_000),
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    if (!response.ok) {
      throw new Error(body.error?.message || `Groq ${response.status}`);
    }
    const parsed = JSON.parse(body.choices?.[0]?.message?.content || "{}") as {
      concerns?: Array<Record<string, unknown>>;
    };
    const claims = new Map(args.claims.map((claim) => [
      claim.fingerprint,
      claim,
    ]));
    const concerns = (parsed.concerns || []).flatMap((item) => {
      const claimFingerprint = String(item.claimFingerprint || "");
      const concern = String(item.concern || "").trim();
      const evidenceRole = String(item.evidenceRole || "unclear");
      if (
        !claims.has(claimFingerprint) || !concern ||
        !["supporting", "challenging", "mixed", "unclear"].includes(
          evidenceRole,
        )
      ) return [];
      return [{
        claimFingerprint,
        concern,
        material: item.material === true,
        evidenceRole,
      }];
    });
    const disagreements = concerns.flatMap((item) => {
      const codeRole = claims.get(item.claimFingerprint)!.codeRole;
      return item.evidenceRole !== "unclear" &&
          item.evidenceRole !== "mixed" &&
          item.evidenceRole !== codeRole
        ? [{
          claimFingerprint: item.claimFingerprint,
          codeRole,
          groqRole: item.evidenceRole,
        }]
        : [];
    });
    const durationMs = Date.now() - startedAt;
    await persistResearchCallMetric(args.db, {
      runId: args.runId,
      callPurpose: "optional_second_model_adversarial_review",
      queryFamily: taskType,
      grounded: false,
      provider: "groq",
      model,
      sourcesAccepted: args.claims.length,
      durationMs,
      metadata: {
        nonAuthoritative: true,
        concernsReturned: concerns.length,
        disagreements: disagreements.length,
        scoreOrVerdictProvidedToGroq: false,
      },
    });
    return {
      available: true,
      concerns: concerns.map((item) => ({
        claimFingerprint: item.claimFingerprint,
        concern: item.concern,
        material: item.material,
      })),
      disagreements,
    };
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    await persistResearchCallMetric(args.db, {
      runId: args.runId,
      callPurpose: "optional_second_model_adversarial_review",
      queryFamily: taskType,
      grounded: false,
      provider: "groq",
      model,
      durationMs: Date.now() - startedAt,
      quotaFailure: /429|quota|resource_exhausted/i.test(failure),
      providerFailure: "non_blocking_optional_failure",
      metadata: {
        nonBlockingFailure: true,
        scoreOrVerdictProvidedToGroq: false,
        error: failure,
      },
    });
    return {
      available: false,
      concerns: [],
      disagreements: [],
      failure,
    };
  }
}
