import { createClient } from "@supabase/supabase-js";
import {
  runReasoningPhase,
  runResearchPipeline,
} from "../_shared/research/pipeline.ts";

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
    // 1. Webhook Security: Verify Webhook Secret
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET");
    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await req.json();
    const record = payload.record;
    if (!record || !record.id) {
      throw new Error("Invalid payload: no record ID");
    }

    // Initialize Supabase client with Service Role key to bypass RLS for background jobs
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const reasoningOnly = payload.phase === "reasoning" ||
      record.status === "Normalizing";
    // 2. Idempotency: full runs claim Queued; reasoning resumes claim Normalizing.
    console.log(`Checking status and initializing run ${record.id}...`);
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

    // If no rows were returned, it means the run is not Queued. Skip processing.
    if (!update1Data || update1Data.length === 0) {
      console.log(`Run ${record.id} is not in Queued state. Skipping.`);
      return new Response(
        JSON.stringify({
          message: "Skipped: Not in Queued state",
          run_id: record.id,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // Map record data to ResearchRequest
    const requestPayload = {
      ideaName: record.idea_name,
      ideaDescription: record.idea_description,
      targetCustomer: record.target_customer,
      marketType: record.market_type || "B2B",
      targetRegion: record.target_region || "Global",
      depth: (record.mode === "Fast Scan" ? "fast" : "deep") as "fast" | "deep",
    };

    console.log(
      `Scheduling ${
        reasoningOnly ? "reasoning" : "full evidence"
      } pipeline for run ${record.id}...`,
    );
    EdgeRuntime.waitUntil(
      (reasoningOnly
        ? runReasoningPhase(record.id, requestPayload, supabaseClient)
        : runResearchPipeline(record.id, requestPayload, supabaseClient)).catch(
          (error) => {
            console.error(`Background pipeline ${record.id} failed:`, error);
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
