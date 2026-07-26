/**
 * Scheduled polling function: processes pending research jobs and recovers stale claims.
 *
 * This function serves two purposes:
 * 1. Polling fallback: invokes the research worker when pending jobs exist
 *    (handles cases where self-trigger fails)
 * 2. Stale recovery: reclaims jobs that were claimed but never completed
 *    past their visibility timeout
 *
 * Should be invoked by pg_cron or external scheduler every 15-30 seconds.
 */

import { createClient } from "@supabase/supabase-js";
import { countPendingJobs, recoverStaleJobs, attemptSelfTrigger } from "../_shared/research/job-queue.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requestedRunId = typeof body?.runId === "string" && /^[0-9a-f-]{36}$/i.test(body.runId)
      ? body.runId
      : undefined;

    // --- 1. Recover stale jobs ---
    const recovered = await recoverStaleJobs(db as never, 180_000, requestedRunId);
    const { data: orphaned, error: orphanError } = requestedRunId
      ? { data: 0, error: null }
      : await (db.rpc as any)("recover_orphaned_research_runs", { p_stale_after: "15 minutes" });
    if (orphanError) throw orphanError;
    if (recovered > 0) {
      console.log(`[scheduler] Recovered ${recovered} stale job(s)`);
    }

    // --- 2. Check for pending jobs ---
    const pendingCount = await countPendingJobs(db as never, requestedRunId);
    const { data: alerts, error: alertError } = requestedRunId
      ? { data: null, error: null }
      : await (db.rpc as any)("collect_research_operational_alerts", {});
    if (alertError) throw alertError;

    if (pendingCount > 0) {
      console.log(`[scheduler] ${pendingCount} pending job(s), triggering worker`);

      // Trigger the worker — best-effort
      const triggered = await attemptSelfTrigger(requestedRunId);
      if (!triggered) {
        console.warn("[scheduler] Worker trigger failed — will retry next cycle");
      }
    }

    return new Response(
      JSON.stringify({
        recovered,
        orphaned: orphaned ?? 0,
        pending: pendingCount,
        triggered: pendingCount > 0,
        runId: requestedRunId ?? null,
        alerts,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error("[scheduler] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
