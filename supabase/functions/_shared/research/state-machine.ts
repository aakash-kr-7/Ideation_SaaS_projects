/**
 * Pure reference state-machine for the durable research pipeline.
 *
 * This module models the EXACT transition contract that the SQL RPCs enforce:
 * - One canonical StageAddress identity per logical job
 * - Atomic transitions: validate → persist result → update cursor → complete job → insert next (or terminalize)
 * - Research cycle semantics with bounded gap iterations
 * - Batched stage continuation
 * - No-progress detection with diagnostic graph dump
 *
 * ZERO I/O, ZERO database — purely deterministic and exhaustively testable.
 * Retry attempt number is deliberately excluded from StageAddress.
 */

import {
  type PipelineStage,
  type StageAddress,
  type PipelineCursor,
  stageAddressKey,
  MAX_RESEARCH_CYCLES,
  MAX_JOBS_PER_RUN,
} from "./stages.ts";

// ---------------------------------------------------------------------------
// Model types
// ---------------------------------------------------------------------------

export type ModelStatus = "pending" | "claimed" | "completed" | "failed" | "dead_letter";
export type RunStatus = "active" | "completed" | "failed" | "cancelled";

export interface ModelJob {
  address: StageAddress;
  status: ModelStatus;
  attempts: number;
  output?: string;
}

export interface ProgressEntry {
  jobKey: string;
  statusBefore: ModelStatus;
  statusAfter: ModelStatus;
  jobsInserted: number;
  cursorBefore: string | null;
  cursorAfter: string | null;
  terminal: boolean;
}

