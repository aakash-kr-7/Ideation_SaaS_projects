/**
 * Scheduled polling function: processes pending research jobs and recovers stale claims.
 *
 * This function serves two purposes:
 * 1. Polling fallback: invokes the research worker when pending jobs exist
 *    (handles cases where self-trigger fails)
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

// Scheduler is invoked server-to-server by pg_cron or an external cron.
const corsHeaders = {
  "Access-Control-Allow-Origin": "",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** Timing-safe comparison to prevent timing attacks on secret tokens. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) return false;
  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!webhookSecret || !token || !timingSafeEqual(token, webhookSecret)) {
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

    // --- 3. Wake due living-report refreshes ---
    // The refresh worker owns page checks, changed-claim extraction, scoring,
    // immutable versioning, and artifact regeneration. The scheduler only
    // routes due reports and never calls a model itself.
    let refreshDue = 0;
    let refreshTriggered = 0;
    let manualRefreshQueued = 0;
    let manualRefreshTriggered = 0;
    if (!requestedRunId) {
      const { data: pendingRefreshes, error: pendingRefreshError } = await db
        .from("report_refresh_requests")
        .select("id,report_id")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(3);
      if (pendingRefreshError) throw pendingRefreshError;
      manualRefreshQueued = pendingRefreshes?.length || 0;
      const refreshUrl =
        `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/report-refresh-worker`;
      const manualOutcomes = await Promise.all(
        (pendingRefreshes || []).map(async (request) => {
          const { data: claimed } = await db.from("report_refresh_requests")
            .update({ status: "running", started_at: new Date().toISOString() })
            .eq("id", request.id).eq("status", "pending").select("id")
            .maybeSingle();
          if (!claimed) return false;
          try {
            const response = await fetch(refreshUrl, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${webhookSecret}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                reportId: request.report_id,
                requestId: request.id,
                trigger: "manual",
              }),
              signal: AbortSignal.timeout(10_000),
            });
            const result = await response.json().catch(() => ({}));
            if (response.ok && result.status !== "already_running") return true;
            await db.from("report_refresh_requests").update({
              status: result.status === "already_running" ? "pending" : "failed",
              error_message: result.error || (
                result.status === "already_running"
                  ? null
                  : `Refresh worker returned ${response.status}.`
              ),
              started_at: result.status === "already_running"
                ? null
                : new Date().toISOString(),
              completed_at: result.status === "already_running"
                ? null
                : new Date().toISOString(),
            }).eq("id", request.id);
          } catch (error) {
            await db.from("report_refresh_requests").update({
              status: "failed",
              error_message: error instanceof Error
                ? error.message
                : String(error),
              completed_at: new Date().toISOString(),
            }).eq("id", request.id);
          }
          return false;
        }),
      );
      manualRefreshTriggered = manualOutcomes.filter(Boolean).length;

      const { data: dueSchedules, error: dueError } = await db
        .from("report_refresh_schedules")
        .select("report_id")
        .eq("enabled", true)
        .lte("next_refresh_at", new Date().toISOString())
        .order("next_refresh_at", { ascending: true })
        .limit(3);
      if (dueError) throw dueError;
      refreshDue = dueSchedules?.length || 0;
      const outcomes = await Promise.all((dueSchedules || []).map(async (schedule) => {
        try {
          const response = await fetch(refreshUrl, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${webhookSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              reportId: schedule.report_id,
              trigger: "scheduled",
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (response.ok) return true;
          else {
            console.warn(
              `[scheduler] Report refresh ${schedule.report_id} returned ${response.status}`,
            );
          }
        } catch (error) {
          console.warn(
            `[scheduler] Report refresh ${schedule.report_id} failed to trigger`,
            error,
          );
        }
        return false;
      }));
      refreshTriggered = outcomes.filter(Boolean).length;
    }

    return new Response(
      JSON.stringify({
        recovered,
        orphaned: orphaned ?? 0,
        pending: pendingCount,
        triggered: pendingCount > 0,
        runId: requestedRunId ?? null,
        alerts,
        livingReports: {
          manualQueued: manualRefreshQueued,
          manualTriggered: manualRefreshTriggered,
          due: refreshDue,
          triggered: refreshTriggered,
        },
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
