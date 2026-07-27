import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Worker health endpoint — service-role only.
 * Reports queue depth, stuck runs, and last worker activity.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();

    const [pendingResult, stuckResult, lastCompletedResult, failedResult] = await Promise.all([
      admin.from("research_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("research_runs").select("id", { count: "exact", head: true }).in("status", ["Queued", "Running"]).lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString()),
      admin.from("research_jobs").select("completed_at").eq("status", "completed").order("completed_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("research_runs").select("id", { count: "exact", head: true }).eq("status", "Failed").gte("updated_at", new Date(Date.now() - 24 * 3600_000).toISOString()),
    ]);

    return NextResponse.json({
      service: "shouldbuild-worker-health",
      pendingJobs: pendingResult.count ?? 0,
      stuckRuns: stuckResult.count ?? 0,
      lastWorkerCompletion: lastCompletedResult.data?.completed_at ?? null,
      failedRuns24h: failedResult.count ?? 0,
      checkedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
