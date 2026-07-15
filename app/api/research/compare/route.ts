import { NextResponse } from "next/server";
import { compareOpportunities } from "@/lib/scoring";
import type { ReportOpportunity } from "@/lib/report-schema";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const body = await request.json();
  const ids: string[] = Array.isArray(body.ids) ? body.ids.slice(0, 4).map(String) : [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("run_id, report_versions(payload)")
    .in("run_id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const opportunities: ReportOpportunity[] = (data || [])
    .map((row: any) => row.report_versions?.[0]?.payload?.opportunity)
    .filter((opportunity: unknown): opportunity is ReportOpportunity => Boolean(opportunity));
  const reports = opportunities.map((opportunity) => ({
    id: opportunity.id,
    name: opportunity.name,
    scorecard: opportunity.scorecard,
  }));
  return NextResponse.json({ opportunities: compareOpportunities(reports) });
}
