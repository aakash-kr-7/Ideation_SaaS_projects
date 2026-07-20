/** Canonical, runtime-neutral Gemini hybrid pipeline contracts. */
export const PIPELINE_STAGES = [
  "plan",
  "grounded_research",
  "evidence_boosters",
  "validate_normalize",
  "analyze_score",
  "generate_report",
  "generate_exports",
  "complete",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

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

export function stageAddressKey(address: StageAddress): string {
  return [address.runId, address.researchCycle, address.stage, address.stageIteration, address.batchIndex, address.shardKey]
    .map(addressPart)
    .join("|");
}

export function isPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === "string" && (PIPELINE_STAGES as readonly string[]).includes(value);
}

export const BATCHED_STAGES: ReadonlySet<PipelineStage> = new Set();
export const MAX_STAGE_ITERATIONS: Partial<Record<PipelineStage, number>> = {};
export const MAX_JOBS_PER_RUN = 16;

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

export const STAGE_TRANSITIONS: Record<PipelineStage, PipelineStage | null> = {
  plan: "grounded_research",
  grounded_research: "evidence_boosters",
  evidence_boosters: "validate_normalize",
  validate_normalize: "analyze_score",
  analyze_score: "generate_report",
  generate_report: "generate_exports",
  generate_exports: "complete",
  complete: null,
};

export type ErrorClass = "transient" | "permanent" | "budget" | "timeout";

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
  readonly db: any;
  readonly dependencies: import("./dependencies.ts").ResearchDependencies;
  readonly startedAt: number;
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

export interface StageError { readonly class: ErrorClass; readonly message: string; }
export interface StageResult {
  readonly status: "completed" | "failed";
  readonly nextStage: PipelineStage | null;
  readonly nextInputMeta: Record<string, unknown>;
  readonly nextStageIteration: number;
  readonly nextBatchIndex: number;
  readonly nextBatchSize: number;
  readonly nextJobPurpose: string;
  readonly outputMeta: Record<string, unknown>;
  readonly metrics: StageMetrics;
  readonly error?: StageError;
}

export type StageExecutor = (ctx: StageContext) => Promise<StageResult>;

export function stageCompleted(
  nextStage: PipelineStage | null,
  outputMeta: Record<string, unknown> = {},
  metrics: StageMetrics = {},
  overrides: Partial<Pick<StageResult, "nextInputMeta" | "nextStageIteration" | "nextBatchIndex" | "nextBatchSize" | "nextJobPurpose">> = {},
): StageResult {
  return {
    status: "completed", nextStage, outputMeta, metrics,
    nextInputMeta: overrides.nextInputMeta ?? {},
    nextStageIteration: overrides.nextStageIteration ?? 0,
    nextBatchIndex: overrides.nextBatchIndex ?? 0,
    nextBatchSize: overrides.nextBatchSize ?? 0,
    nextJobPurpose: overrides.nextJobPurpose ?? "stage",
  };
}

export function stageFailed(errorClass: ErrorClass, message: string, metrics: StageMetrics = {}): StageResult {
  return {
    status: "failed", nextStage: null, nextInputMeta: {}, nextStageIteration: 0,
    nextBatchIndex: 0, nextBatchSize: 0, nextJobPurpose: "stage", outputMeta: {}, metrics,
    error: { class: errorClass, message },
  };
}

export const STAGE_PROGRESS: Record<PipelineStage, number> = {
  plan: 5,
  grounded_research: 30,
  evidence_boosters: 50,
  validate_normalize: 65,
  analyze_score: 85,
  generate_report: 93,
  generate_exports: 97,
  complete: 100,
};
