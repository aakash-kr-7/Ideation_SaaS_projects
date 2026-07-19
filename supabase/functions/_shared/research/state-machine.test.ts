/**
 * Pure state-machine test suite.
 *
 * Proves that any valid stage graph reaches a terminal state.
 * Uses lightweight fake stage results — zero I/O, zero database.
 *
 * Scenarios:
 *  1. Straight-line execution → Completed
 *  2. Fetch batches advance correctly
 *  3. Extraction batches advance correctly
 *  4. One gap-research cycle returns to discovery, then completes
 *  5. Multiple allowed gap cycles remain unique
 *  6. Maximum cycle limit terminates cleanly
 *  7. Duplicate delivery is harmless
 *  8. Retry attempts reuse the same logical job identity
 *  9. Cancellation terminates
 * 10. Permanent failure terminates
 * 11. No orphan non-terminal run remains
 */

import {
  createModel,
  deliver,
  retry,
  cancel,
  fail,
  detectNoProgress,
  assertNoOrphans,
  assertUniqueTrace,
  graphDump,
  type ModelRun,
} from "./state-machine.ts";
import {
  type PipelineStage,
  type StageAddress,
  stageAddressKey,

} from "./stages.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const addr = (
  stage: PipelineStage,
  cycle = 0,
  iteration = 0,
  batch = 0,
  shard?: string | null,
): StageAddress => ({
  runId: "model",
  researchCycle: cycle,
  stage,
  stageIteration: iteration,
  batchIndex: batch,
  shardKey: shard,
});

