import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validationReportSchema } from "@/lib/report-schema";
import { loadReportForRun } from "@/lib/report-data";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const { data, error } = await supabase
    .from("research_runs")
    .select("id,project_id,idea_name,idea_description,target_customer,market_type,target_region,assumptions,mode,status,current_stage,created_at,terminal_at,credit_cost,credit_state")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "The report could not be loaded." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Research run not found" }, { status: 404 });
  const loaded = data.status === "Completed" ? await loadReportForRun(id) : null;
  if (loaded?.state === "access_denied") return NextResponse.json({ error: "Research run not found" }, { status: 404 });
  if (loaded?.state === "pending") {
    return NextResponse.json(
      { run: data, report: null, retryable: true, reason: loaded.reason },
      { status: 202, headers: { "Retry-After": "2", "Cache-Control": "private, no-store" } },
    );
  }
  const report = loaded?.state === "ready"
    ? validationReportSchema.parse(loaded.value.report)
    : null;
  return NextResponse.json({
    run: data,
    report,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
