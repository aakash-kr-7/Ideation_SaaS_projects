import { PIPELINE_STAGES, STAGE_TRANSITIONS, isPipelineStage, stageAddressKey, stageCompleted, stageFailed } from "./stages.ts";
import { completeJob, failJob, recoverStaleJobs, validateJobStage } from "./job-queue.ts";

function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
const runId = "00000000-0000-4000-8000-000000000001";

Deno.test("the queue exposes exactly one eight-stage Gemini hybrid path", () => {
  const expected = ["plan", "grounded_research", "evidence_boosters", "validate_normalize", "analyze_score", "generate_report", "generate_exports", "complete"];
  assert(JSON.stringify(PIPELINE_STAGES) === JSON.stringify(expected), "unexpected pipeline stages");
  let current: (typeof PIPELINE_STAGES)[number] | null = "plan";
  const visited: string[] = [];
  while (current) { visited.push(current); current = STAGE_TRANSITIONS[current]; }
  assert(JSON.stringify(visited) === JSON.stringify(expected), "transitions diverge from canonical order");
  assert(!isPipelineStage("plan_research") && !isPipelineStage("legacy_finalize"), "legacy stage remains valid");
});

Deno.test("stage addresses are stable and distinguish logical work", () => {
  const base = { runId, researchCycle: 0, stage: "plan" as const, stageIteration: 0, batchIndex: 0 };
  assert(stageAddressKey(base) === stageAddressKey({ ...base }), "same address changed key");
  assert(stageAddressKey(base) !== stageAddressKey({ ...base, stage: "grounded_research" }), "different stage collided");
});

Deno.test("stage result helpers preserve success and terminal failure semantics", () => {
  const success = stageCompleted("grounded_research", { planned: true }, { duration_ms: 5 }, { nextInputMeta: { mode: "quick_scan" } });
  assert(success.status === "completed" && success.nextStage === "grounded_research", "success transition lost");
  const failure = stageFailed("permanent", "invalid evidence");
  assert(failure.status === "failed" && failure.nextStage === null && failure.error?.class === "permanent", "failure was not terminal");
});

Deno.test("invalid and retired stages are rejected before dispatch", () => {
  let threw = false;
  try { validateJobStage("plan_research"); } catch { threw = true; }
  assert(threw, "legacy stage reached executor dispatch");
});

Deno.test("queue completion passes the canonical next stage to the atomic RPC", async () => {
  let captured: any = null;
  const db = { rpc: async (_name: string, params: Record<string, unknown>) => { captured = params; return { data: { status: "completed" }, error: null }; } };
  const result = await completeJob(db, { jobId: runId, nextStage: "grounded_research", nextInputMeta: { mode: "quick_scan" } });
  assert(result.status === "completed" && captured?.p_next_stage === "grounded_research", "next stage was not committed");
  assert(!("p_start_new_research_cycle" in captured), "retired research-cycle parameter was sent");
});

Deno.test("failure path returns the database terminal state", async () => {
  const db = { rpc: async () => ({ data: { status: "dead_letter", retried: false }, error: null }) };
  const result = await failJob(db, runId, "permanent", "citation integrity failed");
  assert(result.status === "dead_letter" && result.retried === false, "failure was reported as passed without terminalization");
});

Deno.test("stale recovery reports the exact recovered count", async () => {
  const db = { rpc: async (name: string) => ({ data: name === "recover_stale_research_jobs" ? 2 : 0, error: null }) };
  assert(await recoverStaleJobs(db) === 2, "stale recovery result was swallowed");
});
