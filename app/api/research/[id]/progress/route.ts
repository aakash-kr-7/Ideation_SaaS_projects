import { NextResponse } from "next/server";
import { researchStore } from "@/lib/research/store";
import { createClient } from "@/lib/supabase/server";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 1. Check local mock store first
  const run = researchStore.get(id);
  if (run) {
    return NextResponse.json({
      id: run.id,
      stage: run.stage,
      progress: run.progress,
      message: run.message,
      evidenceCount: run.evidence.length,
      sourceCount: run.sources.length,
      competitorCount: run.report?.opportunity.competitors.length ?? 0,
      reportReady: Boolean(run.report),
      error: run.error
    });
  }

  // 2. Query database for real run progress
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const dbClient = user ? supabase : (() => {
      const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
      return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
    })();
    
    // Fetch run status
    const { data: dbRun, error: dbRunError } = await dbClient
      .from("research_runs")
      .select("id, status, progress, error_message")
      .eq("id", id)
      .single();

    if (dbRunError || !dbRun) {
      return NextResponse.json({ error: "Research run not found" }, { status: 404 });
    }

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
      stage: dbRun.status,
      progress: dbRun.progress,
      message: dbRun.status === "Failed" ? dbRun.error_message : `${dbRun.status}...`,
      evidenceCount,
      sourceCount,
      competitorCount,
      reportReady,
      error: dbRun.status === "Failed" ? dbRun.error_message : null
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