const same = (actual: unknown, expected: unknown, label = "") => {
  if (!Object.is(actual, expected)) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

/** The default straight-line stage sequence (skipping gap_research). */
const STRAIGHT_LINE: PipelineStage[] = [
  "plan_research",
  "discover_candidates",
  "rank_candidates",
  "fetch_sources",
  "extract_evidence",
  "deduplicate_cluster",
  "check_coverage",
  // gap_research is skipped when coverage is sufficient
  "build_specialist_packs",
  "run_specialists",
  "compute_scoring",
  "build_charts",
  "generate_report",
  "generate_exports",
  "complete",
];

/** Walk a straight line through the pipeline, delivering each stage. */
function walkStraightLine(run: ModelRun, cycle = 0): void {
  for (let i = 0; i < STRAIGHT_LINE.length - 1; i++) {
    const current = addr(STRAIGHT_LINE[i], cycle);
    const next = addr(STRAIGHT_LINE[i + 1], cycle);
    deliver(run, current, next);
  }
  // Terminal stage
  deliver(run, addr("complete", cycle), null);
}

// ---------------------------------------------------------------------------
// 1. Straight-line execution reaches Completed
// ---------------------------------------------------------------------------

Deno.test("state machine: straight-line execution reaches Completed", () => {
  const run = createModel();
  walkStraightLine(run);

  same(run.status, "completed", "run status");
  same(run.cursor?.currentStage, null, "cursor stage");
  same(run.cursor?.terminalizationStarted, true, "terminalization");
  assertNoOrphans(run);

  // Verify no progress violations
  const violation = detectNoProgress(run);
  same(violation, null, "no-progress violation");
});

// ---------------------------------------------------------------------------
// 2. Fetch batches advance correctly
// ---------------------------------------------------------------------------

Deno.test("state machine: fetch batches advance correctly", () => {
  const run = createModel();

  // plan_research → discover_candidates → rank_candidates → fetch_sources batch 0
  deliver(run, addr("plan_research"), addr("discover_candidates"));
  deliver(run, addr("discover_candidates"), addr("rank_candidates"));
  deliver(run, addr("rank_candidates"), addr("fetch_sources", 0, 0, 0));

  // fetch_sources batch 0 → batch 1 → batch 2 → extract_evidence
  deliver(run, addr("fetch_sources", 0, 0, 0), addr("fetch_sources", 0, 0, 1));
  deliver(run, addr("fetch_sources", 0, 0, 1), addr("fetch_sources", 0, 0, 2));
  deliver(run, addr("fetch_sources", 0, 0, 2), addr("extract_evidence"));

  // Verify batch jobs exist with correct addresses
  same(run.jobs.has(stageAddressKey(addr("fetch_sources", 0, 0, 0))), true, "batch 0");
  same(run.jobs.has(stageAddressKey(addr("fetch_sources", 0, 0, 1))), true, "batch 1");
  same(run.jobs.has(stageAddressKey(addr("fetch_sources", 0, 0, 2))), true, "batch 2");

  // All three batch jobs should be completed
  same(run.jobs.get(stageAddressKey(addr("fetch_sources", 0, 0, 0)))?.status, "completed");
  same(run.jobs.get(stageAddressKey(addr("fetch_sources", 0, 0, 1)))?.status, "completed");
  same(run.jobs.get(stageAddressKey(addr("fetch_sources", 0, 0, 2)))?.status, "completed");

  // Continue to completion
  deliver(run, addr("extract_evidence"), addr("deduplicate_cluster"));
  deliver(run, addr("deduplicate_cluster"), addr("check_coverage"));
  deliver(run, addr("check_coverage"), addr("build_specialist_packs"));
  deliver(run, addr("build_specialist_packs"), addr("run_specialists"));
  deliver(run, addr("run_specialists"), addr("compute_scoring"));
  deliver(run, addr("compute_scoring"), addr("build_charts"));
  deliver(run, addr("build_charts"), addr("generate_report"));
  deliver(run, addr("generate_report"), addr("generate_exports"));
  deliver(run, addr("generate_exports"), addr("complete"));
  deliver(run, addr("complete"), null);

  same(run.status, "completed");
  assertNoOrphans(run);
});

// ---------------------------------------------------------------------------
// 3. Extraction batches advance correctly
// ---------------------------------------------------------------------------

Deno.test("state machine: extraction batches advance correctly", () => {
  const run = createModel();

  deliver(run, addr("plan_research"), addr("discover_candidates"));
  deliver(run, addr("discover_candidates"), addr("rank_candidates"));
  deliver(run, addr("rank_candidates"), addr("fetch_sources"));
  deliver(run, addr("fetch_sources"), addr("extract_evidence", 0, 0, 0));

  // extract_evidence: batch 0 → iteration 1 batch 0 → deduplicate
  deliver(run, addr("extract_evidence", 0, 0, 0), addr("extract_evidence", 0, 1, 0));
  deliver(run, addr("extract_evidence", 0, 1, 0), addr("deduplicate_cluster"));

  same(run.jobs.get(stageAddressKey(addr("extract_evidence", 0, 0, 0)))?.status, "completed");
  same(run.jobs.get(stageAddressKey(addr("extract_evidence", 0, 1, 0)))?.status, "completed");

  // Continue to terminal
  deliver(run, addr("deduplicate_cluster"), addr("check_coverage"));
  deliver(run, addr("check_coverage"), addr("build_specialist_packs"));
  deliver(run, addr("build_specialist_packs"), addr("run_specialists"));
  deliver(run, addr("run_specialists"), addr("compute_scoring"));
  deliver(run, addr("compute_scoring"), addr("build_charts"));
  deliver(run, addr("build_charts"), addr("generate_report"));
  deliver(run, addr("generate_report"), addr("generate_exports"));
  deliver(run, addr("generate_exports"), addr("complete"));
  deliver(run, addr("complete"), null);

  same(run.status, "completed");
  assertNoOrphans(run);
});

// ---------------------------------------------------------------------------
// 4. One gap-research cycle returns to discovery then completes
// ---------------------------------------------------------------------------

Deno.test("state machine: one gap-research cycle completes", () => {
  const run = createModel();

  // Initial cycle 0: plan → discover → rank → fetch → extract → dedup → check_coverage → gap_research
  deliver(run, addr("plan_research"), addr("discover_candidates"));
  deliver(run, addr("discover_candidates"), addr("rank_candidates"));
  deliver(run, addr("rank_candidates"), addr("fetch_sources"));
  deliver(run, addr("fetch_sources"), addr("extract_evidence"));
  deliver(run, addr("extract_evidence"), addr("deduplicate_cluster"));
  deliver(run, addr("deduplicate_cluster"), addr("check_coverage"));
  deliver(run, addr("check_coverage"), addr("gap_research"));

  // Gap research triggers a new cycle → discover_candidates at cycle 1
  deliver(run, addr("gap_research"), addr("discover_candidates", 1), {
    startNewCycle: true,
    coverageGaps: ["missing_problem_evidence"],
  });

  // Cycle 1: discover → rank → fetch → extract → dedup → check_coverage → build_specialist_packs (sufficient this time)
  deliver(run, addr("discover_candidates", 1), addr("rank_candidates", 1));
  deliver(run, addr("rank_candidates", 1), addr("fetch_sources", 1));
  deliver(run, addr("fetch_sources", 1), addr("extract_evidence", 1));
  deliver(run, addr("extract_evidence", 1), addr("deduplicate_cluster", 1));
  deliver(run, addr("deduplicate_cluster", 1), addr("check_coverage", 1));
  deliver(run, addr("check_coverage", 1), addr("build_specialist_packs", 1));

  // Post-gap: build_specialist_packs → run_specialists → scoring → charts → report → exports → complete
  deliver(run, addr("build_specialist_packs", 1), addr("run_specialists", 1));
  deliver(run, addr("run_specialists", 1), addr("compute_scoring", 1));
  deliver(run, addr("compute_scoring", 1), addr("build_charts", 1));
  deliver(run, addr("build_charts", 1), addr("generate_report", 1));
  deliver(run, addr("generate_report", 1), addr("generate_exports", 1));
  deliver(run, addr("generate_exports", 1), addr("complete", 1));
  deliver(run, addr("complete", 1), null);

  same(run.status, "completed");
  same(run.startedCycles.has(1), true, "cycle 1 was started");
  same(run.cycleGaps.get(1)?.[0], "missing_problem_evidence", "gap persisted");
  assertNoOrphans(run);
  assertUniqueTrace(run);
});

// ---------------------------------------------------------------------------
// 5. Multiple allowed gap cycles remain unique
// ---------------------------------------------------------------------------

Deno.test("state machine: multiple gap cycles have unique addresses", () => {
  const run = createModel(3); // Allow 3 cycles

  // Cycle 0: plan → discover → rank → fetch → extract → dedup → check → gap
  deliver(run, addr("plan_research"), addr("discover_candidates"));
  deliver(run, addr("discover_candidates"), addr("rank_candidates"));
  deliver(run, addr("rank_candidates"), addr("fetch_sources"));
  deliver(run, addr("fetch_sources"), addr("extract_evidence"));
  deliver(run, addr("extract_evidence"), addr("deduplicate_cluster"));
  deliver(run, addr("deduplicate_cluster"), addr("check_coverage"));
  deliver(run, addr("check_coverage"), addr("gap_research"));

  // Gap → cycle 1
  deliver(run, addr("gap_research"), addr("discover_candidates", 1), {
    startNewCycle: true,
    coverageGaps: ["gap_1"],
  });

  // Cycle 1: discover → rank → fetch → extract → dedup → check → gap
  deliver(run, addr("discover_candidates", 1), addr("rank_candidates", 1));
  deliver(run, addr("rank_candidates", 1), addr("fetch_sources", 1));
  deliver(run, addr("fetch_sources", 1), addr("extract_evidence", 1));
  deliver(run, addr("extract_evidence", 1), addr("deduplicate_cluster", 1));
  deliver(run, addr("deduplicate_cluster", 1), addr("check_coverage", 1));
  deliver(run, addr("check_coverage", 1), addr("gap_research", 1));

  // Gap → cycle 2
  deliver(run, addr("gap_research", 1), addr("discover_candidates", 2), {
    startNewCycle: true,
    coverageGaps: ["gap_2"],
  });

  // Cycle 2: discover → rank → fetch → extract → dedup → check → build_specialist_packs (sufficient)
  deliver(run, addr("discover_candidates", 2), addr("rank_candidates", 2));
  deliver(run, addr("rank_candidates", 2), addr("fetch_sources", 2));
  deliver(run, addr("fetch_sources", 2), addr("extract_evidence", 2));
  deliver(run, addr("extract_evidence", 2), addr("deduplicate_cluster", 2));
  deliver(run, addr("deduplicate_cluster", 2), addr("check_coverage", 2));
  deliver(run, addr("check_coverage", 2), addr("build_specialist_packs", 2));

  // Finish
  deliver(run, addr("build_specialist_packs", 2), addr("run_specialists", 2));
  deliver(run, addr("run_specialists", 2), addr("compute_scoring", 2));
  deliver(run, addr("compute_scoring", 2), addr("build_charts", 2));
  deliver(run, addr("build_charts", 2), addr("generate_report", 2));
  deliver(run, addr("generate_report", 2), addr("generate_exports", 2));
  deliver(run, addr("generate_exports", 2), addr("complete", 2));
  deliver(run, addr("complete", 2), null);

  same(run.status, "completed");
  same(run.startedCycles.size, 3, "three cycles started (0, 1, 2)");

  // All trace entries must be unique — no address collision
  assertUniqueTrace(run);
  assertNoOrphans(run);
});

// ---------------------------------------------------------------------------
// 6. Maximum cycle limit terminates cleanly
// ---------------------------------------------------------------------------

Deno.test("state machine: max cycle limit redirects to build_specialist_packs", () => {
  const run = createModel(1); // Only allow 1 gap cycle (0 + 1)

  // Cycle 0: plan → discover → rank → fetch → extract → dedup → check → gap
  deliver(run, addr("plan_research"), addr("discover_candidates"));
  deliver(run, addr("discover_candidates"), addr("rank_candidates"));
  deliver(run, addr("rank_candidates"), addr("fetch_sources"));
  deliver(run, addr("fetch_sources"), addr("extract_evidence"));
  deliver(run, addr("extract_evidence"), addr("deduplicate_cluster"));
  deliver(run, addr("deduplicate_cluster"), addr("check_coverage"));
  deliver(run, addr("check_coverage"), addr("gap_research"));

  // Gap → cycle 1 (allowed)
  deliver(run, addr("gap_research"), addr("discover_candidates", 1), {
    startNewCycle: true,
    coverageGaps: ["gap_1"],
  });

  // Cycle 1: full loop back to gap
  deliver(run, addr("discover_candidates", 1), addr("rank_candidates", 1));
  deliver(run, addr("rank_candidates", 1), addr("fetch_sources", 1));
  deliver(run, addr("fetch_sources", 1), addr("extract_evidence", 1));
  deliver(run, addr("extract_evidence", 1), addr("deduplicate_cluster", 1));
  deliver(run, addr("deduplicate_cluster", 1), addr("check_coverage", 1));
  deliver(run, addr("check_coverage", 1), addr("gap_research", 1));

  // Gap → cycle 2 (EXCEEDS MAX) — should redirect to build_specialist_packs at cycle 1
  deliver(run, addr("gap_research", 1), addr("discover_candidates", 2), {
    startNewCycle: true,
    coverageGaps: ["gap_2"],
  });

  // Should have been redirected to build_specialist_packs at current cycle
  const redirectedKey = stageAddressKey(addr("build_specialist_packs", 1));
  same(run.jobs.has(redirectedKey), true, "redirected to build_specialist_packs");
  same(run.cursor?.currentStage, "build_specialist_packs", "cursor at build_specialist_packs");
  same(run.cursor?.researchCycle, 1, "cursor at cycle 1");

  // Should NOT have created discover_candidates at cycle 2
  const blockedKey = stageAddressKey(addr("discover_candidates", 2));
  same(run.jobs.has(blockedKey), false, "cycle 2 discover blocked");

  // Finish from build_specialist_packs
  deliver(run, addr("build_specialist_packs", 1), addr("run_specialists", 1));
  deliver(run, addr("run_specialists", 1), addr("compute_scoring", 1));
  deliver(run, addr("compute_scoring", 1), addr("build_charts", 1));
  deliver(run, addr("build_charts", 1), addr("generate_report", 1));
  deliver(run, addr("generate_report", 1), addr("generate_exports", 1));
  deliver(run, addr("generate_exports", 1), addr("complete", 1));
  deliver(run, addr("complete", 1), null);

  same(run.status, "completed");
  assertNoOrphans(run);
});

// ---------------------------------------------------------------------------
// 7. Duplicate delivery is harmless
// ---------------------------------------------------------------------------

Deno.test("state machine: duplicate delivery is harmless", () => {
  const run = createModel();

  // Deliver plan_research → discover_candidates
  const job1 = deliver(run, addr("plan_research"), addr("discover_candidates"), { result: "first" });
  same(job1.output, "first");
  same(job1.status, "completed");

  // Deliver the same transition again — should return same result, no new job
  const jobsBefore = run.jobs.size;
  const job2 = deliver(run, addr("plan_research"), addr("discover_candidates"), { result: "duplicate" });
  same(job2.output, "first", "output unchanged from first delivery");
  same(job2.status, "completed");
  same(run.jobs.size, jobsBefore, "no new job created");

  // Progress log should show the duplicate was harmless
  const lastEntry = run.progressLog[run.progressLog.length - 1];
  same(lastEntry.statusBefore, "completed");
  same(lastEntry.statusAfter, "completed");
  same(lastEntry.jobsInserted, 0);
});

// ---------------------------------------------------------------------------
// 8. Retry attempts reuse the same logical job identity
// ---------------------------------------------------------------------------

Deno.test("state machine: retry attempts reuse same logical identity", () => {
  const run = createModel();

  // Deliver plan_research
  deliver(run, addr("plan_research"), addr("discover_candidates"));

  // Simulate a transient failure on discover_candidates — mark it for retry
  const discoverAddr = addr("discover_candidates");
  const discoverKey = stageAddressKey(discoverAddr);
  const discoverJob = run.jobs.get(discoverKey)!;

  // Retry resets status to pending but keeps the same address
  retry(run, discoverAddr);
  same(discoverJob.status, "pending", "back to pending after retry");

  // The address key is unchanged
  same(run.jobs.has(discoverKey), true, "same job key exists");
  same(run.jobs.size, 2, "no new job was created");

  // Now successfully deliver it
  deliver(run, discoverAddr, addr("rank_candidates"));
  same(discoverJob.status, "completed");
  same(discoverJob.attempts, 2, "two attempts recorded");

  // Continue to completion
  deliver(run, addr("rank_candidates"), addr("fetch_sources"));
  deliver(run, addr("fetch_sources"), addr("extract_evidence"));
  deliver(run, addr("extract_evidence"), addr("deduplicate_cluster"));
  deliver(run, addr("deduplicate_cluster"), addr("check_coverage"));
  deliver(run, addr("check_coverage"), addr("build_specialist_packs"));
  deliver(run, addr("build_specialist_packs"), addr("run_specialists"));
  deliver(run, addr("run_specialists"), addr("compute_scoring"));
  deliver(run, addr("compute_scoring"), addr("build_charts"));
  deliver(run, addr("build_charts"), addr("generate_report"));
  deliver(run, addr("generate_report"), addr("generate_exports"));
  deliver(run, addr("generate_exports"), addr("complete"));
  deliver(run, addr("complete"), null);

  same(run.status, "completed");
  assertNoOrphans(run);
});

// ---------------------------------------------------------------------------
// 9. Cancellation terminates
// ---------------------------------------------------------------------------

Deno.test("state machine: cancellation terminates and dead-letters jobs", () => {
  const run = createModel();

  // Start some work
  deliver(run, addr("plan_research"), addr("discover_candidates"));
  deliver(run, addr("discover_candidates"), addr("rank_candidates"));

  // Cancel
  cancel(run);

  same(run.status, "cancelled");
  same(run.cursor?.currentStage, null, "cursor cleared");
  same(run.cursor?.terminalizationStarted, true, "terminalization started");

  // Pending jobs should be dead-lettered
  const rankJob = run.jobs.get(stageAddressKey(addr("rank_candidates")))!;
  same(rankJob.status, "dead_letter", "pending job dead-lettered");

  // Completed jobs stay completed
  const planJob = run.jobs.get(stageAddressKey(addr("plan_research")))!;
  same(planJob.status, "completed", "completed job unchanged");

  assertNoOrphans(run);
});

// ---------------------------------------------------------------------------
// 10. Permanent failure terminates
// ---------------------------------------------------------------------------

Deno.test("state machine: permanent failure terminates and dead-letters jobs", () => {
  const run = createModel();

  deliver(run, addr("plan_research"), addr("discover_candidates"));
  deliver(run, addr("discover_candidates"), addr("rank_candidates"));
  deliver(run, addr("rank_candidates"), addr("fetch_sources"));

  // Fail
  fail(run, "data corruption in fetch_sources");

  same(run.status, "failed");
  same(run.cursor?.currentStage, null);
  same(run.cursor?.terminalizationStarted, true);

  // Pending jobs dead-lettered with reason
  const fetchJob = run.jobs.get(stageAddressKey(addr("fetch_sources")))!;
  same(fetchJob.status, "dead_letter");
  same(fetchJob.output, "data corruption in fetch_sources");

  assertNoOrphans(run);
});

// ---------------------------------------------------------------------------
// 11. No orphan non-terminal run remains
// ---------------------------------------------------------------------------

Deno.test("state machine: no orphan non-terminal run remains in any scenario", () => {
  // Scenario A: straight-line completion
  const a = createModel();
  walkStraightLine(a);
  assertNoOrphans(a);
  same(a.status, "completed");

  // Scenario B: cancellation at various points
  for (const stage of ["plan_research", "discover_candidates", "fetch_sources", "extract_evidence"] as const) {
    const b = createModel();
    // Walk up to the target stage
    const stages = STRAIGHT_LINE.slice(0, STRAIGHT_LINE.indexOf(stage) + 1);
    for (let i = 0; i < stages.length - 1; i++) {
      deliver(b, addr(stages[i]), addr(stages[i + 1]));
    }
    cancel(b);
    assertNoOrphans(b);
  }

  // Scenario C: failure at various points
  for (const stage of ["discover_candidates", "fetch_sources", "compute_scoring"] as const) {
    const c = createModel();
    const stages = STRAIGHT_LINE.slice(0, STRAIGHT_LINE.indexOf(stage) + 1);
    for (let i = 0; i < stages.length - 1; i++) {
      deliver(c, addr(stages[i]), addr(stages[i + 1]));
    }
    fail(c, `failure at ${stage}`);
    assertNoOrphans(c);
  }

  // Scenario D: gap cycle then completion
  const d = createModel();
  deliver(d, addr("plan_research"), addr("discover_candidates"));
  deliver(d, addr("discover_candidates"), addr("rank_candidates"));
  deliver(d, addr("rank_candidates"), addr("fetch_sources"));
  deliver(d, addr("fetch_sources"), addr("extract_evidence"));
  deliver(d, addr("extract_evidence"), addr("deduplicate_cluster"));
  deliver(d, addr("deduplicate_cluster"), addr("check_coverage"));
  deliver(d, addr("check_coverage"), addr("gap_research"));
  deliver(d, addr("gap_research"), addr("discover_candidates", 1), { startNewCycle: true });
  deliver(d, addr("discover_candidates", 1), addr("rank_candidates", 1));
  deliver(d, addr("rank_candidates", 1), addr("fetch_sources", 1));
  deliver(d, addr("fetch_sources", 1), addr("extract_evidence", 1));
  deliver(d, addr("extract_evidence", 1), addr("deduplicate_cluster", 1));
  deliver(d, addr("deduplicate_cluster", 1), addr("check_coverage", 1));
  deliver(d, addr("check_coverage", 1), addr("build_specialist_packs", 1));
  deliver(d, addr("build_specialist_packs", 1), addr("run_specialists", 1));
  deliver(d, addr("run_specialists", 1), addr("compute_scoring", 1));
  deliver(d, addr("compute_scoring", 1), addr("build_charts", 1));
  deliver(d, addr("build_charts", 1), addr("generate_report", 1));
  deliver(d, addr("generate_report", 1), addr("generate_exports", 1));
  deliver(d, addr("generate_exports", 1), addr("complete", 1));
  deliver(d, addr("complete", 1), null);
  assertNoOrphans(d);
  same(d.status, "completed");
});

// ---------------------------------------------------------------------------
// Bonus: graph dump produces useful output
// ---------------------------------------------------------------------------

Deno.test("state machine: graph dump produces structured diagnostic", () => {
  const run = createModel();
  deliver(run, addr("plan_research"), addr("discover_candidates"));

  const dump = graphDump(run);

  // Should contain key diagnostic elements
  if (!dump.includes("Pipeline State Graph")) {
    throw new Error("Missing header");
  }
  if (!dump.includes("plan_research")) {
    throw new Error("Missing plan_research in dump");
  }
  if (!dump.includes("discover_candidates")) {
    throw new Error("Missing discover_candidates in dump");
  }
  if (!dump.includes("✓")) {
    throw new Error("Missing completion marker");
  }
  if (!dump.includes("○")) {
    throw new Error("Missing pending marker");
  }
});
