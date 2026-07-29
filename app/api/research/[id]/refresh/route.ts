import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh_now") }),
  z.object({
    action: z.literal("set_schedule"),
    enabled: z.boolean(),
    cadenceDays: z.number().int().min(1).max(30).default(1),
  }),
]);

async function ownedReport(runId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Authentication required", status: 401 } as const;
  const { data: run } = await supabase.from("research_runs")
    .select("id,mode").eq("id", runId).maybeSingle();
  if (!run) return { error: "Research run not found", status: 404 } as const;
  if (run.mode !== "full_validation") {
    return {
      error: "Living-report refresh is available for Full Validation reports.",
      status: 409,
    } as const;
  }
  const admin = createServiceRoleClient();
  const { data: report, error } = await admin.from("reports")
    .select("id").eq("run_id", runId).maybeSingle();
  if (error || !report) {
    return { error: "Report not found", status: 404 } as const;
  }
  return { admin, reportId: report.id, userId: user.id } as const;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owned = await ownedReport(id);
  if ("error" in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }
  const [{ data: schedule }, { data: runs }, { data: request }] =
    await Promise.all([
      owned.admin.from("report_refresh_schedules").select(
        "enabled,cadence_days,next_refresh_at,last_refresh_status,updated_at",
      ).eq("report_id", owned.reportId).maybeSingle(),
      owned.admin.from("report_refresh_runs").select(
        "id,status,sources_checked,successful_no_change_checks,material_changes,llm_calls,created_version_id,started_at,completed_at,error_message",
      ).eq("report_id", owned.reportId).order("started_at", {
        ascending: false,
      }).limit(5),
      owned.admin.from("report_refresh_requests").select(
        "id,status,error_message,created_at,started_at,completed_at",
      ).eq("report_id", owned.reportId).order("created_at", {
        ascending: false,
      }).limit(1).maybeSingle(),
    ]);
  return NextResponse.json({
    schedule: schedule
      ? {
        enabled: schedule.enabled,
        cadenceDays: schedule.cadence_days,
        nextRefreshAt: schedule.next_refresh_at,
        lastRefreshStatus: schedule.last_refresh_status,
      }
      : {
        enabled: false,
        cadenceDays: 1,
        nextRefreshAt: null,
        lastRefreshStatus: null,
      },
    latestRequest: request,
    runs: runs ?? [],
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const owned = await ownedReport(id);
  if ("error" in owned) {
    return NextResponse.json({ error: owned.error }, { status: owned.status });
  }
  const parsed = commandSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid refresh command." }, {
      status: 400,
    });
  }
  if (parsed.data.action === "set_schedule") {
    const { error } = await owned.admin.from("report_refresh_schedules").upsert({
      report_id: owned.reportId,
      enabled: parsed.data.enabled,
      cadence_days: parsed.data.cadenceDays,
      next_refresh_at: parsed.data.enabled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "report_id" });
    if (error) {
      return NextResponse.json({ error: "Refresh schedule could not be saved." }, {
        status: 500,
      });
    }
    return NextResponse.json({
      enabled: parsed.data.enabled,
      cadenceDays: parsed.data.cadenceDays,
    });
  }

  const { data, error } = await owned.admin.from("report_refresh_requests")
    .insert({
      report_id: owned.reportId,
      requested_by: owned.userId,
      status: "pending",
    }).select("id,status,created_at").single();
  if (error?.code === "23505") {
    const { data: existing } = await owned.admin.from("report_refresh_requests")
      .select("id,status,created_at").eq("report_id", owned.reportId)
      .in("status", ["pending", "running"]).maybeSingle();
    return NextResponse.json({
      request: existing,
      message: "A refresh is already queued or running.",
    }, { status: 202 });
  }
  if (error || !data) {
    return NextResponse.json({ error: "Refresh could not be queued." }, {
      status: 500,
    });
  }
  return NextResponse.json({
    request: data,
    message: "Refresh queued. Only cited or decision-critical pages will be checked.",
  }, { status: 202 });
}
