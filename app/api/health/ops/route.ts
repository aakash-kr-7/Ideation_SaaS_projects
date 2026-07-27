import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Operational dashboard endpoint — service-role only.
 * Aggregates queue, failure, alert, and usage metrics.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 3600_000).toISOString();

    const [
      pendingResult,
      claimedResult,
      stuckRunsResult,
      failedRunsResult,
      completedRunsResult,
      totalRunsResult,
      openAlertsResult,
      recentFailedJobsResult,
    ] = await Promise.all([
      admin.from("research_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("research_jobs").select("id", { count: "exact", head: true }).eq("status", "claimed"),
      admin.from("research_runs").select("id", { count: "exact", head: true }).in("status", ["Queued", "Running"]).lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString()),
      admin.from("research_runs").select("id", { count: "exact", head: true }).eq("status", "Failed").gte("updated_at", twentyFourHoursAgo),
      admin.from("research_runs").select("id", { count: "exact", head: true }).eq("status", "Completed").gte("terminal_at", twentyFourHoursAgo),
      admin.from("research_runs").select("id", { count: "exact", head: true }).gte("created_at", twentyFourHoursAgo),
      admin.from("operational_alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
      admin.from("research_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", twentyFourHoursAgo),
    ]);

    const totalRuns24h = totalRunsResult.count ?? 0;
    const failedRuns24h = failedRunsResult.count ?? 0;
    const completedRuns24h = completedRunsResult.count ?? 0;

    return NextResponse.json({
      service: "shouldbuild-ops",
      queue: {
        pendingJobs: pendingResult.count ?? 0,
        claimedJobs: claimedResult.count ?? 0,
        stuckRuns: stuckRunsResult.count ?? 0,
      },
      last24h: {
        totalRuns: totalRuns24h,
        completedRuns: completedRuns24h,
        failedRuns: failedRuns24h,
        failedJobs: recentFailedJobsResult.count ?? 0,
        failureRate: totalRuns24h > 0 ? +(failedRuns24h / totalRuns24h).toFixed(3) : 0,
      },
      alerts: {
        openAlerts: openAlertsResult.count ?? 0,
      },
      checkedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Ops health check failed" }, { status: 500 });
  }
}
