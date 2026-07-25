import { getEnv } from "./environment.ts";
import type { ResearchStatus } from "./status.ts";
import type { ReportModeConfig } from "./mode-config.ts";

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class CostBudget {
  private reserved: number;
  constructor(persistedSpend = 0, readonly cap = 1) { this.reserved = persistedSpend; }
  reserve(amount: number) {
    if (!Number.isFinite(this.cap) || this.cap <= 0) throw new Error("RESEARCH_RUN_COST_CAP_USD must be positive.");
    if (this.reserved + amount > this.cap) throw new Error(`Per-run provider cost cap of $${this.cap.toFixed(4)} would be exceeded.`);
    this.reserved += amount;
  }
  remaining() { return Math.max(0, this.cap - this.reserved); }
  spent() { return this.reserved; }
}

export async function costBudgetForRun(runId: string, db: any, config: ReportModeConfig) {
  const { data, error } = await db.from("api_usage_logs").select("cost").eq("run_id", runId);
  if (error) throw new Error(`Failed to load persisted provider spend: ${error.message}`);
  const persistedSpend = (data || []).reduce((sum: number, row: { cost?: number }) => sum + Number(row.cost || 0), 0);
  const configuredCap = Number(getEnv("RESEARCH_RUN_COST_CAP_USD") || config.costLimits.totalUsd);
  return new CostBudget(persistedSpend, Math.min(config.costLimits.totalUsd, configuredCap));
}

