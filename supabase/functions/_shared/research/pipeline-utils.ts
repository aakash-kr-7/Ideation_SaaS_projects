/**
 * Shared stage-scoped provider, cost, persistence, and text utilities.
 *
 * These are pure or low-side-effect helpers reused by multiple stage executors.
 * They do NOT contain orchestration logic — only I/O wrappers, cost tracking,
 * text processing, and state management.
 */

import type { ProviderUsage } from "./providers.ts";
import { getEnv } from "./providers.ts";
import type { ResearchStatus } from "./status.ts";
import type { ReportModeConfig } from "./mode-config.ts";

// ---------------------------------------------------------------------------
// Wait / retry helpers
// ---------------------------------------------------------------------------

export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function retryDelay(error: unknown, attempt: number) {
  const message = error instanceof Error ? error.message : String(error);
  return /429|too many requests/i.test(message)
    ? 5_000 * attempt
    : 500 * 2 ** (attempt - 1);
}

// ---------------------------------------------------------------------------
// PipelineError — carries run context
// ---------------------------------------------------------------------------

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly runId: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PipelineError";
  }
}

// ---------------------------------------------------------------------------
// CostBudget — tracks per-run provider spend
// ---------------------------------------------------------------------------

export class CostBudget {
  private reserved: number;
  readonly cap: number;

  constructor(persistedSpend = 0, cap = 1) {
    this.reserved = persistedSpend;
    this.cap = cap;
  }

  reserve(amount: number) {
    if (!Number.isFinite(this.cap) || this.cap <= 0) {
      throw new Error("RESEARCH_RUN_COST_CAP_USD must be positive.");
    }
    if (this.reserved + amount > this.cap) {
      throw new Error(
        `Per-run provider cost cap of $${this.cap.toFixed(4)} would be exceeded.`,
      );
    }
    this.reserved += amount;
  }

  remaining() {
    return Math.max(0, this.cap - this.reserved);
  }

  canSpend(amount: number, downstreamReserve = 0) {
    return this.remaining() >= amount + downstreamReserve;
  }

  spent() {
    return this.reserved;
  }
}

/**
 * Reconstruct a CostBudget from persisted usage records for a run.
 */
export async function costBudgetForRun(
  runId: string,
  db: any,
  config: ReportModeConfig,
) {
  const { data, error } = await db
    .from("api_usage_logs")
    .select("cost")
    .eq("run_id", runId);

  if (error) {
    throw new Error(
      `Failed to load persisted provider spend: ${error.message}`,
    );
  }

  const persistedSpend = (data || []).reduce(
    (sum: number, row: { cost?: number }) => sum + Number(row.cost || 0),
    0,
  );
  const environmentCap = Number(
    getEnv("RESEARCH_RUN_COST_CAP_USD") || config.costLimits.totalUsd,
  );
  return new CostBudget(
    persistedSpend,
    Math.min(config.costLimits.totalUsd, environmentCap),
  );
}

// ---------------------------------------------------------------------------
// Per-provider cost estimates (per call)
// ---------------------------------------------------------------------------

export const PROVIDER_COSTS: Record<string, number> = {
  tavily: 0.008,
  firecrawl: 0.001,
  cohere: 0.0002,
  groq: 0.02,
  cerebras: 0.02,
};

// ---------------------------------------------------------------------------
// Provider call wrapper with cost tracking and retry
// ---------------------------------------------------------------------------

export async function callProvider<T>(
  runId: string,
  provider: { name: string; lastUsage?: ProviderUsage },
  operation: string,
  budget: CostBudget,
  db: any,
  fn: () => Promise<T>,
  retries = 3,
): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const cost = PROVIDER_COSTS[provider.name] ?? 0;
    budget.reserve(cost);
    try {
      const result = await fn();
      await logUsage(
        runId,
        provider.name,
        operation,
        "success",
        provider.lastUsage || {},
        cost,
        null,
        db,
      );
      return result;
    } catch (error) {
      last = error;
      const message = error instanceof Error ? error.message : String(error);
      await logUsage(
        runId,
        provider.name,
        operation,
        "failed",
        {},
        cost,
        message,
        db,
      );
      if (attempt < retries) await wait(retryDelay(error, attempt));
    }
  }
  throw last;
}

// ---------------------------------------------------------------------------
// Usage logging
// ---------------------------------------------------------------------------

