import { createClient } from "@supabase/supabase-js";
import { getReportModeConfig } from "../_shared/research/mode-config.ts";
import { claimJob, commitStageResult, validateJobStage } from "../_shared/research/job-queue.ts";
import { executeStage } from "../_shared/research/executor-registry.ts";
import type { StageContext } from "../_shared/research/stages.ts";
import { createProductionDependencies } from "../_shared/research/dependencies.ts";
import { createFixtureDependencies } from "../_shared/research/test-fixtures.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorized = (webhookSecret && authHeader === `Bearer ${webhookSecret}`) || (serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`);
    if (!authorized) return jsonResponse({ error: "Unauthorized" }, 401);

    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey ?? "");
    const fixtureMode = req.headers.get("X-Research-Fixture") === "deterministic";
    const fixtureOptions = req.headers.get("X-Fixture-Options");
    let options = {};
    if (fixtureMode && fixtureOptions) {
      try { options = JSON.parse(fixtureOptions); } catch { /* ignore parse errors */ }
    }
    // Requests only wake a durable queue consumer. They can never execute a run payload directly.
    return await handleStagedClaim(db, fixtureMode, options);
  } catch (error) {
    console.error("Worker error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function handleStagedClaim(db: any, fixtureMode = false, fixtureOptions: any = {}): Promise<Response> {
  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
  const job = await claimJob(db, workerId, 55_000);
  if (!job) return jsonResponse({ message: "No pending jobs", worker: workerId });

  const { data: run } = await db.from("research_runs").select("mode,status").eq("id", job.run_id).single();
  if (!run || ["Completed", "Failed", "Cancelled"].includes(run.status)) {
    await commitStageResult(db, job.id, {
      status: "failed", nextStage: null, nextInputMeta: {}, nextStageIteration: 0, nextBatchIndex: 0,
      nextBatchSize: 0, nextJobPurpose: "stage", outputMeta: {}, metrics: {},
      error: { class: "permanent", message: run ? `Run is terminal: ${run.status}` : "Run not found" },
    });
    return jsonResponse({ error: run ? "Run is terminal" : "Run not found", job_id: job.id }, run ? 409 : 404);
  }

  const ctx: StageContext = {
    runId: job.run_id, jobId: job.id, attemptNumber: job.attempt_count, researchCycle: job.research_cycle, stageIteration: job.stage_iteration,
    batchIndex: job.batch_index, batchSize: job.batch_size, inputMeta: job.input_meta || {},
    config: getReportModeConfig(run.mode), db, startedAt: Date.now(),
    dependencies: fixtureMode ? createFixtureDependencies(fixtureOptions) : createProductionDependencies(db),
  };
  const stage = validateJobStage(job.stage);
  const stageResult = await executeStage(stage, ctx);
  await commitStageResult(db, job.id, stageResult, { fixtureMode });
  return jsonResponse({ message: "Stage processed", job_id: job.id, stage, status: stageResult.status, next_stage: stageResult.nextStage, worker: workerId }, 202);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });
}