export interface ModelRun {
  status: RunStatus;
  maxCycles: number;
  maxJobs: number;
  cursor: PipelineCursor | null;
  jobs: Map<string, ModelJob>;
  trace: string[];
  /** Cycles that have been started (to prevent double-increment). */
  startedCycles: Set<number>;
  /** Coverage gaps that triggered each cycle. */
  cycleGaps: Map<number, string[]>;
  /** Progress log for no-progress detection. */
  progressLog: ProgressEntry[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addr(
  stage: PipelineStage,
  cycle = 0,
  iteration = 0,
  batch = 0,
  shard?: string | null,
): StageAddress {
  return {
    runId: "model",
    researchCycle: cycle,
    stage,
    stageIteration: iteration,
    batchIndex: batch,
    shardKey: shard,
  };
}

function makeCursor(address: StageAddress, lastJobId: string | null = null): PipelineCursor {
  return {
    runId: address.runId,
    researchCycle: address.researchCycle,
    currentStage: address.stage,
    stageIteration: address.stageIteration,
    nextBatchIndex: address.batchIndex,
    lastCompletedJobId: lastJobId,
    lastProgressAt: new Date().toISOString(),
    coverageRequestedCycle: false,
    coverageGaps: [],
    terminalizationStarted: false,
  };
}

function cursorKey(c: PipelineCursor | null): string | null {
  if (!c || !c.currentStage) return null;
  return `${c.researchCycle}|${c.currentStage}|${c.stageIteration}|${c.nextBatchIndex}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createModel(maxCycles = MAX_RESEARCH_CYCLES, maxJobs = MAX_JOBS_PER_RUN): ModelRun {
  const initial = addr("plan_research");
  const key = stageAddressKey(initial);
  const run: ModelRun = {
    status: "active",
    maxCycles,
    maxJobs,
    cursor: makeCursor(initial),
    jobs: new Map([[key, { address: initial, status: "pending", attempts: 0 }]]),
    trace: [key],
    startedCycles: new Set([0]),
    cycleGaps: new Map(),
    progressLog: [],
  };
  return run;
}

// ---------------------------------------------------------------------------
// Atomic transition — the core contract
// ---------------------------------------------------------------------------

export interface DeliverOptions {
  /** Result identifier for the completed job. */
  result?: string;
  /** If true, this is a gap-research cycle request. */
  startNewCycle?: boolean;
  /** Coverage gaps that triggered the new cycle. */
  coverageGaps?: string[];
}

/**
 * Atomically deliver a result for `address` and transition to `next`.
 *
 * This is the single canonical transition operation that:
 * 1. Validates the claimed current job
 * 2. Persists the stage result (output)
 * 3. Updates the pipeline cursor
 * 4. Completes the current job
 * 5. Inserts exactly one valid next logical job OR terminalizes the run
 *
 * Duplicate calls return the already-persisted result.
 * A terminal run never enqueues more jobs.
 */
export function deliver(
  run: ModelRun,
  address: StageAddress,
  next: StageAddress | null,
  options: DeliverOptions = {},
): ModelJob {
  const { result = "ok", startNewCycle = false, coverageGaps = [] } = options;
  const key = stageAddressKey(address);
  const job = run.jobs.get(key);

  if (!job) {
    throw new StateMachineError(`Unknown job: ${key}`, run);
  }

  // --- Duplicate delivery is harmless ---
  if (job.status === "completed") {
    run.progressLog.push({
      jobKey: key,
      statusBefore: "completed",
      statusAfter: "completed",
      jobsInserted: 0,
      cursorBefore: cursorKey(run.cursor),
      cursorAfter: cursorKey(run.cursor),
      terminal: run.status !== "active",
    });
    return job;
  }

  // --- Terminal run cannot transition ---
  if (run.status !== "active") {
    throw new StateMachineError(
      `Terminal run (${run.status}) cannot transition job ${key}`,
      run,
    );
  }

  const curBefore = cursorKey(run.cursor);

  // --- Claim + complete atomically ---
  job.status = "claimed";
  job.attempts++;
  job.status = "completed";
  job.output = result;

  // --- Handle research cycle increment ---
  let effectiveNext = next;
  let effectiveCycle = next?.researchCycle ?? address.researchCycle;

  if (startNewCycle) {
    const newCycle = address.researchCycle + 1;

    if (newCycle > run.maxCycles) {
      // Max cycles exceeded — redirect to build_specialist_packs at current cycle
      effectiveNext = next
        ? addr("build_specialist_packs", address.researchCycle, 0, 0)
        : null;
      effectiveCycle = address.researchCycle;
    } else {
      // Guard: don't double-increment for the same coverage decision
      if (!run.startedCycles.has(newCycle)) {
        run.startedCycles.add(newCycle);
        run.cycleGaps.set(newCycle, coverageGaps);
      }
      effectiveCycle = newCycle;
      if (effectiveNext) {
        effectiveNext = { ...effectiveNext, researchCycle: effectiveCycle };
      }
    }
  }

  // --- Terminalize or enqueue next ---
  let jobsInserted = 0;

  if (!effectiveNext) {
    // Terminal — no next stage
    run.status = "completed";
    run.cursor = run.cursor
      ? {
          ...run.cursor,
          currentStage: null,
          lastCompletedJobId: key,
          lastProgressAt: new Date().toISOString(),
          terminalizationStarted: true,
        }
      : null;
  } else {
    // Max jobs guard
    if (run.jobs.size >= run.maxJobs) {
      throw new StateMachineError(
        `MAX_JOBS_PER_RUN exceeded (${run.maxJobs})`,
        run,
      );
    }

    const nextKey = stageAddressKey(effectiveNext);

    // Idempotent insert — don't create duplicate jobs
    if (!run.jobs.has(nextKey)) {
      run.jobs.set(nextKey, {
        address: effectiveNext,
        status: "pending",
        attempts: 0,
      });
      run.trace.push(nextKey);
      jobsInserted = 1;
    }

    // Update cursor
    run.cursor = {
      runId: effectiveNext.runId,
      researchCycle: effectiveCycle,
      currentStage: effectiveNext.stage,
      stageIteration: effectiveNext.stageIteration,
      nextBatchIndex: effectiveNext.batchIndex,
      lastCompletedJobId: key,
      lastProgressAt: new Date().toISOString(),
      coverageRequestedCycle: startNewCycle,
      coverageGaps: coverageGaps,
      terminalizationStarted: false,
    };
  }

  run.progressLog.push({
    jobKey: key,
    statusBefore: "pending",
    statusAfter: "completed",
    jobsInserted,
    cursorBefore: curBefore,
    cursorAfter: cursorKey(run.cursor),
    terminal: run.status !== "active",
  });

  return job;
}

// ---------------------------------------------------------------------------
// Retry — reuses the same logical job identity
// ---------------------------------------------------------------------------

/**
 * Simulate a retry attempt on a pending job.
 * The job address stays the same; only the attempt count increments
 * (modeling the failed claim that preceded the retry).
 */
export function retry(run: ModelRun, address: StageAddress): ModelJob {
  const key = stageAddressKey(address);
  const job = run.jobs.get(key);
  if (!job) throw new StateMachineError(`Unknown job for retry: ${key}`, run);
  if (job.status !== "pending" && job.status !== "claimed") {
    throw new StateMachineError(`Cannot retry job in status ${job.status}: ${key}`, run);
  }
  // Increment attempts for the failed claim, then reset to pending
  job.attempts++;
  job.status = "pending";
  return job;
}

// ---------------------------------------------------------------------------
// Cancellation & failure — terminal transitions
// ---------------------------------------------------------------------------

export function cancel(run: ModelRun): void {
  run.status = "cancelled";
  run.cursor = run.cursor
    ? {
        ...run.cursor,
        currentStage: null,
        terminalizationStarted: true,
        lastProgressAt: new Date().toISOString(),
      }
    : null;

  // Dead-letter all pending/claimed jobs
  for (const job of run.jobs.values()) {
    if (job.status === "pending" || job.status === "claimed") {
      job.status = "dead_letter";
    }
  }
}

export function fail(run: ModelRun, reason = "permanent failure"): void {
  run.status = "failed";
  run.cursor = run.cursor
    ? {
        ...run.cursor,
        currentStage: null,
        terminalizationStarted: true,
        lastProgressAt: new Date().toISOString(),
      }
    : null;

  // Dead-letter all pending/claimed jobs
  for (const job of run.jobs.values()) {
    if (job.status === "pending" || job.status === "claimed") {
      job.status = "dead_letter";
      job.output = reason;
    }
  }
}

// ---------------------------------------------------------------------------
// No-progress detection
// ---------------------------------------------------------------------------

export interface NoProgressViolation {
  kind:
    | "no_visible_job_but_non_terminal"
    | "same_job_repeats_without_output"
    | "cursor_did_not_advance"
    | "completed_job_re_enqueued"
    | "max_jobs_exceeded"
    | "max_research_cycle_exceeded";
  message: string;
}

/**
 * Detect no-progress conditions after a transition.
 * Returns null if everything is healthy, or a violation descriptor.
 */
export function detectNoProgress(run: ModelRun): NoProgressViolation | null {
  if (run.status !== "active") return null;

  // Check for no visible pending job
  const hasPending = [...run.jobs.values()].some(
    (j) => j.status === "pending",
  );
  if (!hasPending) {
    return {
      kind: "no_visible_job_but_non_terminal",
      message: `Run is active but has no pending jobs.\n${graphDump(run)}`,
    };
  }

  // Check for cursor stalls (last two entries have same cursor and same job)
  const log = run.progressLog;
  if (log.length >= 2) {
    const prev = log[log.length - 2];
    const curr = log[log.length - 1];
    if (
      prev.jobKey === curr.jobKey &&
      prev.cursorAfter === curr.cursorAfter &&
      curr.jobsInserted === 0
    ) {
      return {
        kind: "same_job_repeats_without_output",
        message: `Job ${curr.jobKey} repeated without new output.\n${graphDump(run)}`,
      };
    }
  }

  // Check max jobs
  if (run.jobs.size > run.maxJobs) {
    return {
      kind: "max_jobs_exceeded",
      message: `${run.jobs.size} jobs exceeds limit of ${run.maxJobs}.\n${graphDump(run)}`,
    };
  }

  // Check max research cycle
  const maxCycleUsed = Math.max(...run.startedCycles);
  if (maxCycleUsed > run.maxCycles) {
    return {
      kind: "max_research_cycle_exceeded",
      message: `Research cycle ${maxCycleUsed} exceeds max of ${run.maxCycles}.\n${graphDump(run)}`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Diagnostic graph dump
// ---------------------------------------------------------------------------

/**
 * Produces a human-readable dump of the full stage graph for diagnostics.
 */
export function graphDump(run: ModelRun): string {
  const lines: string[] = [
    `=== Pipeline State Graph ===`,
    `Run status: ${run.status}`,
    `Cursor: ${run.cursor ? `cycle=${run.cursor.researchCycle} stage=${run.cursor.currentStage ?? "null"} iter=${run.cursor.stageIteration} batch=${run.cursor.nextBatchIndex} terminal=${run.cursor.terminalizationStarted}` : "null"}`,
    `Jobs (${run.jobs.size}):`,
  ];

  const sorted = [...run.jobs.entries()].sort(
    (a, b) => run.trace.indexOf(a[0]) - run.trace.indexOf(b[0]),
  );

  for (const [key, job] of sorted) {
    const marker =
      job.status === "completed"
        ? "✓"
        : job.status === "pending"
          ? "○"
          : job.status === "claimed"
            ? "⊙"
            : job.status === "dead_letter"
              ? "✗"
              : "!";
    lines.push(
      `  ${marker} [${job.status}] ${key} (attempts=${job.attempts}${job.output ? ` out="${job.output}"` : ""})`,
    );
  }

  lines.push(`Trace: ${run.trace.join(" → ")}`);
  lines.push(`Started cycles: ${[...run.startedCycles].join(", ")}`);

  if (run.cycleGaps.size > 0) {
    lines.push(`Cycle gaps:`);
    for (const [cycle, gaps] of run.cycleGaps) {
      lines.push(`  cycle ${cycle}: ${gaps.join(", ") || "(none)"}`);
    }
  }

  if (run.progressLog.length > 0) {
    lines.push(`Progress log (last 5):`);
    const recent = run.progressLog.slice(-5);
    for (const entry of recent) {
      lines.push(
        `  ${entry.jobKey}: ${entry.statusBefore}→${entry.statusAfter} inserted=${entry.jobsInserted} cursor=${entry.cursorBefore}→${entry.cursorAfter}${entry.terminal ? " TERMINAL" : ""}`,
      );
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Check that no non-terminal run has orphaned pending jobs or missing cursor. */
export function assertNoOrphans(run: ModelRun): void {
  if (run.status === "active") {
    const hasPending = [...run.jobs.values()].some(j => j.status === "pending");
    if (!hasPending && run.cursor?.currentStage !== null) {
      throw new StateMachineError(
        `Active run has no pending jobs but cursor points to ${run.cursor?.currentStage}`,
        run,
      );
    }
  }

  if (run.status !== "active") {
    // Terminal run must not have pending or claimed jobs
    for (const [key, job] of run.jobs) {
      if (job.status === "pending" || job.status === "claimed") {
        throw new StateMachineError(
          `Terminal run (${run.status}) has ${job.status} job: ${key}`,
          run,
        );
      }
    }
  }
}

/** Assert all trace entries are unique (no address collisions). */
export function assertUniqueTrace(run: ModelRun): void {
  const unique = new Set(run.trace);
  if (unique.size !== run.trace.length) {
    const dupes = run.trace.filter((k, i) => run.trace.indexOf(k) !== i);
    throw new StateMachineError(
      `Trace contains duplicate addresses: ${dupes.join(", ")}`,
      run,
    );
  }
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class StateMachineError extends Error {
  constructor(message: string, public readonly run: ModelRun) {
    super(`${message}\n${graphDump(run)}`);
    this.name = "StateMachineError";
  }
}