export async function updateState(id: string, status: ResearchStatus, progress: number, detail: string, db: any) {
  const values = {
    status, progress, progress_detail: detail, updated_at: new Date().toISOString(),
    ...(status === "Failed" ? { error_message: detail } : {}),
  };
  const { error } = await db.from("research_runs").update(values).eq("id", id);
  if (error) throw new Error(`Failed to persist ${status}: ${error.message}`);
  const { data: latest } = await db.from("research_stages").select("status,progress_detail")
    .eq("run_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latest?.status === status && latest?.progress_detail === detail) return;
  const now = new Date().toISOString();
  const { error: stageError } = await db.from("research_stages").insert({
    run_id: id, stage_name: status, status, progress_detail: detail,
    error_message: status === "Failed" ? detail : null, started_at: now, completed_at: now,
  });
  if (stageError) throw new Error(`Failed to persist transition ${status}: ${stageError.message}`);
}

export async function logError(runId: string, context: string, error: unknown, db: any) {
  const message = error instanceof Error ? error.message : String(error);
  const { data: run } = await db.from("research_runs").select("created_by").eq("id", runId).maybeSingle();
  await db.from("error_logs").insert({
    user_id: run?.created_by || null, run_id: runId, context, error_message: message,
    stack_trace: error instanceof Error ? error.stack || null : null,
  });
}

export async function ensureMetrics(runId: string, db: any) {
  const { error } = await db.from("research_pipeline_metrics").upsert(
    { run_id: runId }, { onConflict: "run_id", ignoreDuplicates: true },
  );
  if (error) throw new Error(`Failed to ensure pipeline metrics: ${error.message}`);
}

const METRIC_COLUMNS: Record<string, string> = {
  provider_cost_usd: "total_provider_cost_usd",
  provider_calls: "provider_calls",
  grounded_calls: "grounded_calls",
  fallback_calls: "fallback_calls",
  cache_hits: "cache_hits",
  cache_misses: "cache_misses",
  input_tokens: "input_tokens",
  output_tokens: "output_tokens",
  retry_count: "retry_count",
  duration_ms: "total_duration_ms",
};

export async function incrementMetrics(runId: string, db: any, increments: Record<string, number>) {
  await ensureMetrics(runId, db);
  const columns = [...new Set(Object.keys(increments).map((key) => METRIC_COLUMNS[key]).filter(Boolean))];
  if (!columns.length) return;
  const { data: current, error: readError } = await db.from("research_pipeline_metrics").select(columns.join(",")).eq("run_id", runId).single();
  if (readError) throw new Error(`Failed to read pipeline metrics: ${readError.message}`);
  const updates: Record<string, number | string> = { updated_at: new Date().toISOString() };
  for (const [key, delta] of Object.entries(increments)) {
    const column = METRIC_COLUMNS[key];
    if (column) updates[column] = Number(current?.[column] || 0) + delta;
  }
  const { error } = await db.from("research_pipeline_metrics").update(updates).eq("run_id", runId);
  if (error) throw new Error(`Failed to increment pipeline metrics: ${error.message}`);
}

export async function recordModelCall(runId: string, db: any, model: string) {
  await ensureMetrics(runId, db);
  const { data, error } = await db.from("research_pipeline_metrics").select("model_call_counts").eq("run_id", runId).single();
  if (error) throw new Error(`Failed to read model metrics: ${error.message}`);
  const counts = data?.model_call_counts && typeof data.model_call_counts === "object" ? data.model_call_counts : {};
  const { error: updateError } = await db.from("research_pipeline_metrics").update({
    model_call_counts: { ...counts, [model]: Number(counts[model] || 0) + 1 },
    updated_at: new Date().toISOString(),
  }).eq("run_id", runId);
  if (updateError) throw new Error(`Failed to record model metrics: ${updateError.message}`);
}

export async function reconcileUsageMetrics(runId: string, db: any) {
  const { data, error } = await db.from("api_usage_logs")
    .select("provider,model,status,error_class,prompt_tokens,completion_tokens,cost,retry_count,grounded_search_requested,grounding_metadata_present,grounding_degraded,quota_metric,external_search,page_fetch,duration_ms,cache_status")
    .eq("run_id", runId);
  if (error) throw new Error(`Failed to reconcile provider usage: ${error.message}`);
  const rows = data || [];
  const { data: currentMetrics } = await db.from("research_pipeline_metrics")
    .select("cache_hits").eq("run_id", runId).maybeSingle();
  const modelCallCounts: Record<string, number> = {};
  for (const row of rows) {
    if (row.provider === "gemini" && row.model) {
      const model = String(row.model);
      modelCallCounts[model] = (modelCallCounts[model] || 0) + 1;
    }
  }
  const totals = rows.reduce((sum: any, row: any) => ({
    providerCalls: sum.providerCalls + (row.provider === "retrieval_cache" ? 0 : 1),
    groundedCallsAttempted: sum.groundedCallsAttempted + (row.grounded_search_requested ? 1 : 0),
    groundedCallsCompleted: sum.groundedCallsCompleted + (row.grounded_search_requested && row.status === "success" && row.grounding_metadata_present ? 1 : 0),
    groundedCallsQuotaBlocked: sum.groundedCallsQuotaBlocked + (row.grounded_search_requested && row.quota_metric ? 1 : 0),
    externalSearchCalls: sum.externalSearchCalls + (row.external_search ? 1 : 0),
    synthesisCalls: sum.synthesisCalls + (row.provider === "gemini" && !row.grounded_search_requested ? 1 : 0),
    pageFetches: sum.pageFetches + (row.page_fetch && row.status === "success" ? 1 : 0),
    inputTokens: sum.inputTokens + Number(row.prompt_tokens || 0),
    outputTokens: sum.outputTokens + Number(row.completion_tokens || 0),
    retries: sum.retries + Number(row.retry_count || 0)
      + (row.status === "failed" && ["transient", "timeout"].includes(String(row.error_class || "")) ? 1 : 0),
    durationMs: sum.durationMs + Number(row.duration_ms || 0),
    cost: sum.cost + Number(row.cost || 0),
    cacheHits: sum.cacheHits + (row.cache_status === "hit" ? 1 : 0),
    cacheMisses: sum.cacheMisses + (row.cache_status === "miss" ? 1 : 0),
  }), {
    providerCalls: 0, groundedCallsAttempted: 0, groundedCallsCompleted: 0,
    groundedCallsQuotaBlocked: 0, externalSearchCalls: 0, synthesisCalls: 0,
    pageFetches: 0, inputTokens: 0, outputTokens: 0, retries: 0,
    durationMs: 0, cost: 0, cacheHits: 0, cacheMisses: 0,
  });
  const degradedProviders = [...new Set(rows.filter((row: any) => row.grounding_degraded || row.quota_metric).map((row: any) => row.provider))];
  await ensureMetrics(runId, db);
  const { error: metricsError } = await db.from("research_pipeline_metrics").update({
    provider_calls: totals.providerCalls,
    grounded_calls: totals.groundedCallsAttempted,
    grounded_calls_attempted: totals.groundedCallsAttempted,
    grounded_calls_completed: totals.groundedCallsCompleted,
    grounded_calls_quota_blocked: totals.groundedCallsQuotaBlocked,
    external_search_calls: totals.externalSearchCalls,
    synthesis_calls: totals.synthesisCalls,
    input_tokens: totals.inputTokens,
    output_tokens: totals.outputTokens,
    retry_count: totals.retries,
    cache_hits: Math.max(Number(currentMetrics?.cache_hits || 0), totals.cacheHits),
    cache_misses: totals.cacheMisses,
    pages_fetched: totals.pageFetches,
    grounding_degraded: degradedProviders.length > 0,
    degraded_providers: degradedProviders,
    total_duration_ms: totals.durationMs,
    total_provider_cost_usd: totals.cost,
    model_call_counts: modelCallCounts,
    pricing_version: "gemini-estimate-v1-2026-07-25",
    updated_at: new Date().toISOString(),
  }).eq("run_id", runId);
  if (metricsError) throw new Error(`Failed to persist reconciled Gemini usage: ${metricsError.message}`);
  const { error: runError } = await db.from("research_runs").update({
    total_provider_cost_usd: totals.cost,
    total_tokens_used: { input: totals.inputTokens, output: totals.outputTokens, total: totals.inputTokens + totals.outputTokens },
  }).eq("id", runId);
  if (runError) throw new Error(`Failed to persist reconciled run usage: ${runError.message}`);
  return totals;
}