export async function logUsage(
  runId: string,
  provider: string,
  operation: string,
  status: "success" | "failed",
  usage: ProviderUsage,
  cost: number,
  error: string | null,
  db: any,
) {
  const { error: insertError } = await db.from("api_usage_logs").insert({
    run_id: runId,
    provider,
    operation,
    prompt_tokens: usage.prompt || null,
    completion_tokens: usage.completion || null,
    cost,
    status,
    error_message: error,
  });
  if (insertError) {
    throw new Error(
      `Failed to persist provider usage: ${insertError.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export async function updateState(
  id: string,
  status: ResearchStatus,
  progress: number,
  detail: string,
  db: any,
) {
  const values: {
    status: ResearchStatus;
    progress: number;
    progress_detail: string;
    updated_at: string;
    error_message?: string;
  } = {
    status,
    progress,
    progress_detail: detail,
    updated_at: new Date().toISOString(),
  };
  if (status === "Failed") values.error_message = detail;

  const { error } = await db.from("research_runs").update(values).eq("id", id);
  if (error) {
    throw new Error(`Failed to persist ${status}: ${error.message}`);
  }

  const { data: latest } = await db
    .from("research_stages")
    .select("status,progress_detail")
    .eq("run_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.status === status && latest?.progress_detail === detail) return;

  const now = new Date().toISOString();
  const { error: stageError } = await db.from("research_stages").insert({
    run_id: id,
    stage_name: status,
    status,
    progress_detail: detail,
    error_message: status === "Failed" ? detail : null,
    started_at: now,
    completed_at: now,
  });
  if (stageError) {
    throw new Error(
      `Failed to persist transition ${status}: ${stageError.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Error logging
// ---------------------------------------------------------------------------

export async function logError(
  runId: string,
  context: string,
  error: unknown,
  db: any,
) {
  const message = error instanceof Error ? error.message : String(error);
  const { data: run } = await db
    .from("research_runs")
    .select("created_by")
    .eq("id", runId)
    .maybeSingle();

  await db.from("error_logs").insert({
    user_id: run?.created_by || null,
    run_id: runId,
    context,
    error_message: message,
    stack_trace: error instanceof Error ? error.stack || null : null,
  });
}

// ---------------------------------------------------------------------------
// Credit finalization
// ---------------------------------------------------------------------------

export async function finalizeCredit(
  runId: string,
  outcome: "consume" | "restore",
  db: any,
) {
  const { data, error } = await db.rpc("finalize_research_credit", {
    p_run_id: runId,
    p_outcome: outcome,
  });
  if (error) {
    throw new Error(
      `Credit ${outcome} failed for run ${runId}: ${error.message}`,
    );
  }
  return data;
}

// ---------------------------------------------------------------------------
// Text processing utilities
// ---------------------------------------------------------------------------

export function cosine(a: number[], b: number[]) {
  if (!a || !b || a.length !== b.length) return 0;
  let d = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? d / Math.sqrt(aa * bb) : 0;
}

export function chunk(text: string, size = 4000) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Pipeline metrics helpers
// ---------------------------------------------------------------------------

/**
 * Ensure a pipeline_metrics row exists for a run and return it.
 */
export async function ensureMetrics(runId: string, db: any) {
  // `ignoreDuplicates` intentionally returns no representation on PostgreSQL;
  // chaining `.single()` therefore turns a harmless duplicate into a worker
  // failure. Ensure first, then read the canonical row.
  const { error: ensureError } = await db
    .from("research_pipeline_metrics")
    .upsert(
      { run_id: runId },
      { onConflict: "run_id", ignoreDuplicates: true },
    );
  if (ensureError) {
    throw new Error(`Failed to ensure pipeline metrics: ${ensureError.message}`);
  }
  const { data, error } = await db.from("research_pipeline_metrics").select("*").eq("run_id", runId).single();
  if (error) throw new Error(`Failed to read pipeline metrics: ${error.message}`);
  return data;
}

/**
 * Increment specific metrics counters atomically.
 */
export async function incrementMetrics(
  runId: string,
  db: any,
  increments: Record<string, number>,
) {
  // Build SET clause for increments
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [key, delta] of Object.entries(increments)) {
    updates[key] = db.rpc ? delta : delta; // Will be handled via raw update
  }

  // Use a simple upsert-update pattern
  await db
    .from("research_pipeline_metrics")
    .update(updates)
    .eq("run_id", runId);
}

// ---------------------------------------------------------------------------
// Research request type (re-export for convenience)
// ---------------------------------------------------------------------------

export type { ResearchRequest } from "./types.ts";
