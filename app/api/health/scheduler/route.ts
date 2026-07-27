import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Scheduler health endpoint — service-role only.
 * Reports orphaned runs, pending count, and open alerts.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();

    const [orphanedResult, pendingResult, alertsResult] = await Promise.all([
      admin.from("research_runs").select("id", { count: "exact", head: true }).in("status", ["Queued", "Running"]).lt("updated_at", new Date(Date.now() - 60 * 60_000).toISOString()),
      admin.from("research_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      admin.from("operational_alerts").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    return NextResponse.json({
      service: "shouldbuild-scheduler-health",
      orphanedRuns: orphanedResult.count ?? 0,
      pendingJobs: pendingResult.count ?? 0,
      openAlerts: alertsResult.count ?? 0,
      checkedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
