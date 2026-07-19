/**
 * Canonical pipeline stage definitions and state machine types.
 * Runtime-neutral: no providers, no database, no networking.
 */

export const PIPELINE_STAGES = [
  "plan_research",
  "discover_candidates",
  "rank_candidates",
  "fetch_sources",
  "extract_evidence",
  "deduplicate_cluster",
  "check_coverage",
  "gap_research",
  "build_specialist_packs",
  "run_specialists",
  "compute_scoring",
  "build_charts",
  "generate_report",
  "generate_exports",
  "complete",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/**
 * The stable identity of a logical queue job. Attempts deliberately do not
 * appear here: retrying work must claim the same durable job row.
 */
export interface StageAddress {
  readonly runId: string;
  readonly researchCycle: number;
  readonly stage: PipelineStage;
  readonly stageIteration: number;
  readonly batchIndex: number;
  readonly shardKey?: string | null;
}

const addressPart = (value: string | number | null | undefined) =>
  String(value ?? "").trim().replaceAll("|", "%7C");

/** Canonical, null-safe idempotency key used by every executor and RPC. */
export function stageAddressKey(address: StageAddress): string {
  return [address.runId, address.researchCycle, address.stage, address.stageIteration, address.batchIndex, address.shardKey]
    .map(addressPart)
    .join("|");
}

export function isPipelineStage(value: unknown): value is PipelineStage {
  return (
    typeof value === "string" &&
    (PIPELINE_STAGES as readonly string[]).includes(value)
  );
}

/** Stages that support batched iteration. */
export const BATCHED_STAGES: ReadonlySet<PipelineStage> = new Set([
  "discover_candidates",
  "fetch_sources",
  "extract_evidence",
  "gap_research",
]);

/** Maximum number of research cycles (initial + gap iterations). */
export const MAX_RESEARCH_CYCLES = 3;

/**
 * Durable orchestration cursor persisted for every run.
 * Records enough state to resume safely without inferring
 * continuation state from row counts alone.
 */
export interface PipelineCursor {
  readonly runId: string;
  readonly researchCycle: number;
  readonly currentStage: PipelineStage | null;
  readonly stageIteration: number;
  readonly nextBatchIndex: number;
  readonly lastCompletedJobId: string | null;
  readonly lastProgressAt: string;
  readonly coverageRequestedCycle: boolean;
  readonly coverageGaps: string[];
  readonly terminalizationStarted: boolean;
}

/** Default stage → next stage transitions. */
export const STAGE_TRANSITIONS: Record<PipelineStage, PipelineStage | null> = {
  plan_research: "discover_candidates",
  discover_candidates: "rank_candidates",
  rank_candidates: "fetch_sources",
  fetch_sources: "extract_evidence",
  extract_evidence: "deduplicate_cluster",
  deduplicate_cluster: "check_coverage",
  check_coverage: "gap_research", // gap_research decides whether to loop or proceed
  gap_research: "build_specialist_packs",
  build_specialist_packs: "run_specialists",
  run_specialists: "compute_scoring",
  compute_scoring: "build_charts",
  build_charts: "generate_report",
  generate_report: "generate_exports",
  generate_exports: "complete",
  complete: null,
};

/** Maximum iterations for looping stages. */
export const MAX_STAGE_ITERATIONS: Partial<Record<PipelineStage, number>> = {
  discover_candidates: 10,
  fetch_sources: 15,
  extract_evidence: 15,
  gap_research: 3,
};

/** Maximum total jobs a single run may create. */
export const MAX_JOBS_PER_RUN = 200;

/** Error classifications for stage failures. */
export type ErrorClass = "transient" | "permanent" | "budget" | "timeout";

/**
 * Context provided to every stage executor.
 */
export interface StageContext {
  readonly runId: string;
  readonly jobId: string;
  readonly attemptNumber: number;
  readonly researchCycle: number;
  readonly stageIteration: number;
  readonly batchIndex: number;
  readonly batchSize: number;
  readonly inputMeta: Record<string, unknown>;
  readonly config: import("./mode-config.ts").ReportModeConfig;
  readonly db: any; // SupabaseClient — typed as any for Deno/Node compatibility
  readonly dependencies: import("./dependencies.ts").ResearchDependencies;
  readonly startedAt: number; // Date.now() at start of execution
}

/**
 * Result returned by every stage executor.
 */
export interface StageResult {
  readonly status: "completed" | "failed";
  readonly nextStage: PipelineStage | null;
  readonly nextInputMeta: Record<string, unknown>;
  readonly nextStageIteration: number;
  readonly nextBatchIndex: number;
  readonly nextBatchSize: number;
  readonly nextJobPurpose: string;
  /** Set only by gap research; the transition RPC increments the cycle once. */
  readonly startNewResearchCycle?: boolean;
  readonly coverageGaps?: string[];
  readonly outputMeta: Record<string, unknown>;
  readonly metrics: StageMetrics;
  readonly error?: StageError;
}

export interface StageMetrics {
  readonly provider_cost_usd?: number;
  readonly tokens_used?: Record<string, number>;
  readonly candidates_discovered?: number;
  readonly pages_attempted?: number;
  readonly pages_fetched?: number;
  readonly sources_accepted?: number;
  readonly sources_rejected?: number;
  readonly evidence_extracted?: number;
  readonly independent_domains?: number;
  readonly cache_hits?: number;
  readonly provider_fallbacks?: number;
  readonly duration_ms?: number;
}

export interface StageError {
  readonly class: ErrorClass;
  readonly message: string;
}

/** Type for a stage executor function. */
export type StageExecutor = (ctx: StageContext) => Promise<StageResult>;

/** Helper to build a successful StageResult. */
export function stageCompleted(
  nextStage: PipelineStage | null,
  outputMeta: Record<string, unknown> = {},
  metrics: StageMetrics = {},
  overrides: Partial<
    Pick<
      StageResult,
      | "nextInputMeta"
      | "nextStageIteration"
      | "nextBatchIndex"
      | "nextBatchSize"
      | "nextJobPurpose"
      | "startNewResearchCycle"
      | "coverageGaps"
    >
  > = {},
): StageResult {
  return {
    status: "completed",
    nextStage,
    nextInputMeta: overrides.nextInputMeta ?? {},
    nextStageIteration: overrides.nextStageIteration ?? 0,
    nextBatchIndex: overrides.nextBatchIndex ?? 0,
    nextBatchSize: overrides.nextBatchSize ?? 0,
    nextJobPurpose: overrides.nextJobPurpose ?? "stage",
    startNewResearchCycle: overrides.startNewResearchCycle,
    coverageGaps: overrides.coverageGaps,
    outputMeta,
    metrics,
  };
}

/** Helper to build a failed StageResult. */
export function stageFailed(
  errorClass: ErrorClass,
  message: string,
  metrics: StageMetrics = {},
): StageResult {
  return {
    status: "failed",
    nextStage: null,
    nextInputMeta: {},
    nextStageIteration: 0,
    nextBatchIndex: 0,
    nextBatchSize: 0,
    nextJobPurpose: "stage",
    outputMeta: {},
    metrics,
    error: { class: errorClass, message },
  };
}

/**
 * Adaptive batch sizing. Reduce batch size when the previous batch was slow
 * or pages were large.
 */
export interface BatchConfig {
  readonly defaultSize: number;
  readonly maxSize: number;
  readonly minSize: number;
}

export const BATCH_DEFAULTS: Record<string, BatchConfig> = {
  fetch_sources: { defaultSize: 10, maxSize: 15, minSize: 3 },
  extract_evidence: { defaultSize: 5, maxSize: 8, minSize: 2 },
  discover_candidates: { defaultSize: 20, maxSize: 30, minSize: 5 },
};

export function adaptBatchSize(
  config: BatchConfig,
  previousDurationMs: number | null,
  stageBudgetMs: number,
): number {
  if (previousDurationMs === null) return config.defaultSize;
  const perItemMs = previousDurationMs / config.defaultSize;
  const remainingItems = Math.floor(
    (stageBudgetMs * 0.8) / Math.max(perItemMs, 100),
  );
  return Math.max(
    config.minSize,
    Math.min(config.maxSize, remainingItems),
  );
}

/** Progress percentage estimates for UI display. */
export const STAGE_PROGRESS: Record<PipelineStage, number> = {
  plan_research: 5,
  discover_candidates: 15,
  rank_candidates: 20,
  fetch_sources: 35,
  extract_evidence: 50,
  deduplicate_cluster: 55,
  check_coverage: 60,
  gap_research: 65,
  build_specialist_packs: 70,
  run_specialists: 80,
  compute_scoring: 87,
  build_charts: 90,
  generate_report: 93,
  generate_exports: 97,
  complete: 100,
};
