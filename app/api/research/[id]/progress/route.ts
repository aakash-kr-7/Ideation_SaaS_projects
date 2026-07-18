import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getReportModeConfig } from "@/lib/report-modes";
import { errorMessage } from "@/lib/supabase/relations";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const dbClient = supabase;
    
    // Fetch run status
    const { data: dbRun, error: dbRunError } = await dbClient
      .from("research_runs")
      .select("id, mode, status, progress, progress_detail, error_message, credit_state")
      .eq("id", id)
      .single();

    if (dbRunError || !dbRun) {
      return NextResponse.json({ error: "Research run not found" }, { status: 404 });
    }
    const config = getReportModeConfig(dbRun.mode);

    // Fetch counts in parallel
    const [sourcesRes, evidenceRes, reportRes] = await Promise.all([
      dbClient.from("sources").select("id", { count: "exact", head: true }).eq("run_id", id),
      dbClient.from("evidence_items").select("id", { count: "exact", head: true }).eq("run_id", id),
      dbClient.from("reports").select("id, opportunity_id").eq("run_id", id).maybeSingle()
    ]);

    const sourceCount = sourcesRes.count ?? 0;
    const evidenceCount = evidenceRes.count ?? 0;
    const reportReady = Boolean(reportRes.data);

    let competitorCount = 0;
    if (reportRes.data?.opportunity_id) {
      const compRes = await dbClient
        .from("competitors")
        .select("id", { count: "exact", head: true })
        .eq("opportunity_id", reportRes.data.opportunity_id);
      competitorCount = compRes.count ?? 0;
    }

    return NextResponse.json({
      id: dbRun.id,
      mode: dbRun.mode,
      reportName: config.label,
      stage: dbRun.status,
      progress: dbRun.progress,
      message: dbRun.status === "Failed" ? dbRun.error_message : dbRun.progress_detail ?? dbRun.status,
      evidenceCount,
      sourceCount,
      competitorCount,
      reportReady,
      creditState: dbRun.credit_state,
      creditRestored: dbRun.status === "Failed" && dbRun.credit_state === "restored",
      progressSteps: config.progress,
      error: dbRun.status === "Failed" ? dbRun.error_message : null
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
