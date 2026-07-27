import { createClient } from "@supabase/supabase-js";
import { getReportModeConfig } from "../_shared/research/mode-config.ts";
import { claimJob, commitStageResult, validateJobStage } from "../_shared/research/job-queue.ts";
import { executeStage } from "../_shared/research/executor-registry.ts";
import type { StageContext } from "../_shared/research/stages.ts";
import { createProductionDependencies } from "../_shared/research/dependencies.ts";
import { costBudgetForRun, reconcileUsageMetrics } from "../_shared/research/pipeline-utils.ts";
import { getGeminiModelConfig } from "../_shared/research/gemini.ts";

// Workers are invoked server-to-server. Browsers must not call this endpoint.
// Restrict CORS to deny cross-origin browser requests.
const corsHeaders = {
  "Access-Control-Allow-Origin": "",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Timing-safe comparison to prevent timing attacks on secret tokens. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  // Deno and modern runtimes support crypto.subtle.timingSafeEqual
  // Fallback to constant-time comparison
  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authorized =
      (webhookSecret && token && timingSafeEqual(token, webhookSecret)) ||
      (serviceRoleKey && token && timingSafeEqual(token, serviceRoleKey));
    if (!authorized) return jsonResponse({ error: "Unauthorized" }, 401);

    const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceRoleKey ?? "");
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    if (body?.action === "gemini-diagnostic") {
      const runId = typeof body.runId === "string" ? body.runId : "";
      const { data: run, error } = await db.from("research_runs").select("mode").eq("id", runId).single();
      if (error || !run) return jsonResponse({ error: "A valid diagnostic run is required." }, 400);
      if (!Deno.env.get("GEMINI_API_KEY")) {
        const configuredModels = getGeminiModelConfig();
        return jsonResponse({
          geminiKeyPresent: false,
          configuredModels,
          modelChecks: [...new Set(Object.values(configuredModels))].map((model) => ({ model, success: false })),
          googleSearchGroundingMetadata: false,
        }, 503);
      }
      const dependencies = createProductionDependencies(db);
      const diagnostic = await dependencies.createGemini().diagnose({
        runId, db, budget: await costBudgetForRun(runId, db, getReportModeConfig(run.mode)),
      });
      await reconcileUsageMetrics(runId, db);
      return jsonResponse(diagnostic);
    }
    // Requests only wake a durable queue consumer. They can never execute a run payload directly.
    const requestedRunId = typeof body?.runId === "string" && /^[0-9a-f-]{36}$/i.test(body.runId)
      ? body.runId
      : undefined;
    return await handleStagedClaim(db, requestedRunId);
  } catch (error) {
    console.error("Worker error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

async function handleStagedClaim(db: any, requestedRunId?: string): Promise<Response> {
  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
  const job = await claimJob(db, workerId, 150_000, requestedRunId);
  if (!job) return jsonResponse({ message: "No pending jobs", worker: workerId });
  if (requestedRunId && job.run_id !== requestedRunId) {
    console.error(JSON.stringify({ event: "worker_scope_violation", requestedRunId, claimedRunId: job.run_id, jobId: job.id }));
    return jsonResponse({ error: "Worker claimed a job outside the requested run namespace.", requested_run_id: requestedRunId, claimed_run_id: job.run_id }, 409);
  }

  const { data: run } = await db.from("research_runs").select("mode,status").eq("id", job.run_id).single();
  if (!run || ["Completed", "Failed", "Cancelled"].includes(run.status)) {
    await commitStageResult(db, job.id, {
      status: "failed", nextStage: null, nextInputMeta: {}, nextStageIteration: 0, nextBatchIndex: 0,
      nextBatchSize: 0, nextJobPurpose: "stage", outputMeta: {}, metrics: {},
      error: { class: "permanent", message: run ? `Run is terminal: ${run.status}` : "Run not found" },
    }, requestedRunId);
    return jsonResponse({ error: run ? "Run is terminal" : "Run not found", job_id: job.id }, run ? 409 : 404);
  }

  const ctx: StageContext = {
    runId: job.run_id, jobId: job.id, attemptNumber: job.attempt_count, researchCycle: job.research_cycle, stageIteration: job.stage_iteration,
    batchIndex: job.batch_index, batchSize: job.batch_size, inputMeta: job.input_meta || {},
    config: getReportModeConfig(run.mode), db, startedAt: Date.now(),
    dependencies: createProductionDependencies(db),
  };
  const stage = validateJobStage(job.stage);
  const stageResult = await executeStage(stage, ctx);
  await reconcileUsageMetrics(job.run_id, db);
  await commitStageResult(db, job.id, stageResult, requestedRunId);
  return jsonResponse({ message: "Stage processed", run_id: job.run_id, job_id: job.id, stage, status: stageResult.status, next_stage: stageResult.nextStage, worker: workerId }, 202);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });
}
