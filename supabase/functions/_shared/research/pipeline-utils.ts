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
