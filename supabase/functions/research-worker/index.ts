import { createClient } from "@supabase/supabase-js";
import {
  runReasoningPhase,
  runResearchPipeline,
} from "../_shared/research/pipeline.ts";
import { getReportModeConfig } from "../_shared/research/mode-config.ts";
import {
  claimJob,
  commitStageResult,
  validateJobStage,
  isStaged,
  resolvePipelineVersion,
} from "../_shared/research/job-queue.ts";
import { executeStage } from "../_shared/research/executor-registry.ts";
import type { StageContext } from "../_shared/research/stages.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth: accept either webhook secret or service role key ---
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const isWebhook = webhookSecret && authHeader === `Bearer ${webhookSecret}`;
    const isServiceRole = serviceRoleKey && authHeader === `Bearer ${serviceRoleKey}`;

    if (!isWebhook && !isServiceRole) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize service-role client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const payload = await req.json().catch(() => ({}));

    // --- Route: self-trigger or polling (no record payload) ---
    if (payload.trigger === "self" || payload.trigger === "poll") {
      return await handleStagedClaim(supabaseClient);
    }

    // --- Route: webhook-triggered run (legacy path) ---
    const record = payload.record;
    if (!record || !record.id) {
      // No record — try claiming from the queue
      return await handleStagedClaim(supabaseClient);
    }

    // --- Determine pipeline version ---
    // Check if the run has been explicitly flagged for staged pipeline
    const { data: runRow } = await supabaseClient
      .from("research_runs")
      .select("pipeline_version")
      .eq("id", record.id)
      .maybeSingle();

    const pipelineVersion = runRow?.pipeline_version || resolvePipelineVersion();

    if (isStaged(pipelineVersion)) {
      // Staged pipeline: the webhook created the initial job, just claim it
      return await handleStagedClaim(supabaseClient);
    }

    // --- Legacy pipeline path (preserved during migration) ---
    return await handleLegacyRun(supabaseClient, payload, record);
  } catch (error: any) {
    console.error("Worker error:", error);
    const errorMessage = error instanceof Error
      ? error.message
      : JSON.stringify(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});

// ---------------------------------------------------------------------------
// Staged pipeline: claim one job, execute one stage, commit result
// ---------------------------------------------------------------------------

async function handleStagedClaim(db: any): Promise<Response> {
  const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;

  // Claim the next visible pending job (FOR UPDATE SKIP LOCKED)
  const job = await claimJob(db, workerId, 55_000); // 55s visibility for ~60s Edge Function limit

  if (!job) {
    return new Response(
      JSON.stringify({ message: "No pending jobs", worker: workerId }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  }

  console.log(`[${workerId}] Claimed job ${job.id}: stage=${job.stage} run=${job.run_id} attempt=${job.attempt_count}`);

  // Load mode config for the run
  const { data: run } = await db
    .from("research_runs")
    .select("mode")
    .eq("id", job.run_id)
    .single();

  if (!run) {
    await commitStageResult(db, job.id, {
      status: "failed",
      nextStage: null,
      nextInputMeta: {},
      nextStageIteration: 0,
      nextBatchIndex: 0,
      nextBatchSize: 0,
      nextJobPurpose: "stage",
      outputMeta: {},
      metrics: {},
      error: { class: "permanent", message: "Run not found" },
    });
    return jsonResponse({ error: "Run not found", job_id: job.id }, 404);
  }

  const config = getReportModeConfig(run.mode);
  const stage = validateJobStage(job.stage);

  // Build stage context
  const ctx: StageContext = {
    runId: job.run_id,
    jobId: job.id,
    attemptNumber: job.attempt_count,
    stageIteration: job.stage_iteration,
    batchIndex: job.batch_index,
    batchSize: job.batch_size,
    inputMeta: job.input_meta || {},
    config,
    db,
    startedAt: Date.now(),
  };

  // Execute the stage — error handling is inside executeStage
  const result = await executeStage(stage, ctx);

  console.log(`[${workerId}] Stage ${stage} completed: status=${result.status} next=${result.nextStage}`);

  // Commit result and enqueue next stage (atomic DB transaction)
  // Self-trigger is performed AFTER the commit, fire-and-forget
  await commitStageResult(db, job.id, result);

  return new Response(
    JSON.stringify({
      message: "Stage processed",
      job_id: job.id,
      stage,
      status: result.status,
      next_stage: result.nextStage,
      worker: workerId,
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202,
    },
  );
}

// ---------------------------------------------------------------------------
// Legacy pipeline path (preserved during migration behind feature flag)
// ---------------------------------------------------------------------------

async function handleLegacyRun(
  supabaseClient: any,
  payload: any,
  record: any,
): Promise<Response> {
  const reasoningOnly = payload.phase === "reasoning" ||
    record.status === "Normalizing";

  console.log(`[legacy] Checking status for run ${record.id}...`);

  const { data: update1Data, error: update1Error } = await supabaseClient
    .from("research_runs")
    .update(
      reasoningOnly
        ? { progress_detail: "Reasoning worker claimed normalized run" }
        : {
          status: "Searching",
          progress: 10,
          progress_detail: "Evidence worker claimed queued run",
        },
    )
    .eq("id", record.id)
    .eq("status", reasoningOnly ? "Normalizing" : "Queued")
    .select();

  if (update1Error) throw update1Error;

  if (!update1Data || update1Data.length === 0) {
    console.log(`[legacy] Run ${record.id} is not in expected state. Skipping.`);
    return new Response(
      JSON.stringify({
        message: "Skipped: Not in expected state",
        run_id: record.id,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  }

  const claimed = update1Data[0];
  const modeConfig = getReportModeConfig(claimed.mode);
  const requestPayload = {
    ideaName: claimed.idea_name,
    ideaDescription: claimed.idea_description,
    targetCustomer: claimed.target_customer,
    marketType: claimed.market_type || "B2B",
    targetRegion: claimed.target_region || "Global",
    mode: modeConfig.mode,
  };

  console.log(
    `[legacy] Scheduling ${
      reasoningOnly ? "reasoning" : "full evidence"
    } ${modeConfig.label} pipeline for run ${record.id}...`,
  );

  EdgeRuntime.waitUntil(
    (reasoningOnly
      ? runReasoningPhase(record.id, requestPayload, supabaseClient)
      : runResearchPipeline(record.id, requestPayload, supabaseClient)).catch(
        (error) => {
          console.error(`[legacy] Background pipeline ${record.id} failed:`, error);
        },
      ),
  );

  return new Response(
    JSON.stringify({ message: "Accepted for processing", run_id: record.id }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 202,
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
