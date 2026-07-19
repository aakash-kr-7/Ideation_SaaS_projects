/**
 * No-progress detector for the staged research integration runner.
 *
 * Records each loop iteration and fails immediately with a detailed
 * graph dump when the pipeline stalls, loops, or enters an invalid state.
 *
 * This is used both by the pure state-machine tests and by the
 * real integration runner to prevent infinite loops and provide
 * actionable diagnostics.
 */

import { MAX_RESEARCH_CYCLES, MAX_JOBS_PER_RUN } from "./stages.ts";
import type { ResearchJob } from "./job-queue.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IterationRecord {
  iteration: number;
  claimedJobAddress: string;
  claimedJobStage: string;
  statusBefore: string;
  statusAfter: string;
  jobsInserted: number;
  rowsProduced: number;
  cursorBefore: CursorSnapshot | null;
  cursorAfter: CursorSnapshot | null;
  terminalState: string | null;
  timestamp: number;
}

export interface CursorSnapshot {
  researchCycle: number;
  currentStage: string | null;
  stageIteration: number;
  nextBatchIndex: number;
  lastCompletedJobId: string | null;
}

export interface ProgressViolation {
  kind: string;
  message: string;
  iteration: number;
  history: IterationRecord[];
}

// ---------------------------------------------------------------------------
// ProgressTracker
// ---------------------------------------------------------------------------

export class ProgressTracker {
  private readonly history: IterationRecord[] = [];
  private readonly seenJobKeys = new Map<string, number>();
  private readonly completedJobKeys = new Set<string>();
  private readonly maxIterations: number;
  private readonly maxCycles: number;
  private readonly maxJobs: number;

  constructor(options: {
    maxIterations?: number;
    maxCycles?: number;
    maxJobs?: number;
  } = {}) {
    this.maxIterations = options.maxIterations ?? 300;
    this.maxCycles = options.maxCycles ?? MAX_RESEARCH_CYCLES;
    this.maxJobs = options.maxJobs ?? MAX_JOBS_PER_RUN;
  }

  /**
   * Record one loop iteration. Returns a violation if one is detected,
   * or null if progress is healthy.
   */
  record(entry: Omit<IterationRecord, "iteration" | "timestamp">): ProgressViolation | null {
    const iteration = this.history.length;
    const record: IterationRecord = {
      ...entry,
      iteration,
      timestamp: Date.now(),
    };
    this.history.push(record);

    // Track how many times we've seen this job key
    const seenCount = (this.seenJobKeys.get(entry.claimedJobAddress) ?? 0) + 1;
    this.seenJobKeys.set(entry.claimedJobAddress, seenCount);

    // Track completed jobs
    if (entry.statusAfter === "completed") {
      if (this.completedJobKeys.has(entry.claimedJobAddress)) {
        // A completed job was re-processed — this is only a violation
        // if new jobs were inserted (re-enqueuing work)
        if (entry.jobsInserted > 0) {
          return this.violation(
            "completed_job_re_enqueued",
            `Completed job ${entry.claimedJobAddress} was re-enqueued with ${entry.jobsInserted} new jobs`,
            iteration,
          );
        }
      }
      this.completedJobKeys.add(entry.claimedJobAddress);
    }

    // --- Detect violations ---

    // Max iteration guard
    if (iteration >= this.maxIterations) {
      return this.violation(
        "max_iterations_exceeded",
        `Loop exceeded ${this.maxIterations} iterations without reaching terminal state`,
        iteration,
      );
    }

    // Same job repeating without new output
    if (seenCount > 2 && entry.jobsInserted === 0 && entry.rowsProduced === 0) {
      return this.violation(
        "same_job_repeats_without_output",
        `Job ${entry.claimedJobAddress} has been claimed ${seenCount} times without producing new output`,
        iteration,
      );
    }

    // Cursor didn't advance (compare last two entries)
    if (this.history.length >= 2) {
      const prev = this.history[this.history.length - 2];
      const curr = record;
      if (
        prev.claimedJobAddress === curr.claimedJobAddress &&
        snapshotKey(prev.cursorAfter) === snapshotKey(curr.cursorAfter) &&
        curr.jobsInserted === 0 &&
        curr.statusAfter !== "completed" // retries are OK
      ) {
        return this.violation(
          "cursor_did_not_advance",
          `Cursor stalled at ${snapshotKey(curr.cursorAfter)} — same job ${curr.claimedJobAddress} claimed without advancement`,
          iteration,
        );
      }
    }

    // Research cycle exceeded
    if (entry.cursorAfter && entry.cursorAfter.researchCycle > this.maxCycles) {
      return this.violation(
        "max_research_cycle_exceeded",
        `Research cycle ${entry.cursorAfter.researchCycle} exceeds maximum of ${this.maxCycles}`,
        iteration,
      );
    }

    return null;
  }

  /**
   * Check if the run appears to be in a no-visible-job-but-non-terminal state.
   * Call this when claim returns null.
   */
  checkNoVisibleJob(runStatus: string): ProgressViolation | null {
    if (runStatus === "active" || runStatus === "Researching" || runStatus === "Queued") {
      return this.violation(
        "no_visible_job_but_non_terminal",
        `No visible pending job but run is non-terminal (status=${runStatus})`,
        this.history.length,
      );
    }
    return null;
  }

  /**
   * Get the full iteration history for diagnostics.
   */
  getHistory(): readonly IterationRecord[] {
    return this.history;
  }

  /**
   * Build a diagnostic summary string.
   */
  formatDiagnostics(): string {
    const lines: string[] = [
      `=== Progress Tracker Diagnostics ===`,
      `Total iterations: ${this.history.length}`,
      `Unique jobs seen: ${this.seenJobKeys.size}`,
      `Completed jobs: ${this.completedJobKeys.size}`,
      ``,
      `Iteration history:`,
    ];

    for (const entry of this.history) {
      lines.push(
        `  [${entry.iteration}] ${entry.claimedJobStage} addr=${entry.claimedJobAddress} ` +
        `${entry.statusBefore}→${entry.statusAfter} ` +
        `inserted=${entry.jobsInserted} rows=${entry.rowsProduced} ` +
        `cursor=${snapshotKey(entry.cursorAfter)}` +
        (entry.terminalState ? ` TERMINAL=${entry.terminalState}` : ""),
      );
    }

    if (this.seenJobKeys.size > 0) {
      lines.push(``, `Job claim counts:`);
      for (const [key, count] of this.seenJobKeys) {
        if (count > 1) {
          lines.push(`  ${key}: claimed ${count}x${this.completedJobKeys.has(key) ? " (completed)" : ""}`);
        }
      }
    }

    return lines.join("\n");
  }

  private violation(
    kind: string,
    message: string,
    iteration: number,
  ): ProgressViolation {
    return {
      kind,
      message: `${message}\n\n${this.formatDiagnostics()}`,
      iteration,
      history: [...this.history],
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshotKey(snapshot: CursorSnapshot | null): string {
  if (!snapshot) return "null";
  return `c${snapshot.researchCycle}|${snapshot.currentStage ?? "∅"}|i${snapshot.stageIteration}|b${snapshot.nextBatchIndex}`;
}

/**
 * Build a CursorSnapshot from a claimed ResearchJob.
 * Used by the integration runner.
 */
export function cursorSnapshotFromJob(job: ResearchJob): CursorSnapshot {
  return {
    researchCycle: job.research_cycle,
    currentStage: job.stage,
    stageIteration: job.stage_iteration,
    nextBatchIndex: job.batch_index,
    lastCompletedJobId: null,
  };
}
